// What the site ALREADY gets impressions for around accommodation.
//
// Written because "best hotels in London" is unwinnable and guessing at
// long-tail replacements is just a nicer class of guess. Search Console knows
// which accommodation-shaped queries Google is already matching this site
// against, and at what position - which is evidence about what it could rank
// for, not a hunch about what people might type.
//
// Read-only, free, and touches nothing billed.
//
//   node scripts/stay-demand.mjs [days]
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const SITE_DOMAIN = "londontravelgeek.co.uk";
const DAYS = Number(process.argv[2] ?? 90);

// Deliberately broad. A narrow "hotel" filter would miss "where to stay",
// which is the phrasing that actually converts and the one this site is
// better placed to answer than a booking engine.
const STAY = /hotel|hostel|stay|staying|accommodation|airbnb|b&b|bnb|guesthouse|room|sleep|lodge|apartment|aparthotel/i;

const iso = (d) => d.toISOString().slice(0, 10);
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});

const sc = google.searchconsole({ version: "v1", auth: await auth.getClient() });
const sites = (await sc.sites.list()).data.siteEntry ?? [];
const mine = sites.filter((s) => s.siteUrl.includes(SITE_DOMAIN));
if (!mine.length) throw new Error(`No Search Console property for ${SITE_DOMAIN}`);
const site = (mine.find((s) => s.siteUrl.startsWith("sc-domain:")) ?? mine[0]).siteUrl;

const end = new Date(Date.now() - 2 * 864e5);
const start = new Date(end.getTime() - DAYS * 864e5);

const res = await sc.searchanalytics.query({
  siteUrl: site,
  requestBody: {
    startDate: iso(start), endDate: iso(end),
    dimensions: ["query"], rowLimit: 25000, dataState: "final",
  },
});

const rows = (res.data.rows ?? []).map((r) => ({
  q: r.keys[0], clicks: r.clicks, impr: r.impressions, pos: Math.round(r.position * 10) / 10,
}));

const stay = rows.filter((r) => STAY.test(r.q)).sort((a, b) => b.impr - a.impr);

console.log(`${site}  ${iso(start)} to ${iso(end)} (${DAYS} days)`);
console.log(`${rows.length} queries total, ${stay.length} accommodation-shaped\n`);

const sum = (list, k) => list.reduce((t, r) => t + r[k], 0);
console.log(`impressions: ${sum(stay, "impr")}   clicks: ${sum(stay, "clicks")}\n`);

console.log("QUERY".padEnd(58) + "IMPR".padStart(7) + "CLICKS".padStart(8) + "POS".padStart(7));
for (const r of stay.slice(0, 60)) {
  console.log(r.q.slice(0, 57).padEnd(58) + String(r.impr).padStart(7) + String(r.clicks).padStart(8) + String(r.pos).padStart(7));
}

// Position 11-30 is the interesting band: Google already thinks the site is
// relevant enough to show, and a page written for the query specifically is the
// cheapest way to move it. Anything past 50 needs a page, not a nudge.
const striking = stay.filter((r) => r.pos >= 8 && r.pos <= 30 && r.impr >= 3);
console.log(`\nSTRIKING DISTANCE (position 8-30, 3+ impressions): ${striking.length}`);
for (const r of striking.slice(0, 30)) {
  console.log("  " + r.q.slice(0, 60).padEnd(62) + `pos ${r.pos}`.padEnd(10) + `${r.impr} impr`);
}
