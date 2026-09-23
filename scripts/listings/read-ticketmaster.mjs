// Reads Ticketmaster's Discovery API: arenas, stadiums, the big gig venues,
// comedy tours and sport, with public on-sale and presale dates.
//
// Needs TICKETMASTER_API_KEY in .env.local (the "Consumer Key" from
// developer.ticketmaster.com > My Apps). The free key allows 5,000 calls a
// day at 5 a second; a full run uses a few hundred.
//
// The API will not page past 1,000 results for one query, so the next 18
// months are read in date windows, and any window holding more than 1,000
// events is split in half until it fits.
//
// Every event arrives with its venue's coordinates. It is kept if the venue
// is in zones 1-2 (by nearest station) or is one of the big venues further
// out; matched to a venue in our list where one is close by, so the same
// show from a venue's own box office merges with it.
//
//   node scripts/listings/read-ticketmaster.mjs
//
import fs from "node:fs";
import {
  TODAY, fetchJson, loadVenues, saveRaw, envKey, nearestStation, inZones12, matchVenue,
  categoryFor, notAnEvent, isLongRun, isCinemaRun, isTimedEntry, listing,
} from "./lib.mjs";

const KEY = envKey("TICKETMASTER_API_KEY");
if (!KEY) {
  console.log("No TICKETMASTER_API_KEY in .env.local - skipping Ticketmaster.");
  process.exit(0);
}

const MONTHS = 18;
const CENTRE = "51.5074,-0.1278"; // Charing Cross
const RADIUS_KM = 25;              // reaches Wembley, Twickenham and Wimbledon
const venues = loadVenues();
const bigOutside = venues.filter((v) => v.scope === "big venue outside");

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const q = new URLSearchParams({
    apikey: KEY, latlong: CENTRE, radius: String(RADIUS_KM), unit: "km", countryCode: "GB",
    size: "200", sort: "date,asc", locale: "*", ...params,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(250); // stays under 5 a second
    calls++;
    const r = await fetchJson(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, { timeout: 60000 });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status !== 200) throw new Error(`Ticketmaster ${r.status}`);
    return r.json;
  }
  throw new Error("Ticketmaster kept rate-limiting");
}

const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
async function readWindow(from, to, out) {
  const first = await api({ startDateTime: iso(from), endDateTime: iso(to), page: "0" });
  const total = first.page?.totalElements ?? 0;
  if (total > 1000 && to - from > 3600000) {
    const mid = new Date((+from + +to) / 2);
    await readWindow(from, mid, out);
    await readWindow(mid, to, out);
    return;
  }
  out.push(...(first._embedded?.events ?? []));
  const pages = Math.min(first.page?.totalPages ?? 1, 5);
  for (let p = 1; p < pages; p++) {
    const r = await api({ startDateTime: iso(from), endDateTime: iso(to), page: String(p) });
    out.push(...(r._embedded?.events ?? []));
  }
}

const raw = [];
const start = new Date(`${TODAY}T00:00:00Z`);
for (let m = 0; m < MONTHS; m++) {
  const from = new Date(start); from.setUTCMonth(from.getUTCMonth() + m);
  const to = new Date(start); to.setUTCMonth(to.getUTCMonth() + m + 1);
  await readWindow(from, to, raw);
}

// The same event can land in two windows at a boundary.
const events = [...new Map(raw.map((e) => [e.id, e])).values()];

// --- place each event ------------------------------------------------------
const placed = [];
const skipped = { outside: 0, noVenue: 0, notEvent: 0, cancelled: 0, longRun: 0, cinema: 0 };
for (const e of events) {
  const tv = e._embedded?.venues?.[0];
  const lat = +tv?.location?.latitude, lng = +tv?.location?.longitude;
  if (!tv || !lat) { skipped.noVenue++; continue; }
  // Ticketmaster files some products under stand-in venues ("Ticketmaster",
  // "Tmuk Overseas Post", a whole borough) sitting on a default map pin.
  // Nothing there is a place to go.
  if (/^(ticketmaster|tmuk|city of |london borough|greater london|online|virtual|tba|tbc)\b/i.test(tv.name)) { skipped.noVenue++; continue; }
  const p = { lat, lng };
  const st = nearestStation(p);
  const ours = matchVenue(venues, tv.name, p);
  const big = !ours && bigOutside.find((v) => Math.hypot(v.lat - lat, (v.lng - lng) * 0.62) * 111000 < 600);
  if (!ours && !big && !inZones12(st.zone)) { skipped.outside++; continue; }
  if (ours && ours.scope === "outside") { skipped.outside++; continue; }
  placed.push({ e, tv, venue: ours ?? big, st });
}

// Count performances per show at each venue, to spot long runs.
const runKey = ({ e, tv }) => `${tv.id}|${e.name.toLowerCase()}`;
const runs = new Map();
for (const x of placed) {
  const k = runKey(x);
  const d = x.e.dates?.start?.localDate;
  if (!runs.has(k)) runs.set(k, []);
  if (d) runs.get(k).push(d);
}

const rows = [];
for (const x of placed) {
  const { e, tv, venue, st } = x;
  const status = e.dates?.status?.code ?? "";
  if (/cancelled|postponed/i.test(status)) { skipped.cancelled++; continue; }
  const c = (e.classifications ?? []).find((k) => k.primary) ?? e.classifications?.[0] ?? {};
  const genre = [c.segment?.name, c.genre?.name, c.subGenre?.name].filter((g) => g && g !== "Undefined" && g !== "Other").join(", ");
  if (notAnEvent(e.name) || /\b(parking|car park|hospitality upgrade|fast lane|merch)\b/i.test(e.name)) { skipped.notEvent++; continue; }
  const kind = venue?.kind ?? "";
  const category = /^Sports/.test(genre) ? "sport" : categoryFor(kind, genre.replace(/^(Music|Arts & Theatre|Miscellaneous), ?/, "") || genre, e.name);
  const dates = runs.get(runKey(x)).sort();
  // Long runs are kept but marked: they go to the Long Runs tab, not the page.
  const longRun = isLongRun({ first: dates[0], last: dates.at(-1), performances: dates.length, category });
  if (longRun) skipped.longRun++;
  if (isCinemaRun({ category, performances: dates.length })) { skipped.cinema++; continue; }

  const date = e.dates?.start?.localDate;
  if (!date) continue;
  const time = e.dates.start.noSpecificTime || e.dates.start.timeTBA ? "" : (e.dates.start.localTime ?? "").slice(0, 5);
  const pub = e.sales?.public?.startDateTime ? new Date(e.sales.public.startDateTime) : null;
  const now = new Date();
  const presales = (e.sales?.presales ?? [])
    .filter((ps) => ps.startDateTime && new Date(ps.endDateTime ?? ps.startDateTime) > now)
    .map((ps) => `${ps.name ?? "presale"} ${ps.startDateTime.slice(0, 10)}`);
  const price = (e.priceRanges ?? []).filter((r) => r.currency === "GBP");
  rows.push(listing({
    id: `ticketmaster:${e.id}`,
    title: e.name, category, genre,
    venue: venue?.name ?? tv.name, venueId: venue?.id ?? `tm-${tv.id}`,
    zone: st.zone, station: st.name,
    start: time ? `${date}T${time}` : date,
    runFirst: dates[0], runLast: dates.at(-1), performances: dates.length,
    priceFrom: price.length ? Math.min(...price.map((r) => r.min)) : "",
    priceTo: price.length ? Math.max(...price.map((r) => r.max)) : "",
    onSale: status === "onsale" ? "yes" : pub && pub > now ? "no" : status === "offsale" ? "off sale" : "",
    onSaleFrom: pub ? e.sales.public.startDateTime.slice(0, 10) : "",
    availability: status === "offsale" && pub && pub < now ? "sold out or off sale" : "",
    note: presales.length ? `Presale: ${presales.join("; ")}` : "",
    url: e.url,
    source: "ticketmaster",
    longRun,
  }));
}

// A timed-entry exhibition (half-hourly slots) becomes one row for the run.
const groups = new Map();
for (const r of rows) {
  const k = `${r.venueId}|${r.title.toLowerCase()}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const out = [];
for (const g of groups.values()) {
  if (!isTimedEntry(g.map((r) => r.start))) { out.push(...g); continue; }
  g.sort((a, b) => a.start.localeCompare(b.start));
  out.push({ ...g[0], id: `${g[0].id}:run`, start: g[0].runFirst, note: "timed entry", onSaleFrom: "" });
}
rows.length = 0;
rows.push(...out);

saveRaw("ticketmaster", rows, { calls });
const matched = rows.filter((r) => !r.venueId.startsWith("tm-")).length;
console.log(`${events.length} Ticketmaster events within ${RADIUS_KM} km in ${calls} calls; ${rows.length} kept (${matched} at venues in our list)`);
console.log(`left out: ${JSON.stringify(skipped)}`);
