// Which spreadsheet rows have a photo, and which do not.
//
// Photos attach by convention rather than by a sheet column - a file named
// <slug>.jpg in src/assets/sheet (or in any article's asset folder) is picked
// up automatically by lib/sheetPhotos. That makes broken references impossible,
// but it also means the spreadsheet gives you no way to see coverage. This is
// that view.
//
//   node scripts/report-sheet-photos.mjs             # summary per sheet
//   node scripts/report-sheet-photos.mjs --missing   # list rows with no photo
//   node scripts/report-sheet-photos.mjs --guide=covent-garden-area-guide
//
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/assets/sheet", "src/assets/articles"];
const IMG = /\.(jpe?g|png|webp|avif)$/i;

const have = new Set();
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (IMG.test(e.name)) have.add(e.name.replace(IMG, ""));
    }
  };
  walk(root);
}

const SHEETS = [
  ["Activities", "src/data/activities.json", "activities"],
  ["Hidden London", "src/data/hiddenLondon.json", "spots"],
  ["Hotels", "src/data/hotels.json", "hotels"],
  ["Events", "src/data/events.json", "events"],
  ["Restaurants", "src/data/restaurants.json", "restaurants"],
];

const wantMissing = process.argv.includes("--missing");
const guideArg = process.argv.find((a) => a.startsWith("--guide="));
const guide = guideArg ? guideArg.split("=")[1] : null;

console.log(`${have.size} image file(s) available across ${ROOTS.join(", ")}\n`);

for (const [label, file, key] of SHEETS) {
  if (!fs.existsSync(file)) continue;
  let rows = JSON.parse(fs.readFileSync(file, "utf8"))[key] ?? [];
  if (guide) rows = rows.filter((r) => r.guide === guide);
  if (!rows.length) continue;

  const withPhoto = rows.filter((r) => have.has(r.slug));
  const pct = ((withPhoto.length / rows.length) * 100).toFixed(0);
  console.log(`${label.padEnd(16)} ${String(withPhoto.length).padStart(4)}/${String(rows.length).padEnd(4)} rows have a photo  (${pct}%)`);

  if (withPhoto.length) {
    console.log(`  matched: ${withPhoto.map((r) => r.slug).join(", ")}`);
  }
  if (wantMissing) {
    const missing = rows.filter((r) => !have.has(r.slug));
    if (missing.length) {
      console.log(`  no photo (${missing.length}):`);
      for (const r of missing) console.log(`    ${r.slug.padEnd(38)} ${r.name ?? ""}`);
    }
  }
  console.log("");
}

if (!wantMissing) {
  console.log("Add a photo by saving it as src/assets/sheet/<slug>.jpg - nothing else to change.");
  console.log("Run with --missing to list the rows that do not have one.");
}
