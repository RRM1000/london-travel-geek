// Reports area guides whose "Where to eat and drink" table is ahead of the
// restaurant sheet.
//
// The remark plugin suppresses the "see all N places" link when the filtered
// page would show FEWER rows than the table the reader is already looking at -
// otherwise the link is a downgrade dressed up as an upgrade. Hampstead's guide
// names six places and the sheet holds two of them.
//
// Suppression is the correct behaviour, but silent suppression hides the real
// problem, which is that the guide is recommending places the database has
// never heard of. This script makes that visible.
//
//   node scripts/check-area-eat-links.mjs
//
import fs from "node:fs";

const DIR = "src/content/articles";
const { restaurants = [] } = JSON.parse(
  fs.readFileSync("src/data/restaurants.json", "utf8"),
);

const onSheet = new Map();
for (const r of restaurants) {
  if (!r.guide) continue;
  if (!onSheet.has(r.guide)) onSheet.set(r.guide, new Set());
  onSheet.get(r.guide).add(r.name.toLowerCase());
}

const gaps = [];
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("-area-guide.md"))) {
  const guide = file.replace(/\.md$/, "");
  const body = fs.readFileSync(`${DIR}/${file}`, "utf8");

  const section = body.split(/^## Where to eat and drink$/m)[1];
  if (!section) continue;
  const table = section.split(/^## /m)[0];

  // Table rows lead with a bolded name: | **Dishoom** | ...
  const named = [...table.matchAll(/^\|\s*\*\*([^*]+)\*\*/gm)].map((m) => m[1].trim());
  const known = onSheet.get(guide) ?? new Set();
  const missing = named.filter((n) => !known.has(n.toLowerCase()));

  if (missing.length) {
    gaps.push({ guide, shown: named.length, total: known.size, missing });
  }
}

if (!gaps.length) {
  console.log("every place named in an area guide table is on the restaurant sheet");
  process.exit(0);
}

// The suppressed guides are the ones that matter. Everywhere else the unmatched
// names are mostly pubs, cafes, markets and generic entries ("Camden Lock food
// stalls") that the restaurant sheet does not set out to cover, plus branch rows
// this exact-name match cannot see - Dishoom King's Cross is on the Branches tab
// as "Dishoom". Treat the long list as a prompt, not a defect report.
const suppressed = gaps.filter((g) => g.total < g.shown);
const rest = gaps.filter((g) => g.total >= g.shown);

if (suppressed.length) {
  console.log(
    `${suppressed.length} guide(s) where the sheet is THINNER than the guide's own table.`,
  );
  console.log("The 'see all' link is suppressed on these - the sheet needs rows.\n");
  for (const g of suppressed.sort((a, b) => a.total - b.total)) {
    console.log(
      `  ${g.guide.replace(/-area-guide$/, "").padEnd(18)} table ${g.shown}, sheet ${g.total}`,
    );
    console.log(`     not on sheet: ${g.missing.join(", ")}`);
  }
}

if (process.argv.includes("--verbose") && rest.length) {
  console.log(`\n${rest.length} other guide(s) with unmatched table names:`);
  for (const g of rest.sort((a, b) => b.missing.length - a.missing.length)) {
    console.log(
      `  ${g.guide.replace(/-area-guide$/, "").padEnd(18)} ${g.missing.join(", ")}`,
    );
  }
} else if (rest.length) {
  console.log(
    `\n${rest.length} other guide(s) name unmatched places - mostly pubs, cafes and` +
      `\nmarkets outside the sheet's scope. Run with --verbose to list them.`,
  );
}
