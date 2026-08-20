// Exports the publishable slice of the "Hidden London" tab to the Astro site.
//
// Same allowlist contract as the other exports - Source is withheld because
// it carries working notes ("NEEDS VERIFYING", which list this was cross-
// checked against) that are for us, not readers.
//
//   node scripts/export-hidden-london.mjs
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";

const OUT = "src/data/hiddenLondon.json";

const PUBLIC = {
  Slug: "slug", Name: "name", Type: "type", Subject: "subject", Scheme: "scheme",
  Neighbourhood: "area", Borough: "borough", "Area Guide": "guide",
  Zone: "zone", District: "district", Address: "address", Postcode: "postcode",
  Lat: "lat", Lng: "lng", "Nearest Station": "station", "Walk Min": "walkMin",
  "Why Go": "whyGo", "Operational Summary": "opNote",
};

const rows = await readTab("Hidden London");
const num = (v) => (String(v ?? "").trim() === "" ? undefined : Number(v));

const out = [];
for (const r of rows) {
  if (String(r.Status ?? "open") !== "open") continue;
  const o = {};
  for (const [col, key] of Object.entries(PUBLIC)) {
    const v = String(r[col] ?? "").trim();
    if (!v) continue;
    if (["lat", "lng", "walkMin"].includes(key)) o[key] = num(v);
    else o[key] = v;
  }
  if (!o.slug || !o.name) continue;
  out.push(o);
}

out.sort((a, b) => a.name.localeCompare(b.name));

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  count: out.length,
  spots: out,
}, null, 1));

console.log(`${OUT}: ${out.length} open rows`);
const byGuide = {};
for (const s of out) if (s.guide) (byGuide[s.guide] ??= []).push(s.slug);
console.log(`  guides covered: ${Object.keys(byGuide).length} - ${Object.entries(byGuide).map(([g, a]) => `${g.replace("-area-guide", "")} ${a.length}`).join(", ")}`);
const byType = {};
for (const s of out) byType[s.type] = (byType[s.type] ?? 0) + 1;
console.log(`  types: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(", ")}`);
const withCoords = out.filter((s) => s.lat).length;
console.log(`  ${withCoords}/${out.length} rows have coordinates`);
console.log(`  withheld: Source, Status, and every column not in PUBLIC`);
