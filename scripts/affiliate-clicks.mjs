// Every affiliate click GA4 recorded, so a commission that turns up in CJ or
// GetYourGuide can be traced back to the page that sent it. The networks' own
// reports give the date and the sale but not the page: our links carry no
// per-page tag.
//
// Two sources, because each misses something:
//   - our own affiliate_click event: the page, the venue and where on the page
//     (sidebar or inline). GA4 has no "network" dimension registered.
//   - GA4's outbound "click" event: the full destination URL, which for a CJ
//     link has the Hotels.com property or search wrapped inside it.
//
//   node scripts/affiliate-clicks.mjs              # last 30 days
//   node scripts/affiliate-clicks.mjs 14 anrdoezrs # last 14 days, links to one domain
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const days = Number(process.argv[2] ?? 30);
const domain = process.argv[3];

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});
const data = google.analyticsdata({ version: "v1beta", auth });
const property = `properties/${process.env.GA4_PROPERTY_ID ?? "548094096"}`;
const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
const eventIs = (value) => ({ filter: { fieldName: "eventName", stringFilter: { value } } });
const day = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

async function report(dimensions, dimensionFilter) {
  const res = await data.properties.runReport({
    property,
    requestBody: {
      dateRanges,
      dimensions: dimensions.map((name) => ({ name })),
      metrics: [{ name: "eventCount" }],
      dimensionFilter,
      orderBys: [{ dimension: { dimensionName: "date" }, desc: true }],
      limit: 1000,
    },
  });
  return (res.data.rows ?? []).map((r) => [...r.dimensionValues.map((d) => d.value), r.metricValues[0].value]);
}

// A CJ deep link ends in the real destination; show that rather than the wrapper.
const destination = (url) => {
  const i = url.indexOf("/type/dlg/");
  return i === -1 ? url : decodeURIComponent(url.slice(i + 10));
};

console.log(`Outbound affiliate clicks, last ${days} days (GA4 "click" event)\n`);
const clicks = await report(
  ["date", "pagePath", "linkDomain", "linkUrl", "city", "country", "deviceCategory"],
  { andGroup: { expressions: [eventIs("click"), { filter: { fieldName: "linkDomain", stringFilter: domain ? { value: domain, matchType: "CONTAINS" } : { value: "anrdoezrs|getyourguide|awin1|skiddle|partnerize|impact|kqzyfj|dpbolvw|jdoqocy|tkqlhce|saily|klook", matchType: "PARTIAL_REGEXP" } } }] } },
);
if (!clicks.length) console.log("  none");
for (const [date, page, dom, url, city, country, device, n] of clicks) {
  console.log(`${day(date)}  x${n}  ${page}\n            -> ${destination(url).slice(0, 140)}\n            ${dom} - ${city}, ${country} (${device})`);
}

console.log(`\nOur affiliate_click event, last ${days} days\n`);
const ours = await report(["date", "pagePath", "customEvent:venue", "customEvent:placement", "city", "country"], eventIs("affiliate_click"));
if (!ours.length) console.log("  none");
for (const [date, page, venue, placement, city, country, n] of ours) {
  console.log(`${day(date)}  x${n}  ${page}\n            ${venue} [${placement}] - ${city}, ${country}`);
}
