// Reads DICE-ticketed events at venues whose own sites link to DICE.
//
// DICE has no public venue feed (its API needs a partner key), but every DICE
// event page carries schema.org data: name, start, price range, sold-out state
// and the venue's coordinates. So the reader collects the dice.fm/event/ links
// from each venue's what's-on page and reads those pages.
//
// Event pages are cached in work/listings/dice-cache.json for three days, since
// each one is ~300 KB and the facts that change (sold out) are not hourly.
//
//   node scripts/listings/read-dice.mjs
//
import fs from "node:fs";
import {
  RAW, fetchText, pool, loadVenues, loadPlatforms, saveRaw,
  categoryFor, notAnEvent, listing, plain, distanceM,
} from "./lib.mjs";

const CACHE = "work/listings/dice-cache.json";
const MAX_AGE_MS = 3 * 86400000;
const FAR_M = 1500;

const venues = loadVenues();
const platforms = loadPlatforms();
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

// Venues already read from their own box office are left to that reader.
const readElsewhere = new Set();
for (const f of ["spektrix", "tribe"]) {
  const p = `${RAW}/${f}.json`;
  if (fs.existsSync(p)) for (const l of JSON.parse(fs.readFileSync(p, "utf8")).listings) readElsewhere.add(l.venueId);
}
const todo = venues.filter((v) => platforms[v.id]?.platforms?.includes("dice") && !readElsewhere.has(v.id));

function diceLinks(html) {
  const out = new Set();
  for (const m of html.matchAll(/https?:\/\/dice\.fm\/(?:partner\/tickets\/)?event\/([a-z0-9]+-[a-z0-9-]+)/gi)) {
    out.add(`https://dice.fm/event/${m[1].toLowerCase()}`);
  }
  return [...out];
}

function eventFrom(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1]);
      if (/Event$/.test([].concat(j["@type"])[0] ?? "")) return j;
    } catch { /* skip */ }
  }
  return null;
}

async function readEvent(url) {
  const hit = cache[url];
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.e;
  const { text } = await fetchText(url);
  const e = eventFrom(text);
  const slim = e && {
    name: e.name, type: [].concat(e["@type"])[0], startDate: e.startDate, endDate: e.endDate,
    status: e.eventStatus, offers: e.offers, location: e.location,
    description: plain(e.description).slice(0, 300),
  };
  cache[url] = { at: Date.now(), e: slim };
  return slim;
}

const rows = [];
let linked = 0;
for (const v of todo) {
  const p = platforms[v.id];
  const pages = [...new Set([p.eventsUrl, p.finalUrl || v.website].filter(Boolean))];
  let links = [];
  for (const u of pages) links.push(...diceLinks((await fetchText(u)).text));
  links = [...new Set(links)];
  if (links.length) linked++;
  const events = await pool(links, 4, readEvent);
  links.forEach((url, i) => {
    const e = events[i];
    if (!e?.startDate) return;
    if (/Cancelled|Postponed/i.test(e.status ?? "")) return;
    const geo = e.location?.geo;
    // A venue site sometimes promotes a DICE event somewhere else.
    if (geo?.latitude && distanceM(v, { lat: +geo.latitude, lng: +geo.longitude }) > FAR_M) return;
    const title = plain(e.name);
    const genre = (e.type ?? "").replace(/Event$/, "");
    if (notAnEvent(title)) return;
    const o = e.offers ?? {};
    const lo = parseFloat(o.lowPrice ?? o.price), hi = parseFloat(o.highPrice ?? o.price);
    const avail = String(o.availability ?? "");
    const start = String(e.startDate).slice(0, 16);
    rows.push(listing({
      id: `dice:${url.split("/event/")[1].split("-")[0]}`,
      title, category: categoryFor(v.kind, genre === "Music" ? "music" : genre, title, e.description),
      genre, venue: v.name, venueId: v.id,
      start, runFirst: start.slice(0, 10), runLast: start.slice(0, 10), performances: 1,
      priceFrom: Number.isNaN(lo) ? "" : lo, priceTo: Number.isNaN(hi) ? "" : hi,
      onSale: /PreOrder/i.test(avail) ? "no" : avail ? "yes" : "",
      availability: /SoldOut/i.test(avail) ? "sold out" : /Limited/i.test(avail) ? "few left" : /InStock/i.test(avail) ? "available" : "",
      url, source: "dice",
    }));
  });
}

fs.writeFileSync(CACHE, JSON.stringify(cache));
saveRaw("dice", rows);
console.log(`${todo.length} DICE venues; ${linked} link to DICE events from their own pages; ${rows.length} rows`);
