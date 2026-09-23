// Reads venues whose websites run The Events Calendar, the most common
// WordPress events plugin. It publishes a JSON feed at
// /wp-json/tribe/events/v1/events with dates, prices and categories.
//
// Plenty of sites run the plugin without it showing in their page markup, so
// every venue site is tried once and the answer cached in platforms.json
// (tribeApi: true/false). --recheck tries them all again.
//
//   node scripts/listings/read-tribe.mjs [--recheck]
//
import fs from "node:fs";
import {
  TODAY, fetchJson, pool, loadVenues, loadPlatforms, saveRaw,
  categoryFor, notAnEvent, isLongRun, isCinemaRun, listing, plain, priceRange, distanceM,
} from "./lib.mjs";

const PLATFORMS = "data/listings/platforms.json";
const RECHECK = process.argv.includes("--recheck");
const MAX_PAGES = 20;
const FAR_M = 1500; // an event the site lists at another address this far away is not at this venue

const venues = loadVenues();
const platforms = loadPlatforms();
const origin = (u) => { try { return new URL(u).origin; } catch { return ""; } };

// Several venues can share a site (a gallery inside an arts trust): one read each.
const sites = new Map();
for (const v of venues) {
  const p = platforms[v.id];
  if (!p?.platforms) continue; // the site could not be read at all
  const o = origin(p.finalUrl || v.website);
  if (!o) continue;
  if (!sites.has(o)) sites.set(o, { origin: o, venue: v, p });
}

async function readSite(site) {
  const { origin: o, venue, p } = site;
  if (!RECHECK && p.tribeApi === false) return { rows: [] };
  const url = (page) => `${o}/wp-json/tribe/events/v1/events?start_date=${TODAY}&per_page=50&page=${page}`;
  const first = await fetchJson(url(1));
  p.tribeApi = Array.isArray(first.json?.events);
  if (!p.tribeApi) return { rows: [] };

  const events = [...first.json.events];
  const pages = Math.min(first.json.total_pages ?? 1, MAX_PAGES);
  for (let n = 2; n <= pages; n++) {
    const r = await fetchJson(url(n));
    if (!Array.isArray(r.json?.events)) break;
    events.push(...r.json.events);
  }

  const rows = [];
  const skipped = { notEvent: 0, elsewhere: 0, longRun: 0, cinema: 0 };
  // Recurring events arrive as one entry per date; count them by title.
  const perTitle = new Map();
  for (const e of events) {
    const t = plain(e.title);
    perTitle.set(t, (perTitle.get(t) ?? 0) + 1);
  }
  for (const e of events) {
    const title = plain(e.title);
    const genre = (e.categories ?? []).map((c) => plain(c.name)).join(", ");
    if (notAnEvent(title, genre)) { skipped.notEvent++; continue; }
    const ev = e.venue && !Array.isArray(e.venue) ? e.venue : null;
    if (ev?.geo_lat && distanceM(venue, { lat: +ev.geo_lat, lng: +ev.geo_lng }) > FAR_M) { skipped.elsewhere++; continue; }
    if (ev && !ev.geo_lat && /online|zoom|virtual/i.test(ev.venue ?? "")) { skipped.elsewhere++; continue; }
    const category = categoryFor(venue.kind, genre, title);
    const startDay = e.start_date.slice(0, 10), endDay = e.end_date?.slice(0, 10) ?? startDay;
    const performances = perTitle.get(title);
    // Long runs are kept but marked: they go to the Long Runs tab, not the page.
    const longRun = isLongRun({ first: startDay, last: endDay, performances, category });
    if (longRun) skipped.longRun++;
    if (isCinemaRun({ category, performances })) { skipped.cinema++; continue; }
    const values = (e.cost_details?.values ?? []).map(Number).filter((n) => !Number.isNaN(n));
    const [lo, hi] = values.length ? [Math.min(...values), Math.max(...values)] : priceRange(e.cost);
    rows.push(listing({
      id: `tribe:${new URL(o).hostname}:${e.id}`,
      title, category, genre,
      venue: venue.name, venueId: venue.id,
      start: e.all_day ? startDay : e.start_date.replace(" ", "T").slice(0, 16),
      runFirst: startDay, runLast: endDay, performances,
      priceFrom: lo ?? "", priceTo: hi ?? "",
      room: ev?.venue && plain(ev.venue) !== venue.name ? plain(ev.venue) : "",
      note: startDay !== endDay ? "runs over several days" : "",
      url: e.url,
      source: "tribe",
      longRun,
    }));
  }
  return { rows, skipped, site: o };
}

const results = await pool([...sites.values()], 8, readSite);
fs.writeFileSync(PLATFORMS, JSON.stringify(platforms, null, 1) + "\n");

const listings = results.flatMap((r) => r.rows);
const withApi = results.filter((r) => r.site);
const skipped = { notEvent: 0, elsewhere: 0, longRun: 0, cinema: 0 };
for (const r of results) for (const k in skipped) skipped[k] += r.skipped?.[k] ?? 0;
saveRaw("tribe", listings, { sites: withApi.map((r) => r.site) });
console.log(`${withApi.length} of ${sites.size} sites run the events plugin; ${listings.length} rows`);
console.log(`left out: ${JSON.stringify(skipped)}`);
