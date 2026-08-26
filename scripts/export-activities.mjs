// Exports the publishable slice of the Activities tab to the Astro site.
//
// Same contract as export-restaurants.mjs: an explicit allowlist, so adding a
// column to the sheet never silently publishes it. Source is withheld - it
// carries working notes ("MISSED by the hand-assembled seed", "NEEDS
// VERIFYING") that are for us, not for readers.
//
//   node scripts/export-activities.mjs
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";
import { activityAffiliate } from "./lib/affiliate.mjs";

const OUT = "src/data/activities.json";

const PUBLIC = {
  Slug: "slug", Name: "name", "Activity Type": "type", Style: "style",
  "Venue Context": "context", "Chain Type": "chainType",
  Neighbourhood: "area", Borough: "borough", "Area Guide": "guide",
  // "prose" means the area guide writes about this venue itself, so
  // AreaActivities skips it rather than printing it a second time. Public
  // because the component needs it; see the column comment in write-activities.
  "Guide Placement": "guidePlacement",
  Zone: "zone", District: "district", Address: "address", Postcode: "postcode",
  Lat: "lat", Lng: "lng", "Nearest Station": "station", "Walk Min": "walkMin",
  "Age Policy": "agePolicy", Seasonal: "seasonal", "Market Days": "marketDays",
  "Food Offer": "foodOffer",
  "Typical Duration": "duration",
  "Group Size": "groupSize", "Price Per Person": "price",
  "Booking Required": "booking", "Indoor / Outdoor": "indoorOutdoor",
  "Step-Free": "stepFree", "Serves Food": "servesFood", "Serves Alcohol": "servesAlcohol",
  "Why Go": "whyGo", "Operational Summary": "opNote", "Good For": "goodFor",
  Lists: "lists", Website: "website", "Booking URL": "bookingUrl",
};

const rows = await readTab("Activities");
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
  const aff = activityAffiliate(o);
  if (aff) { o.affiliateUrl = aff.url; o.affiliateNetwork = aff.network; }
  out.push(o);
}

const byGuide = {};
for (const a of out) if (a.guide) (byGuide[a.guide] ??= []).push(a.slug);

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  count: out.length,
  activities: out,
}, null, 1));

console.log(`${OUT}: ${out.length} open rows`);
const affiliated = out.filter((a) => a.affiliateUrl).length;
console.log(`  ${affiliated} row(s) carry a GetYourGuide link, ${out.length - affiliated} deliberately do not (free, or nothing to sell)`);
console.log(`  guides covered: ${Object.keys(byGuide).length} - ${Object.entries(byGuide).map(([g, a]) => `${g.replace("-area-guide", "")} ${a.length}`).join(", ")}`);
const noGuide = out.filter((a) => !a.guide);
if (noGuide.length) console.log(`  NOT ATTACHED TO A GUIDE (${noGuide.length}): ${noGuide.map((a) => a.name).join(", ")}`);
console.log(`  withheld: Source, Status, and every column not in PUBLIC`);
