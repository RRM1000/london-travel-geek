// Which guides actually get traffic, so effort goes where it is read.
//
// Filling the Hotels.com URL column is manual - there is no product feed, see
// scripts/cj-product-feed.mjs - so it is worth doing for the guides people
// reach and not worth doing for the rest. This ranks area guides by Search
// Console impressions and reports the hotels sitting on each.
//
//   node scripts/top-guides.mjs [days]
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const SITE_DOMAIN = "londontravelgeek.co.uk";
const DAYS = Number(process.argv[2] ?? 90);
const iso = (d) => d.toISOString().slice(0, 10);

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const sc = google.searchconsole({ version: "v1", auth: await auth.getClient() });
const sites = (await sc.sites.list()).data.siteEntry ?? [];
const mine = sites.filter((s) => s.siteUrl.includes(SITE_DOMAIN));
const site = (mine.find((s) => s.siteUrl.startsWith("sc-domain:")) ?? mine[0]).siteUrl;

const end = new Date(Date.now() - 2 * 864e5);
const start = new Date(end.getTime() - DAYS * 864e5);
const res = await sc.searchanalytics.query({
  siteUrl: site,
  requestBody: {
    startDate: iso(start), endDate: iso(end),
    dimensions: ["page"], rowLimit: 2000, dataState: "final",
  },
});

const byId = new Map();
for (const r of res.data.rows ?? []) {
  const m = r.keys[0].match(/\/articles\/([^/]+)\//);
  if (!m) continue;
  byId.set(m[1], { clicks: r.clicks, impressions: r.impressions, pos: Math.round(r.position * 10) / 10 });
}

const hotels = JSON.parse(fs.readFileSync("src/data/hotels.json", "utf8")).hotels;
const perGuide = {};
for (const h of hotels) if (h.guide) (perGuide[h.guide] ??= []).push(h);

const rows = Object.entries(perGuide)
  .map(([guide, list]) => ({ guide, list, ...(byId.get(guide) ?? { clicks: 0, impressions: 0, pos: 0 }) }))
  .sort((a, b) => b.impressions - a.impressions || b.list.length - a.list.length);

console.log(`${site}  last ${DAYS} days\n`);
console.log("GUIDE".padEnd(34) + "IMPR".padStart(7) + "CLICKS".padStart(8) + "HOTELS".padStart(8));
let running = 0;
for (const r of rows) {
  running += r.list.length;
  console.log(
    r.guide.replace("-area-guide", "").padEnd(34) +
      String(r.impressions).padStart(7) + String(r.clicks).padStart(8) +
      String(r.list.length).padStart(8) + `   (${running} cumulative)`,
  );
}

// The cut: enough guides to cover ~30 hotels, taken from the top by impressions.
const picked = [];
for (const r of rows) {
  if (picked.length >= 30) break;
  for (const h of r.list) if (picked.length < 30) picked.push({ ...h, guide: r.guide, impressions: r.impressions });
}
fs.writeFileSync("data/hotels-url-todo.json", JSON.stringify(picked.map((h) => ({ slug: h.slug, name: h.name, guide: h.guide })), null, 1));
console.log(`\n${picked.length} hotels written to data/hotels-url-todo.json, from the ${new Set(picked.map((p) => p.guide)).size} best-read guides`);
