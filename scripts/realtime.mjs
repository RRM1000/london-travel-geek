// Who is on the site right now: GA4's realtime report (the last 30 minutes).
//
//   node scripts/realtime.mjs
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const PROPERTY = `properties/${process.env.GA4_PROPERTY_ID ?? "548094096"}`;
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});
const data = google.analyticsdata({ version: "v1beta", auth });

const report = async (dimensions, limit = 15) => {
  const res = await data.properties.runRealtimeReport({
    property: PROPERTY,
    requestBody: {
      dimensions: dimensions.map((name) => ({ name })),
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
    },
  });
  return (res.data.rows ?? []).map((r) => [...(r.dimensionValues ?? []).map((d) => d.value), Number(r.metricValues[0].value)]);
};

const total = await report([], 1);
console.log(`Active users, last 30 minutes: ${total[0]?.[0] ?? 0}\n`);
for (const [label, dims] of [
  ["Pages", ["unifiedScreenName"]],
  ["Country and city", ["country", "city"]],
  ["Device", ["deviceCategory"]],
]) {
  const rows = await report(dims);
  console.log(`${label}:`);
  for (const r of rows) console.log(`  ${r.at(-1)}  ${r.slice(0, -1).join(" · ")}`);
  if (!rows.length) console.log("  (none)");
  console.log();
}
