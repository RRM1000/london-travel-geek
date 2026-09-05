// Exports the publishable slice of the Events tab to the Astro site.
//
// THIS IS WHERE THE TAB EARNS ITS KEEP: an event whose run has finished is
// dropped here, so a page can never tell a reader to go and see something that
// closed. That check happens at EXPORT time against the real date, not at write
// time, so simply rebuilding the site retires finished runs without anyone
// editing the sheet.
//
// Same allowlist contract as the other two exports - Source is withheld because
// it carries working notes ("NEEDS VERIFYING - single source") that are for us.
//
//   node scripts/export-events.mjs
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";
import { eventAffiliate } from "./lib/affiliate.mjs";

const OUT = "src/data/events.json";
const TODAY = new Date().toISOString().slice(0, 10);

const PUBLIC = {
  Slug: "slug", Name: "name", "Event Type": "type", Style: "style", Venue: "venue",
  "Starts On": "startsOn", "Ends On": "endsOn", Recurring: "recurring",
  "Typical When": "typicalWhen",
  Neighbourhood: "area", Borough: "borough", "Area Guide": "guide",
  Zone: "zone", District: "district", Address: "address", Postcode: "postcode",
  Lat: "lat", Lng: "lng", "Nearest Station": "station", "Walk Min": "walkMin",
  "Age Policy": "agePolicy", "Typical Duration": "duration",
  "Price Per Person": "price", "Price Band": "priceBand",
  "Booking Required": "booking",
  "Indoor / Outdoor": "indoorOutdoor", "Step-Free": "stepFree",
  "Why Go": "whyGo", "Operational Summary": "opNote", "Good For": "goodFor",
  Lists: "lists", Website: "website", "Booking URL": "bookingUrl",
  "Affiliate URL": "affiliateUrl", "Affiliate Network": "affiliateNetwork",
};

const rows = await readTab("Events");
const num = (v) => (String(v ?? "").trim() === "" ? undefined : Number(v));
const csv = (v) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const out = [];
const expired = [];
for (const r of rows) {
  if (String(r.Status ?? "open") !== "open") continue;

  // A finished ONE-OFF is dropped. An ANNUAL event never is - the Marathon runs
  // every spring, and a row that disappears in April until someone edits the
  // sheet is worse than no row. Instead the dates are cleared and the page falls
  // back to Typical When, so it reads "returns each April" rather than naming a
  // date that has been and gone.
  const endsOn = String(r["Ends On"] ?? "").trim();
  const annual = String(r.Recurring ?? "").trim() === "annual";
  const finished = Boolean(endsOn) && endsOn < TODAY;
  if (finished && !annual) {
    expired.push(`${r.Name} (ended ${endsOn})`);
    continue;
  }

  const o = {};
  for (const [col, key] of Object.entries(PUBLIC)) {
    const v = String(r[col] ?? "").trim();
    if (!v) continue;
    if (["lat", "lng", "walkMin"].includes(key)) o[key] = num(v);
    else if (["goodFor", "lists"].includes(key)) o[key] = csv(v);
    else o[key] = v;
  }
  if (!o.slug || !o.name) continue;
  const aff = eventAffiliate(o);
  if (aff) { o.affiliateUrl = aff.url; o.affiliateNetwork = aff.network; }
  o.annual = annual;
  if (annual && finished) {
    // This year's edition is over. Drop the stale dates so nothing on the page
    // can quote them; Typical When carries the meaning from here.
    delete o.startsOn;
    delete o.endsOn;
    o.awaitingDates = true;
  }
  o.notYetOpen = Boolean(o.startsOn && o.startsOn > TODAY);
  out.push(o);
}

// Soonest to finish first: a run about to close is the most urgent thing on the
// page. Annual events with no dated edition sort last - they are a standing
// note rather than something to act on this week.
out.sort((a, b) => (a.endsOn || "9999").localeCompare(b.endsOn || "9999"));

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: TODAY,
  count: out.length,
  events: out,
}, null, 1));

console.log(`${OUT}: ${out.length} live events`);
const affE = out.filter((e) => e.affiliateUrl).length;
console.log(`  ${affE} event(s) carry a GetYourGuide link`);
if (expired.length) console.log(`  DROPPED as finished: ${expired.join(", ")}`);
const byGuide = {};
for (const e of out) if (e.guide) (byGuide[e.guide] ??= []).push(e.slug);
console.log(`  guides covered: ${Object.keys(byGuide).length} - ${Object.entries(byGuide).map(([g, a]) => `${g.replace("-area-guide", "")} ${a.length}`).join(", ")}`);
const soon = out.filter((e) => e.endsOn && e.endsOn <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
if (soon.length) console.log(`  ending within 30 days: ${soon.map((e) => `${e.name} (${e.endsOn})`).join(", ")}`);
const annuals = out.filter((e) => e.annual);
const awaiting = annuals.filter((e) => e.awaitingDates);
console.log(`  ${annuals.length} annual event(s), of which ${awaiting.length} are between editions and showing Typical When`);
if (awaiting.length) console.log(`    awaiting next dates: ${awaiting.map((e) => e.name).join(", ")}`);
console.log(`  withheld: Source, Status, and every column not in PUBLIC`);
