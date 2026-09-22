// Reads venues whose what's-on pages publish schema.org Event data (the
// structured data sites add for Google). Name, date, price and sold-out state
// come straight from the markup, so one reader serves every such site.
//
// A venue already read by a box-office reader (Spektrix, the WordPress events
// plugin) is skipped: its own box office is the better source.
//
//   node scripts/listings/read-jsonld.mjs
//
import fs from "node:fs";
import {
  RAW, fetchText, pool, loadVenues, loadPlatforms, saveRaw,
  categoryFor, notAnEvent, isLongRun, isCinemaRun, listing, plain, distanceM,
} from "./lib.mjs";

const EVENT = /^(Event|MusicEvent|TheaterEvent|ComedyEvent|DanceEvent|ExhibitionEvent|Festival|ScreeningEvent|SportsEvent|ChildrensEvent|EducationEvent|LiteraryEvent|SocialEvent|VisualArtsEvent)$/;
const FAR_M = 1500;

const venues = loadVenues();
const platforms = loadPlatforms();
const readElsewhere = new Set();
for (const f of ["spektrix", "tribe"]) {
  const p = `${RAW}/${f}.json`;
  if (fs.existsSync(p)) for (const l of JSON.parse(fs.readFileSync(p, "utf8")).listings) readElsewhere.add(l.venueId);
}

const todo = venues.filter((v) => {
  const p = platforms[v.id];
  return p && (p.homeJsonLd || p.eventsJsonLd) && !readElsewhere.has(v.id);
});

function eventsIn(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const types = [].concat(n["@type"] ?? []);
    if (types.some((t) => EVENT.test(t))) out.push(n);
    for (const k of ["@graph", "itemListElement", "item", "subEvent", "event", "events"]) if (n[k]) walk(n[k]);
  };
  while ((m = re.exec(html))) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* malformed block */ }
  }
  return out;
}

const localIso = (s) => {
  if (!s) return "";
  const d = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // Keep the venue's local wall-clock time rather than converting to UTC.
  const m = d.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
};

function offerFacts(offers) {
  const list = [].concat(offers ?? []).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const prices = list.flatMap((o) => [o.price, o.lowPrice, o.highPrice]).map((p) => parseFloat(String(p ?? "").replace(/[^\d.]/g, ""))).filter((n) => !Number.isNaN(n));
  const avail = list.map((o) => String(o.availability ?? "")).join(" ");
  const validFrom = list.map((o) => o.validFrom).filter(Boolean).sort()[0] ?? "";
  return {
    priceFrom: prices.length ? Math.min(...prices) : "",
    priceTo: prices.length ? Math.max(...prices) : "",
    availability: /SoldOut/i.test(avail) && !/InStock|LimitedAvailability/i.test(avail) ? "sold out" : /LimitedAvailability/i.test(avail) ? "few left" : /InStock/i.test(avail) ? "available" : "",
    onSale: /PreOrder|PreSale/i.test(avail) ? "no" : /InStock|LimitedAvailability|SoldOut/i.test(avail) ? "yes" : "",
    onSaleFrom: validFrom ? String(validFrom).slice(0, 10) : "",
    url: list.map((o) => o.url).find(Boolean) ?? "",
  };
}

async function readVenue(v) {
  const p = platforms[v.id];
  const pages = [...new Set([p.eventsJsonLd && p.eventsUrl, p.homeJsonLd && (p.finalUrl || v.website)].filter(Boolean))];
  const found = [];
  for (const url of pages) found.push(...eventsIn((await fetchText(url)).text));

  const perTitle = new Map();
  for (const e of found) { const t = plain(e.name); perTitle.set(t, (perTitle.get(t) ?? 0) + 1); }
  const rows = [];
  const seen = new Set();
  for (const e of found) {
    const title = plain(e.name);
    const start = localIso(e.startDate);
    if (!title || !start || seen.has(title + start)) continue;
    seen.add(title + start);
    if (/EventCancelled/i.test(e.eventStatus ?? "")) continue;
    const loc = [].concat(e.location ?? [])[0];
    const geo = loc?.geo;
    if (geo?.latitude && distanceM(v, { lat: +geo.latitude, lng: +geo.longitude }) > FAR_M) continue;
    if (/VirtualLocation/i.test(loc?.["@type"] ?? "")) continue;
    const genre = [].concat(e["@type"]).filter((t) => t !== "Event").join(", ").replace(/Event$/, "");
    if (notAnEvent(title, genre)) continue;
    const category = categoryFor(v.kind, genre, title, plain(e.description).slice(0, 200));
    const end = localIso(e.endDate).slice(0, 10) || start.slice(0, 10);
    const performances = perTitle.get(title);
    if (isLongRun({ first: start.slice(0, 10), last: end, performances, category })) continue;
    if (isCinemaRun({ category, performances })) continue;
    const o = offerFacts(e.offers);
    const multi = end !== start.slice(0, 10);
    rows.push(listing({
      id: `jsonld:${new URL(p.finalUrl || v.website).hostname}:${start}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
      title, category, genre,
      venue: v.name, venueId: v.id,
      start: multi ? start.slice(0, 10) : start,
      runFirst: start.slice(0, 10), runLast: end, performances,
      ...o,
      room: loc?.name && plain(loc.name) !== v.name ? plain(loc.name) : "",
      note: multi ? "runs over several days" : "",
      url: e.url || o.url || p.eventsUrl || v.website,
      source: "jsonld",
    }));
  }
  return rows;
}

const results = await pool(todo, 6, readVenue);
const listings = results.flat();
saveRaw("jsonld", listings);
const withRows = results.filter((r) => r.length).length;
console.log(`${todo.length} venues publish schema.org events; ${withRows} gave upcoming events; ${listings.length} rows`);
