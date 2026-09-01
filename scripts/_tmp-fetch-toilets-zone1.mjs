// One-off script: sweep the Great British Public Toilet Map API across Zone 1
// London and produce a deduplicated, active-only JSON file for a map.
import { writeFileSync } from "fs";

const GRID = [
  ["Paddington", 51.5154, -0.1755],
  ["Marylebone", 51.5225, -0.1631],
  ["Baker Street", 51.5226, -0.1571],
  ["Euston", 51.5282, -0.1337],
  ["King's Cross", 51.5308, -0.1238],
  ["Angel", 51.5322, -0.1058],
  ["Old Street", 51.5259, -0.0873],
  ["Liverpool Street", 51.5178, -0.0823],
  ["Aldgate", 51.5143, -0.0755],
  ["Tower Hill", 51.5098, -0.0766],
  ["London Bridge", 51.5049, -0.0864],
  ["Elephant & Castle", 51.4943, -0.1001],
  ["Vauxhall", 51.4861, -0.1219],
  ["Victoria", 51.4965, -0.1447],
  ["Sloane Square", 51.4924, -0.1565],
  ["South Kensington", 51.4941, -0.1738],
  ["Notting Hill Gate", 51.5094, -0.1967],
  ["Bayswater", 51.5122, -0.1879],
  ["Oxford Circus", 51.5152, -0.1418],
  ["Holborn", 51.5174, -0.1198],
  ["Temple", 51.5111, -0.1141],
  ["Westminster", 51.5010, -0.1254],
  ["Trafalgar Square", 51.5074, -0.1281],
  ["South Bank / Waterloo", 51.5033, -0.1145],
];

const QUERY = `{ loosByProximity(from: { lat: LAT, lng: LNG, maxDistance: 1400 }) { name location { lat lng } area { name } openingTimes accessible allGender men women babyChange radar attended automatic noPayment paymentDetails notes active } }`;

async function fetchGrid(name, lat, lng) {
  const q = QUERY.replace("LAT", lat).replace("LNG", lng);
  const res = await fetch("https://www.toiletmap.org.uk/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ query: q }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error(`Error for ${name}:`, json.errors);
    return [];
  }
  return json.data.loosByProximity || [];
}

const seen = new Map(); // key: rounded coords -> record
let totalRaw = 0;

for (const [name, lat, lng] of GRID) {
  const results = await fetchGrid(name, lat, lng);
  totalRaw += results.length;
  for (const r of results) {
    if (!r.active) continue;
    const key = `${r.location.lat.toFixed(5)},${r.location.lng.toFixed(5)}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  // be polite
  await new Promise((res) => setTimeout(res, 150));
}

const unique = [...seen.values()];

// Classify each into free / paid / unknown
function classify(r) {
  if (r.paymentDetails) return "paid";
  if (r.noPayment === true) return "free";
  return "unknown";
}

const out = unique.map((r) => ({
  name: r.name || null,
  lat: r.location.lat,
  lng: r.location.lng,
  area: r.area?.[0]?.name || null,
  category: classify(r),
  price: r.paymentDetails || null,
  accessible: r.accessible ?? null,
  babyChange: r.babyChange ?? null,
  radar: r.radar ?? null,
  notes: r.notes || null,
}));

writeFileSync(
  "C:/Users/rober/AppData/Local/Temp/claude/C--Users-rober-Projects-london-travel-geek/a98123df-bc7a-4352-8f16-ff488953bca2/scratchpad/zone1-toilets.json",
  JSON.stringify(out, null, 2),
);

console.log("Grid points queried:", GRID.length);
console.log("Total raw results (with overlap):", totalRaw);
console.log("Unique active facilities:", unique.length);
console.log(
  "Free:",
  out.filter((o) => o.category === "free").length,
  "Paid:",
  out.filter((o) => o.category === "paid").length,
  "Unknown:",
  out.filter((o) => o.category === "unknown").length,
);
console.log("Named:", out.filter((o) => o.name).length);
