// Merges every reader's output and writes the Listings and Listing Venues tabs.
//
// One row per performance, soonest first, past dates dropped. "First Seen" is
// carried over from the tab as it stood, so a show keeps the date we first
// found it and "just announced" can be filtered on.
//
// The same performance reached through two sources (a venue's own box office
// and a ticket agent) is kept once: same venue, same start time, and titles
// that match once punctuation and case are ignored.
//
//   node scripts/listings/write-sheet.mjs [--dry]
//
import fs from "node:fs";
import { getSheets, SHEET_ID, KEY_PATH, readTab, writeTab } from "../sheets.mjs";
import { RAW, TODAY, loadVenues, loadPlatforms } from "./lib.mjs";

const DRY = process.argv.includes("--dry");
const LISTINGS_TAB = "Listings";
const VENUES_TAB = "Listing Venues";

// Sources in order of trust: a venue's own box office beats an agent.
const SOURCE_RANK = ["spektrix", "tribe", "jsonld", "dice", "ticketmaster", "skiddle"];
const rank = (s) => { const i = SOURCE_RANK.indexOf(s); return i < 0 ? 99 : i; };

const files = fs.readdirSync(RAW).filter((f) => f.endsWith(".json"));
let all = [];
for (const f of files) all.push(...JSON.parse(fs.readFileSync(`${RAW}/${f}`, "utf8")).listings);

const venues = loadVenues();
const venueById = new Map(venues.map((v) => [v.id, v]));

// A run collapsed to one row (timed entry) stays while the run is on.
const WHOLE_RUN = new Set(["timed entry", "runs over several days"]);
all = all.filter((l) => (WHOLE_RUN.has(l.note) && l.runLast ? l.runLast : l.start.slice(0, 10)) >= TODAY);

// Hand-kept list of open-ended shows and permanent attractions.
const EX = JSON.parse(fs.readFileSync("data/listings/exclude.json", "utf8"));
const exclude = [...EX.openEndedShows, ...EX.attractions].map((p) => new RegExp(p, "i"));
const before = all.length;
all = all.filter((l) => !exclude.some((re) => re.test(l.title)));
console.log(`${before - all.length} rows dropped by data/listings/exclude.json`);

// Sources title the same show differently ("Much Ado About Nothing" and
// "Shakespeare's Globe - Much Ado About Nothing"), so at one venue and start
// time, two titles are the same show if one contains the other or they share
// most of their distinctive words.
const norm = (t) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "and", "with", "live", "london", "presents", "tour", "tickets", "show"]);
const words = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
function sameShow(a, b) {
  const x = norm(a), y = norm(b);
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wa = words(a), wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared >= 2 && shared / Math.min(wa.size, wb.size) >= 0.6;
}
const slots = new Map();
for (const l of all.sort((a, b) => rank(a.source) - rank(b.source))) {
  const key = `${l.venueId}|${l.start}`;
  const here = slots.get(key) ?? [];
  const twin = here.find((k) => sameShow(k.title, l.title));
  if (twin) {
    // Keep the better source's row, but fill its gaps from the other.
    for (const f of ["priceFrom", "priceTo", "onSaleFrom", "availability", "note"]) if (twin[f] === "" && l[f] !== "") twin[f] = l[f];
    twin.alsoOn = [...new Set([...(twin.alsoOn ?? []), l.source])];
    continue;
  }
  here.push(l);
  slots.set(key, here);
}
const listings = [...slots.values()].flat().sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

let firstSeen = new Map();
if (!DRY) {
  try {
    firstSeen = new Map((await readTab(LISTINGS_TAB)).map((r) => [r["Listing ID"], r["First Seen"]]));
  } catch { /* tab does not exist yet */ }
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEADER = [
  "Date", "Time", "Day", "Title", "Category", "Genre", "Venue", "Room", "Zone", "Station",
  "Price From", "Price To", "On Sale", "On Sale From", "Availability", "Run", "Performances",
  "Access", "Note", "Link", "Source", "First Seen", "Listing ID",
];
const rows = listings.map((l) => {
  const v = venueById.get(l.venueId) ?? {};
  const date = l.start.slice(0, 10);
  const run = l.runFirst && l.runLast && l.runFirst !== l.runLast ? `${l.runFirst} to ${l.runLast}` : "";
  return [
    date, WHOLE_RUN.has(l.note) ? "" : l.start.slice(11, 16), DAY[new Date(`${date}T12:00`).getDay()],
    l.title, l.category, l.genre, l.venue, l.room ?? "", v.zone ?? l.zone ?? "", v.station ?? l.station ?? "",
    l.priceFrom, l.priceTo, l.onSale, l.onSaleFrom, l.availability, run, l.performances,
    l.access, l.note, l.url, [l.source, ...(l.alsoOn ?? [])].join(", "), firstSeen.get(l.id) || TODAY, l.id,
  ];
});

// --- venues tab -----------------------------------------------------------
const platforms = loadPlatforms();
const countByVenue = new Map();
for (const l of listings) countByVenue.set(l.venueId, (countByVenue.get(l.venueId) ?? 0) + 1);
const READERS = new Set(SOURCE_RANK);
const VENUE_HEADER = ["Name", "Kind", "Zone", "Station", "Walk (m)", "Postcode", "Website", "Ticketing", "Read By", "Upcoming Rows", "Scope", "Venue ID"];
const venueRows = venues.map((v) => {
  const p = platforms[v.id] ?? {};
  const sources = [...new Set(listings.filter((l) => l.venueId === v.id).map((l) => l.source))];
  return [
    v.name, v.kind, v.zone, v.station, v.walkM, v.postcode, v.website,
    (p.platforms ?? []).join(", "), sources.join(", ") || ((p.platforms ?? []).some((x) => READERS.has(x)) ? "reader pending" : ""),
    countByVenue.get(v.id) ?? 0, v.scope, v.id,
  ];
}).sort((a, b) => b[9] - a[9] || a[0].localeCompare(b[0]));

const bySource = {};
for (const l of listings) bySource[l.source] = (bySource[l.source] ?? 0) + 1;
const cats = {};
for (const l of listings) cats[l.category] = (cats[l.category] ?? 0) + 1;
console.log(`${rows.length} listings (${all.length - rows.length} duplicates merged) from ${countByVenue.size} venues`);
console.log(bySource, cats);

// The same rows, as objects, for the What's On page export.
fs.writeFileSync("work/listings/merged.json", JSON.stringify({
  generated: TODAY,
  rows: rows.map((r) => Object.fromEntries(HEADER.map((h, i) => [h.replace(/ (\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase()), r[i]]))),
}));

if (DRY) process.exit(0);
if (!fs.existsSync(KEY_PATH)) {
  console.log(`No Google service account at ${KEY_PATH} - the Sheet was not updated.`);
  process.exit(0);
}

await writeTab(LISTINGS_TAB, HEADER, rows);
await writeTab(VENUES_TAB, VENUE_HEADER, venueRows);

// Freeze the header and switch on the filter so the tab can be sorted and
// filtered straight away.
const sheets = await getSheets();
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
const requests = [];
for (const [tab, width, n] of [[LISTINGS_TAB, HEADER.length, rows.length], [VENUES_TAB, VENUE_HEADER.length, venueRows.length]]) {
  const sheetId = meta.data.sheets.find((s) => s.properties.title === tab).properties.sheetId;
  requests.push(
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: n + 1, startColumnIndex: 0, endColumnIndex: width } } } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
  );
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
console.log(`wrote ${LISTINGS_TAB} and ${VENUES_TAB}`);
