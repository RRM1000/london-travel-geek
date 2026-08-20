// Exports the publishable slice of the Hotels tab to the Astro site.
//
// Same allowlist contract as the other three exports. Source and Signals are
// withheld - they carry working notes ("NEEDS VERIFYING", which survey said
// what) that are for us, not readers.
//
// AFFILIATE LINKS ARE RESOLVED HERE, not stored on the sheet. A row carries a
// brand; lib/affiliate.mjs turns that into a link using whichever programmes
// are switched on. Nothing resolves until a programme is enabled with real ids,
// so this ships producing zero links - by design.
//
//   node scripts/export-hotels.mjs
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";
import { hotelAffiliate, enabledHotelProgrammes } from "./lib/affiliate.mjs";

const OUT = "src/data/hotels.json";

const PUBLIC = {
  Slug: "slug", Name: "name", "Property Type": "propertyType", Style: "style",
  Brand: "brand", "Chain Type": "chainType", "Star Rating": "starRating", Rooms: "rooms",
  Neighbourhood: "area", Borough: "borough", "Area Guide": "guide",
  Zone: "zone", District: "district", Address: "address", Postcode: "postcode",
  Lat: "lat", Lng: "lng", "Nearest Station": "station", "Walk Min": "walkMin",
  "Price Band": "priceBand", "Typical From": "typicalFrom", Breakfast: "breakfast",
  "Room Types": "roomTypes", "Family Policy": "familyPolicy",
  Accessibility: "accessibility", Lift: "hasLift", "Air Conditioning": "airCon",
  "Luggage Storage": "luggageStorage", Cancellation: "cancellation",
  "Why Go": "whyGo", "Operational Summary": "opNote", "Good For": "goodFor",
  Lists: "lists", Website: "website", "Booking URL": "bookingUrl",
};

const rows = await readTab("Hotels");
const num = (v) => (String(v ?? "").trim() === "" ? undefined : Number(v));
const csv = (v) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const out = [];
for (const r of rows) {
  if (String(r.Status ?? "open") !== "open") continue;
  const o = {};
  for (const [col, key] of Object.entries(PUBLIC)) {
    const v = String(r[col] ?? "").trim();
    if (!v) continue;
    if (["lat", "lng", "walkMin"].includes(key)) o[key] = num(v);
    else if (["goodFor", "lists"].includes(key)) o[key] = csv(v);
    else o[key] = v;
  }
  if (!o.slug || !o.name) continue;
  const aff = hotelAffiliate(o);
  if (aff) { o.affiliateUrl = aff.url; o.affiliateNetwork = aff.network; }
  out.push(o);
}

// Cheapest first within a guide - the price band is the first thing a reader
// filters on, and the budget tier is the one most people actually need.
const BAND_ORDER = { "£": 0, "££": 1, "£££": 2, "££££": 3 };
out.sort((a, b) =>
  (BAND_ORDER[a.priceBand] ?? 9) - (BAND_ORDER[b.priceBand] ?? 9) ||
  a.name.localeCompare(b.name));

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  count: out.length,
  hotels: out,
}, null, 1));

console.log(`${OUT}: ${out.length} open rows`);
const byGuide = {};
for (const h of out) if (h.guide) (byGuide[h.guide] ??= []).push(h.slug);
console.log(`  guides covered: ${Object.keys(byGuide).length} - ${Object.entries(byGuide).map(([g, a]) => `${g.replace("-area-guide", "")} ${a.length}`).join(", ")}`);
const byType = {};
for (const h of out) byType[h.propertyType] = (byType[h.propertyType] ?? 0) + 1;
console.log(`  types: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(", ")}`);

const live = enabledHotelProgrammes();
const linked = out.filter((h) => h.affiliateUrl).length;
if (live.length) {
  console.log(`  affiliate programmes enabled: ${live.join(", ")} - ${linked} of ${out.length} rows linked`);
} else {
  console.log(`  NO AFFILIATE PROGRAMMES ENABLED - 0 rows linked.`);
  console.log(`    This is the shipped default. To switch one on: join it, then in`);
  console.log(`    scripts/lib/affiliate.mjs set enabled:true and fill the advertiser id`);
  console.log(`    (Awin) or linkTemplate (Impact), and set AWIN_PUBLISHER_ID /`);
  console.log(`    IMPACT_PUBLISHER_ID in the environment.`);
}
console.log(`  withheld: Source, Signals, Status, and every column not in PUBLIC`);
