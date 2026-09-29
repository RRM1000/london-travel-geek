// How one article is doing in Google: the searches it appears for, its
// average position, and clicks, from Search Console, plus a week-by-week trend.
// Search Console runs about three days behind.
//
//   node scripts/page-ranking.mjs best-street-food-london [days=28]
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const slug = process.argv[2];
const days = Number(process.argv[3] ?? 28);
if (!slug) throw new Error("usage: node scripts/page-ranking.mjs <article-slug> [days]");

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const sc = google.searchconsole({ version: "v1", auth });
const sites = (await sc.sites.list()).data.siteEntry ?? [];
const mine = sites.filter((s) => s.siteUrl.includes("londontravelgeek.co.uk"));
const siteUrl = (mine.find((s) => s.siteUrl.startsWith("sc-domain:")) ?? mine[0]).siteUrl;

const iso = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 3 * 864e5);
const start = new Date(end - (days - 1) * 864e5);
const pageFilter = { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: `/articles/${slug}/` }] }] };
const q = async (body) =>
  (await sc.searchanalytics.query({ siteUrl, requestBody: { startDate: iso(start), endDate: iso(end), rowLimit: 500, ...pageFilter, ...body } })).data.rows ?? [];

const [total] = await q({});
console.log(`/articles/${slug}/  ${iso(start)} to ${iso(end)}`);
if (!total) { console.log("No search impressions in that window."); process.exit(0); }
console.log(`clicks ${total.clicks}  impressions ${total.impressions}  CTR ${(total.ctr * 100).toFixed(1)}%  avg position ${total.position.toFixed(1)}\n`);

console.log("By week:");
const byDay = await q({ dimensions: ["date"] });
const weeks = new Map();
for (const r of byDay) {
  const d = new Date(r.keys[0]);
  const wk = iso(new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5));
  const w = weeks.get(wk) ?? { c: 0, i: 0, p: 0 };
  w.c += r.clicks; w.i += r.impressions; w.p += r.position * r.impressions;
  weeks.set(wk, w);
}
for (const [wk, w] of [...weeks].sort()) console.log(`  w/c ${wk}  clicks ${String(w.c).padStart(3)}  impr ${String(w.i).padStart(5)}  pos ${(w.p / w.i).toFixed(1)}`);

console.log("\nTop searches (by impressions):");
const queries = (await q({ dimensions: ["query"] })).sort((a, b) => b.impressions - a.impressions);
for (const r of queries.slice(0, 30))
  console.log(`  ${String(r.impressions).padStart(5)} impr  ${String(r.clicks).padStart(3)} clicks  pos ${r.position.toFixed(1).padStart(5)}  ${r.keys[0]}`);

console.log("\nBy country (top 8):");
for (const r of (await q({ dimensions: ["country"] })).sort((a, b) => b.impressions - a.impressions).slice(0, 8))
  console.log(`  ${r.keys[0]}  impr ${r.impressions}  clicks ${r.clicks}  pos ${r.position.toFixed(1)}`);
