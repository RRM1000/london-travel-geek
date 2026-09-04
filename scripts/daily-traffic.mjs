// Daily GA4 pageviews and users for the last N days, plus the same day-by-day
// split for Search Console. Written to answer "has the last few days dropped",
// which the 28-day windows in pull-analytics.mjs cannot show.
//
//   node scripts/daily-traffic.mjs [days]      default 21
//
// Read-only. Both APIs are free.

import { google } from "googleapis";
import { KEY_PATH } from "./sheets.mjs";
import fs from "node:fs";

const DAYS = Number(process.argv[2] ?? 21);
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
const today = new Date();
const start = new Date(today);
start.setDate(start.getDate() - DAYS);

// ------------------------------------------------------------------ GA4 ---
const data = google.analyticsdata({ version: "v1beta", auth: client });
const res = await data.properties.runReport({
  property: `properties/${PROPERTY}`,
  requestBody: {
    dateRanges: [{ startDate: iso(start), endDate: iso(today) }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "totalUsers" },
      { name: "sessions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 200,
  },
});

const rows = (res.data.rows ?? []).map((r) => ({
  date: r.dimensionValues[0].value,
  views: Number(r.metricValues[0].value),
  users: Number(r.metricValues[1].value),
  sessions: Number(r.metricValues[2].value),
}));

// ---------------------------------------------------- Search Console ---
const sc = google.searchconsole({ version: "v1", auth: client });
let gsc = [];
try {
  const g = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: {
      startDate: iso(start),
      endDate: iso(today),
      dimensions: ["date"],
      rowLimit: 200,
    },
  });
  gsc = (g.data.rows ?? []).map((r) => ({
    date: r.keys[0].replace(/-/g, ""),
    clicks: r.clicks,
    impressions: r.impressions,
    position: Math.round(r.position * 10) / 10,
  }));
} catch (e) {
  console.error("GSC:", e.message);
}
const gscBy = Object.fromEntries(gsc.map((r) => [r.date, r]));

const fmt = (d) => `${d.slice(6, 8)}/${d.slice(4, 6)}`;
const dow = (d) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).getDay()
  ];

console.log(`\nGA4 property ${PROPERTY} — last ${DAYS} days\n`);
console.log("  date        views  users  sess │ GSC clicks  impr   pos");
console.log("  ─────────────────────────────────────────────────────────");
const max = Math.max(...rows.map((r) => r.views), 1);
for (const r of rows) {
  const g = gscBy[r.date];
  const bar = "█".repeat(Math.round((r.views / max) * 22));
  console.log(
    `  ${fmt(r.date)} ${dow(r.date)}  ${String(r.views).padStart(5)}  ` +
      `${String(r.users).padStart(5)}  ${String(r.sessions).padStart(4)} │ ` +
      `${String(g?.clicks ?? "–").padStart(6)} ${String(g?.impressions ?? "–").padStart(6)} ` +
      `${String(g?.position ?? "–").padStart(5)}  ${bar}`,
  );
}

const last7 = rows.slice(-7).reduce((a, r) => a + r.views, 0);
const prev7 = rows.slice(-14, -7).reduce((a, r) => a + r.views, 0);
if (prev7) {
  const pct = Math.round(((last7 - prev7) / prev7) * 100);
  console.log(`\n  last 7 days ${last7} views vs previous 7 ${prev7}  (${pct >= 0 ? "+" : ""}${pct}%)`);
}
console.log(
  `\n  NOTE: GA4 takes 24-48h to finish processing, and Search Console lags 2-3 days,\n` +
    `  so the last row or two are incomplete and will rise. Do not read them as a drop.\n`,
);
