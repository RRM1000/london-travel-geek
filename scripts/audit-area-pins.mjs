// Flags pins that sit implausibly far from the area guide they are tagged to.
//
// WHY THIS EXISTS
// Rows carry an areaGuide, and the area map plots everything tagged to it. Two
// separate mistakes put a pin in the wrong place, and neither fails anything:
//
//   1. BOROUGH-NOT-PLACE. "Camden" is a borough as well as a neighbourhood, so
//      a King's Cross hotel tagged hood "Camden Town" pins two miles from
//      Camden Lock. Same trap for Westminster, Hackney, Islington.
//   2. WRONG BRANCH. A mini-chain with no address on the row lets Places pick
//      whichever site it likes - Gracey's Pizza resolved to its Covent Garden
//      shop and pinned four miles from the Battersea address in its own row.
//
// Both look completely normal in the data. They only show up on a map, which
// is why this measures distance instead of reading fields.
//
//   node scripts/audit-area-pins.mjs            # default 2km threshold
//   node scripts/audit-area-pins.mjs --km=1.5
import fs from "node:fs";

const arg = process.argv.find((a) => a.startsWith("--km="));
const LIMIT = arg ? Number(arg.split("=")[1]) : 2;

const SOURCES = {
  "eat": "src/data/restaurants.json",
  "do": "src/data/activities.json",
  "hidden": "src/data/hiddenLondon.json",
  "stay": "src/data/hotels.json",
  "events": "src/data/events.json",
};

function rowsOf(file) {
  if (!fs.existsSync(file)) return [];
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(d)) return d;
  const key = Object.keys(d).find((k) => Array.isArray(d[k]));
  return key ? d[key] : [];
}

const km = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Group every pin by guide, then measure each against the MEDIAN of its own
// group. Using the median rather than a hand-written centre per area means
// this needs no maintenance and cannot itself go stale - and one bad pin
// cannot drag the centre the way a mean would.
const byGuide = new Map();
for (const [kind, file] of Object.entries(SOURCES)) {
  for (const r of rowsOf(file)) {
    const guide = r.guide ?? r.areaGuide;
    if (!guide || !r.lat || !r.lng) continue;
    if (!byGuide.has(guide)) byGuide.set(guide, []);
    byGuide.get(guide).push({ kind, name: r.name, slug: r.slug, area: r.area ?? r.hood, lat: r.lat, lng: r.lng });
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

let flagged = 0;
let checked = 0;
const report = [];

for (const [guide, pins] of [...byGuide].sort()) {
  if (pins.length < 3) continue; // too few to establish a centre
  const centre = [median(pins.map((p) => p.lat)), median(pins.map((p) => p.lng))];
  const out = pins
    .map((p) => ({ ...p, d: km(centre, [p.lat, p.lng]) }))
    .filter((p) => p.d > LIMIT)
    .sort((a, b) => b.d - a.d);
  checked += pins.length;
  if (!out.length) continue;
  flagged += out.length;
  report.push(
    `\n${guide}  (${pins.length} pins, centre ${centre[0].toFixed(4)},${centre[1].toFixed(4)})`,
    ...out.map((p) => `   ${p.d.toFixed(2).padStart(6)} km  [${p.kind}] ${String(p.area ?? "").padEnd(16)} ${p.name}  [${p.slug}]`),
  );
}

console.log(report.join("\n") || `no pin further than ${LIMIT} km from its area centre`);
console.log(`\n${flagged} suspect pin(s) of ${checked} across ${byGuide.size} guides (threshold ${LIMIT} km)`);
if (flagged) {
  console.log("\nEach is either tagged to the wrong guide, or geocoded to the wrong branch.");
  console.log("Check the row's address before retagging - the address is usually right and the coordinates wrong.");
}
