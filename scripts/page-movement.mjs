// Per-page movement: Search Console position and clicks, last 7 days against
// the 7 before, plus GA4 views day by day for the recent days so a fall can be
// pinned to a page and a date.
//
//   node scripts/page-movement.mjs
//
// Read-only, both APIs free.
//
// CAVEAT THE OUTPUT REPEATS: Search Console lags 2-3 days, so its "last 7
// days" cannot include the two most recent. GA4 is current but its last
// 24-48h are still processing. The two therefore end on different dates on
// purpose - GSC answers "did rankings move", GA4 answers "what did traffic do
// yesterday", and only the first is settled.

import { google } from "googleapis";
import { KEY_PATH } from "./sheets.mjs";
import fs from "node:fs";

const PROPERTY = process.env.GA4_PROPERTY_ID ?? "548094096";
const SITE = "sc-domain:londontravelgeek.co.uk";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
  ],
});
const client = await auth.getClient();
const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// ------------------------------------------------- Search Console ---------
const sc = google.searchconsole({ version: "v1", auth: client });
async function gscPages(startDate, endDate) {
  const r = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: { startDate, endDate, dimensions: ["page"], rowLimit: 500 },
  });
  const out = {};
  for (const row of r.data.rows ?? []) {
    const path = new URL(row.keys[0]).pathname;
    out[path] = {
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    };
  }
  return out;
}

// GSC lags: end the recent window 3 days back.
const recent = await gscPages(day(9), day(3));
const prior = await gscPages(day(16), day(10));

const paths = new Set([...Object.keys(recent), ...Object.keys(prior)]);
const rows = [];
for (const p of paths) {
  const a = prior[p] ?? { clicks: 0, impressions: 0, position: 0 };
  const b = recent[p] ?? { clicks: 0, impressions: 0, position: 0 };
  if (a.impressions < 20 && b.impressions < 20) continue;
  rows.push({
    path: p,
    clicksBefore: a.clicks, clicks: b.clicks,
    imprBefore: a.impressions, impr: b.impressions,
    posBefore: a.position ? Math.round(a.position * 10) / 10 : null,
    pos: b.position ? Math.round(b.position * 10) / 10 : null,
    // Position: lower is better, so an improvement is a negative delta.
    posDelta: a.position && b.position ? Math.round((b.position - a.position) * 10) / 10 : null,
    clickDelta: b.clicks - a.clicks,
  });
}

const short = (p) => p.replace("/articles/", "").replace(/\/$/, "").slice(0, 44);
const arrow = (d) => (d === null ? "  –  " : d < 0 ? `▲${(-d).toFixed(1)}` : d > 0 ? `▼${d.toFixed(1)}` : "  =  ");

console.log(`\nSEARCH CONSOLE — ${day(9)} to ${day(3)}  vs  ${day(16)} to ${day(10)}`);
console.log("(▲ = ranking improved, ▼ = ranking worsened. Position: lower is better.)\n");
console.log("  clicks        impressions        position          page");
console.log("  ─────────────────────────────────────────────────────────────────────────");
for (const r of rows.sort((x, y) => y.clickDelta - x.clickDelta)) {
  console.log(
    `  ${String(r.clicksBefore).padStart(4)}→${String(r.clicks).padEnd(5)} ` +
      `${String(r.imprBefore).padStart(6)}→${String(r.impr).padEnd(7)} ` +
      `${String(r.posBefore ?? "–").padStart(5)}→${String(r.pos ?? "–").padEnd(5)} ${arrow(r.posDelta)}  ${short(r.path)}`,
  );
}
const tc = rows.reduce((a, r) => a + r.clicks, 0), tcb = rows.reduce((a, r) => a + r.clicksBefore, 0);
const ti = rows.reduce((a, r) => a + r.impr, 0), tib = rows.reduce((a, r) => a + r.imprBefore, 0);
console.log(`\n  TOTAL  clicks ${tcb} → ${tc}   impressions ${tib} → ${ti}`);

// ----------------------------------------------------------- GA4 ---------
const data = google.analyticsdata({ version: "v1beta", auth: client });
const res = await data.properties.runReport({
  property: `properties/${PROPERTY}`,
  requestBody: {
    dateRanges: [{ startDate: day(6), endDate: day(0) }],
    dimensions: [{ name: "date" }, { name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    limit: 5000,
  },
});
const byPage = {};
const dates = new Set();
for (const r of res.data.rows ?? []) {
  const d = r.dimensionValues[0].value, p = r.dimensionValues[1].value;
  dates.add(d);
  (byPage[p] ??= {})[d] = Number(r.metricValues[0].value);
}
const ds = [...dates].sort();
const totalOf = (p) => ds.reduce((a, d) => a + (byPage[p][d] ?? 0), 0);
const top = Object.keys(byPage).sort((a, b) => totalOf(b) - totalOf(a)).slice(0, 18);

console.log(`\n\nGA4 VIEWS BY DAY — last ${ds.length} days (the final day or two are still processing)\n`);
console.log("  " + ds.map((d) => `${d.slice(6, 8)}/${d.slice(4, 6)}`.padStart(6)).join("") + "   page");
console.log("  " + "─".repeat(6 * ds.length + 46));
for (const p of top) {
  console.log("  " + ds.map((d) => String(byPage[p][d] ?? 0).padStart(6)).join("") + `   ${short(p)}`);
}
console.log("  " + "─".repeat(6 * ds.length + 46));
console.log("  " + ds.map((d) => String(Object.keys(byPage).reduce((a, p) => a + (byPage[p][d] ?? 0), 0)).padStart(6)).join("") + "   ALL PAGES");
console.log();
