// Reads every Spektrix venue's box office: events, performances, prices,
// on-sale dates and seats left.
//
// Spektrix is the ticketing system behind a large share of London's theatres
// and arts centres, and its public web API (the one its own booking widgets
// call) answers without a key:
//   /api/v3/events?instanceStart_from=DATE     the shows
//   /api/v3/instances?startFrom=DATE           each performance, with the
//                                              date it went on sale online
//   /api/v3/instances/ID/price-list            prices
//   /api/v3/instances/ID/status                seats available and capacity
//
// The client name comes from the venue's own page: Spektrix's web components
// carry client-name="..." and custom-domain="...".
//
//   node scripts/listings/read-spektrix.mjs
//
import fs from "node:fs";
import {
  TODAY, fetchText, fetchJson, pool, loadVenues, loadPlatforms, saveRaw,
  categoryFor, notAnEvent, isLongRun, isTimedEntry, isCinemaRun, listing,
} from "./lib.mjs";

const PLATFORMS = "data/listings/platforms.json";
const STATUS_DAYS = 120; // seats-left is fetched per performance, so only for the next four months

const venues = loadVenues();
const platforms = loadPlatforms();
const byId = new Map(venues.map((v) => [v.id, v]));

// --- find each venue's client name ---------------------------------------
const candidates = Object.entries(platforms)
  .filter(([, p]) => p.platforms?.includes("spektrix"))
  .map(([id, p]) => ({ id, p, v: byId.get(id) }))
  .filter((c) => c.v);

// Pages that load Spektrix's scripts without naming the client: the name is
// then usually the site's domain (bushtheatre.co.uk -> bushtheatre) or the
// venue's name run together. A guess only counts if the API answers to it.
const apiAnswers = async (c) =>
  (await fetchText(`https://system.spektrix.com/${c}/api/v3/events?instanceStart_from=${TODAY}`, { accept: "application/json" })).status === 200;

function guesses(v, p) {
  const out = [];
  try { out.push(new URL(p.finalUrl || v.website).hostname.replace(/^www\./, "").split(".")[0]); } catch { /* no url */ }
  const squashed = v.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  out.push(squashed, squashed.replace(/museum$|hall$/, ""), `the${squashed}`);
  return [...new Set(out.filter((g) => g.length > 2))];
}

await pool(candidates, 6, async ({ p, v }) => {
  if (p.spektrix?.client) return;
  for (const url of [p.eventsUrl, p.finalUrl].filter(Boolean)) {
    const { text } = await fetchText(url);
    const client = text.match(/client-name=["']([a-z0-9]+)["']/i)?.[1]
      ?? text.match(/system\.spektrix\.com\/([a-z0-9]+)\//i)?.[1]
      ?? text.match(/\/([a-z0-9]+)\/website\/(?:EventDetails|ChooseSeats|secure)/i)?.[1];
    if (client && (await apiAnswers(client.toLowerCase()))) {
      p.spektrix = { client: client.toLowerCase(), domain: text.match(/custom-domain=["']([^"']+)["']/i)?.[1] ?? "" };
      return;
    }
  }
  for (const g of guesses(v, p)) {
    if (await apiAnswers(g)) { p.spektrix = { client: g, domain: "", guessed: true }; return; }
  }
  p.spektrix = { client: "" };
});
fs.writeFileSync(PLATFORMS, JSON.stringify(platforms, null, 1) + "\n");

// Several OSM venues can share one box office (the Barbican's hall, theatre
// and gallery); read each client once, credited to the first venue found.
const clients = new Map();
for (const c of candidates) {
  const k = c.p.spektrix?.client;
  if (!k) continue;
  if (!clients.has(k)) clients.set(k, { client: k, venue: c.v, eventsUrl: c.p.eventsUrl || c.v.website, also: [] });
  else clients.get(k).also.push(c.v.name);
}
const unresolved = candidates.filter((c) => !c.p.spektrix?.client).map((c) => c.v.name);
console.log(`${clients.size} Spektrix box offices (${unresolved.length} venues with no client name found)`);

// --- read each box office -------------------------------------------------
const horizon = new Date(Date.now() + STATUS_DAYS * 86400000).toISOString().slice(0, 10);

// Link each show to its page on the venue's site when the what's-on page has a
// link whose text is the show's name; otherwise the what's-on page itself.
function pageLinks(html, base) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    if (text.length < 3) continue;
    try { links.push({ href: new URL(m[1], base).toString(), text }); } catch { /* skip */ }
  }
  return links;
}
const cleanName = (n) => n.replace(/^\s*\d{4}\s*:\s*/, "").replace(/\s+/g, " ").trim();

async function readClient({ client, venue, eventsUrl }) {
  const base = `https://system.spektrix.com/${client}/api/v3`;
  const [ev, inst, page] = await Promise.all([
    fetchJson(`${base}/events?instanceStart_from=${TODAY}`, { timeout: 120000 }),
    fetchJson(`${base}/instances?startFrom=${TODAY}`, { timeout: 120000 }),
    fetchText(eventsUrl),
  ]);
  if (!Array.isArray(ev.json) || !Array.isArray(inst.json)) return { client, error: `events ${ev.status} instances ${inst.status}`, rows: [] };

  const links = pageLinks(page.text, page.url || eventsUrl);
  const events = new Map(ev.json.map((e) => [e.id, e]));
  const perEvent = new Map();
  for (const i of inst.json) {
    if (i.cancelled || !events.has(i.event?.id)) continue;
    if (!perEvent.has(i.event.id)) perEvent.set(i.event.id, []);
    perEvent.get(i.event.id).push(i);
  }

  // One price list serves many performances: fetch each once.
  const priceLists = new Map();
  for (const list of perEvent.values()) for (const i of list) {
    const pl = i.priceList?.id;
    if (pl && !priceLists.has(pl)) priceLists.set(pl, i.id);
  }
  const prices = new Map();
  await pool([...priceLists], 4, async ([pl, instId]) => {
    const { json } = await fetchJson(`${base}/instances/${instId}/price-list`);
    const amounts = (json?.prices ?? []).map((p) => p.amount).filter((a) => a > 0);
    if (amounts.length) prices.set(pl, [Math.min(...amounts), Math.max(...amounts)]);
  });

  const rows = [];
  const skipped = { notEvent: 0, longRun: 0, cinema: 0 };
  const statusWanted = [];
  for (const [eid, list] of perEvent) {
    const e = events.get(eid);
    const title = cleanName(e.name);
    // Each box office names its own attributes (Genre1, WebsiteFilterCategory2,
    // Type...); anything that reads like a genre label is used.
    const attrs = (re) => [...new Set(Object.entries(e)
      .filter(([k, v]) => k.startsWith("attribute_") && re.test(k) && typeof v === "string" && v && v.length < 40)
      .map(([, v]) => v.trim()))];
    const genre = attrs(/genre|categor|type|preference|filter/i).join(", ");
    const room = attrs(/venue|location/i).filter((v) => !/^(n\/a|tbc|participation)$/i.test(v))[0] ?? "";
    if (notAnEvent(title, genre)) { skipped.notEvent++; continue; }
    const category = categoryFor(venue.kind, genre, title);
    list.sort((a, b) => a.start.localeCompare(b.start));
    const first = e.firstInstanceDateTime?.slice(0, 10) ?? list[0].start.slice(0, 10);
    const last = e.lastInstanceDateTime?.slice(0, 10) ?? list.at(-1).start.slice(0, 10);
    if (isLongRun({ first, last, performances: list.length, category })) { skipped.longRun++; continue; }
    if (isCinemaRun({ category, performances: list.length })) { skipped.cinema++; continue; }
    const link = links.find((l) => l.text === title.toLowerCase()) ?? links.find((l) => l.text.startsWith(title.toLowerCase()));
    // A timed-entry exhibition becomes a single row for the whole run.
    const timed = isTimedEntry(list.map((i) => i.start));
    const shown = timed ? [list[0]] : list;
    for (const i of shown) {
      const pr = prices.get(i.priceList?.id);
      const access = [
        i.attribute_AudioDescribedPerformance && "audio described",
        i.attribute_BSLPerformance && "BSL",
        i.attribute_CaptionedPerformance && "captioned",
        i.attribute_RelaxedPerformance && "relaxed",
      ].filter(Boolean).join(", ");
      const row = listing({
        id: `spektrix:${client}:${i.id}`,
        title, category, genre,
        venue: venue.name, venueId: venue.id,
        start: i.start.slice(0, 16),
        runFirst: first, runLast: last, performances: list.length,
        priceFrom: pr?.[0] ?? "", priceTo: pr?.[1] ?? "",
        onSale: i.isOnSale ? "yes" : "no",
        onSaleFrom: i.startSellingAtWeb?.slice(0, 10) ?? "",
        access,
        room,
        note: timed ? "timed entry" : typeof i.attribute_SpecialEvents === "string" ? i.attribute_SpecialEvents : "",
        url: link?.href ?? eventsUrl,
        source: "spektrix",
      });
      if (timed) row.id = `spektrix:${client}:event:${eid}`;
      rows.push(row);
      if (!timed && row.start.slice(0, 10) <= horizon) statusWanted.push([row, i.id]);
    }
  }

  await pool(statusWanted, 4, async ([row, instId]) => {
    const { json } = await fetchJson(`${base}/instances/${instId}/status`);
    if (!json || typeof json.available !== "number" || !json.capacity) return;
    row.availability = json.available === 0 ? "sold out" : json.available / json.capacity < 0.1 ? "few left" : "available";
  });

  return { client, rows, skipped };
}

const results = await pool([...clients.values()], 4, readClient);
const listings = results.flatMap((r) => r.rows);
const errors = results.filter((r) => r.error).map((r) => `${r.client}: ${r.error}`);
const skipped = { notEvent: 0, longRun: 0, cinema: 0 };
for (const r of results) for (const k in skipped) skipped[k] += r.skipped?.[k] ?? 0;

saveRaw("spektrix", listings, { clients: [...clients.keys()], errors, unresolved });
console.log(`${listings.length} rows from ${results.length - errors.length} box offices; left out ${skipped.notEvent} non-events, ${skipped.longRun} long runs, ${skipped.cinema} cinema runs`);
if (errors.length) console.log(`errors: ${errors.join("; ")}`);
