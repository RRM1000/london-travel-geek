// Who is on the site right now: GA4's realtime report (the last 30 minutes),
// grouped by city and device. GA4 gives no per-person ID, so one city on one
// device type stands in for a visitor; two people in the same city on the
// same kind of device merge into one line.
//
//   node scripts/realtime.mjs
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});
const data = google.analyticsdata({ version: "v1beta", auth });
const property = `properties/${process.env.GA4_PROPERTY_ID ?? "548094096"}`;

const total = await data.properties.runRealtimeReport({
  property,
  requestBody: { metrics: [{ name: "activeUsers" }] },
});
console.log(`Active users, last 30 minutes: ${total.data.rows?.[0]?.metricValues[0].value ?? 0}\n`);

const res = await data.properties.runRealtimeReport({
  property,
  requestBody: {
    dimensions: ["country", "city", "deviceCategory", "unifiedScreenName"].map((name) => ({ name })),
    metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
    limit: 250,
  },
});

const visitors = new Map();
for (const row of res.data.rows ?? []) {
  const [country, city, device, page] = row.dimensionValues.map((d) => d.value);
  const key = `${city}, ${country} (${device})`;
  if (!visitors.has(key)) visitors.set(key, []);
  visitors.get(key).push([page.replace(" | London Travel Geek", ""), Number(row.metricValues[1].value)]);
}
for (const [who, pages] of [...visitors].sort((a, b) => b[1].length - a[1].length)) {
  const views = pages.reduce((sum, [, n]) => sum + n, 0);
  console.log(`${who}: ${pages.length} page(s), ${views} view(s)`);
  for (const [page, n] of pages) console.log(`   ${n}  ${page}`);
}
