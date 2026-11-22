// Copies the site's performance into page_stats and place_clicks: views and search traffic per
// page from data/analytics/latest.json (written by scripts/pull-analytics.mjs), and affiliate
// clicks per page and per venue from GA4's affiliate_click event over the same window.
//
//   node scripts/pull-analytics.mjs && node scripts/db/load-site-stats.mjs
//   node scripts/db/load-site-stats.mjs path/to/latest.json     # another copy of the pull
//
// GA4 is read with the Sheets service account (the same key pull-analytics uses). Without it the
// affiliate clicks are skipped and the rest still loads. Re-runnable: keyed on (path, period end).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "./lib.mjs";

const FILE = process.argv[2] ?? "data/analytics/latest.json";
const a = JSON.parse(fs.readFileSync(FILE, "utf8"));
const { start, end } = a.window.current;
const today = new Date().toISOString().slice(0, 10);
const slugOf = (p) => p.match(/^\/articles\/([^/]+)\/?$/)?.[1] ?? null;

const pages = new Map();
const page = (p) => pages.get(p) ?? pages.set(p, { path: p, top: [] }).get(p);
for (const g of a.ga4.pages ?? []) Object.assign(page(g.path), {
  views: g.current?.views, users: g.current?.users, sessions: g.current?.sessions,
  engagement: g.current?.engagementRate, prev_views: g.previous?.views });
const gscPages = Array.isArray(a.gsc.pages) ? a.gsc.pages.map((x) => [x.path ?? x.page, x]) : Object.entries(a.gsc.pages ?? {});
for (const [p, g] of gscPages) Object.assign(page(p), { clicks: g.clicks, impressions: g.impressions, ctr: g.ctr, position: g.position });
for (const q of a.gsc.pageQueries ?? []) {
  const pg = page(q.path);
  pg.top.push({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.position });
}
for (const pg of pages.values()) pg.top = pg.top.sort((x, y) => y.impressions - x.impressions).slice(0, 10);

// affiliate clicks from GA4, if the service account key is reachable
const venueClicks = [];
try {
  let KEY_PATH;
  for (const p of ["../sheets.mjs", "../scripts/sheets.mjs", "../../scripts/sheets.mjs"]) {
    const f = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), p);
    if (fs.existsSync(f)) { ({ KEY_PATH } = await import(pathToFileURL(f).href)); break; }
  }
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
  const data = google.analyticsdata({ version: "v1beta", auth });
  const res = await data.properties.runReport({
    property: `properties/${process.env.GA4_PROPERTY_ID ?? "548094096"}`,
    requestBody: { dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "pagePath" }, { name: "customEvent:venue" }], metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "affiliate_click" } } }, limit: 10000 } });
  for (const r of res.data.rows ?? []) {
    const [p, venue] = r.dimensionValues.map((d) => d.value);
    const n = Number(r.metricValues[0].value);
    page(p).affiliate = (page(p).affiliate ?? 0) + n;
    if (venue && venue !== "(not set)") venueClicks.push({ venue, path: p, clicks: n });
  }
  console.log(`affiliate clicks: ${venueClicks.reduce((s, v) => s + v.clicks, 0)} across ${venueClicks.length} venue and page pairs`);
} catch (e) { console.log(`affiliate clicks skipped: ${e.message}`); }

const client = await connect();
await client.query("begin");
for (const p of pages.values()) {
  await client.query(
    `insert into page_stats (path, article_slug, period_start, period_end, views, users, sessions, engagement_rate, prev_views,
       search_clicks, search_impressions, search_ctr, search_position, top_queries, affiliate_clicks, last_checked)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (path, period_end) do update set views = excluded.views, users = excluded.users, sessions = excluded.sessions,
       engagement_rate = excluded.engagement_rate, prev_views = excluded.prev_views, search_clicks = excluded.search_clicks,
       search_impressions = excluded.search_impressions, search_ctr = excluded.search_ctr, search_position = excluded.search_position,
       top_queries = excluded.top_queries, affiliate_clicks = excluded.affiliate_clicks, last_checked = excluded.last_checked`,
    [p.path, slugOf(p.path), start, end, p.views ?? null, p.users ?? null, p.sessions ?? null, p.engagement ?? null,
     p.prev_views ?? null, p.clicks ?? null, p.impressions ?? null, p.ctr ?? null, p.position ?? null,
     JSON.stringify(p.top), p.affiliate ?? 0, today]);
}
for (const v of venueClicks) {
  await client.query(
    `insert into place_clicks (venue, path, period_end, clicks) values ($1,$2,$3,$4)
     on conflict (venue, path, period_end) do update set clicks = excluded.clicks`, [v.venue, v.path, end, v.clicks]);
}
await client.query(`
  update place_clicks c set place_id = (select p.id from places p where p.duplicate_of is null
      and (p.slug = c.venue or name_core(p.name) = name_core(c.venue)) order by p.recommended desc, p.parent_id nulls first, p.id limit 1)
  where c.place_id is null`);
await client.query("commit");
console.log(`${pages.size} pages for ${start} to ${end}`);
const top = await client.query(`select slug, views, search_clicks, affiliate_clicks from article_performance
  where period_end = $1 order by views desc nulls last limit 15`, [end]);
console.table(top.rows);
await client.end();
