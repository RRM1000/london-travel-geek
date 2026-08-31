// Finds venues covered with a full entry in more than one guide.
//
//   node scripts/audit-guide-overlap.mjs [--max=4]
//
// WHY THIS EXISTS
// The Chinese guide carried Thai, Korean and dim sum sections while all three
// had guides of their own - 21 of its 36 entries were duplicates. The Middle
// Eastern guide carried a Turkish section the same way. Both were found by a
// human reading the site, not by any script, and the second one hid behind a
// spelling difference: "Mangal 2" against "Mangal II".
//
// Two pages targeting one query make both rank worse, so this is a ranking
// problem before it is a tidiness one. Cross-references are fine and expected;
// what this looks for is the same venue written up twice at length.
import fs from "node:fs";

const DIR = "src/content/articles";
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "").slice(6) || 4);

// Normalisation has to survive the ways the same venue gets written down:
// roman numerals, ampersands, apostrophes, a leading "The", and trailing area.
const ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .split(/\s+/)
    .map((w) => ROMAN[w] ?? w)
    .join(" ")
    .replace(/^(the|a)\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

const guides = {};
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync(`${DIR}/${f}`, "utf8");
  const lines = raw.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{3,4} (.+)$/);
    if (!m) continue;
    // A heading that only introduces #### entries below it is a section
    // header, not a venue.
    let j = i + 1, isGroup = false, words = 0;
    for (; j < lines.length && !/^#{1,4} /.test(lines[j]); j++) words += lines[j].split(/\s+/).filter(Boolean).length;
    if (/^#### /.test(lines[j] || "")) isGroup = true;
    if (isGroup) continue;
    // Cross-reference stubs are the FIX for duplication, not an instance of it.
    if (words < 60) continue;
    // "Ishtar, Marylebone and Lokal, Fitzrovia" is two venues in one heading.
    for (const part of m[1].split(/\s+and\s+/)) {
      const name = part.split(",")[0].split(/\s+—\s+/)[0].trim();
      if (name.length > 2) entries.push({ name, key: norm(name) });
    }
  }
  if (entries.length) guides[f.replace(/\.md$/, "")] = entries;
}

const seen = new Map();
for (const [slug, entries] of Object.entries(guides))
  for (const e of entries) {
    if (!seen.has(e.key)) seen.set(e.key, []);
    seen.get(e.key).push({ slug, name: e.name });
  }

const clashes = [...seen.values()].filter((v) => new Set(v.map((x) => x.slug)).size > 1);

// Group by the PAIR of guides, because one duplicated venue is a judgement
// call and twenty is a section in the wrong place.
const pairs = new Map();
for (const c of clashes) {
  const slugs = [...new Set(c.map((x) => x.slug))].sort();
  for (let i = 0; i < slugs.length; i++)
    for (let j = i + 1; j < slugs.length; j++) {
      const k = `${slugs[i]} + ${slugs[j]}`;
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(c.map((x) => x.name).join(" / "));
    }
}

// Cheap eats is a PRICE facet, not a cuisine. A £6 dosa belongs in the
// vegetarian guide and in cheap eats, and the two answer different queries,
// so they do not compete the way "best Chinese" and "best Thai" do. Overlap
// with a facet guide is expected; overlap between two cuisine guides is a
// section in the wrong place.
const FACETS = new Set(["cheap-eats-london", "late-night-eating-london", "special-occasion-restaurants-london", "best-street-food-london"]);
const isFacetPair = (pair) => pair.split(" + ").some((s) => FACETS.has(s));

const bad = [...pairs.entries()]
  .filter(([k, v]) => v.length > MAX && !isFacetPair(k))
  .sort((a, b) => b[1].length - a[1].length);

console.log(`${clashes.length} venue(s) written up in more than one guide`);
for (const [pair, names] of [...pairs.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12))
  console.log(`  ${String(names.length).padStart(3)}  ${pair}${names.length > MAX ? (isFacetPair(pair) ? "   (facet overlap, allowed)" : "   <-- SECTION IN THE WRONG PLACE") : ""}`);

if (bad.length) {
  console.log(`\n${bad.length} pair(s) over the limit of ${MAX}:`);
  for (const [pair, names] of bad) console.log(`  ${pair}\n     ${names.join(", ")}`);
  process.exit(1);
}
console.log(`\nno guide duplicates another by more than ${MAX} entries`);
