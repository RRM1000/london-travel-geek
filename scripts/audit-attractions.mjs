// Measures coverage against an EXTERNAL register of London's biggest
// attractions, rather than against the editorial lists the research passes use.
//
// WHY THIS EXISTS
// Every pass in data/research-playbook.json starts from a published guide -
// Time Out, The Infatuation, a cuisine round-up. That finds what critics write
// about, and structurally cannot find what they do not cover. On 2026-08-23 a
// spot check found Tower of London, Tate Modern, the National Gallery, Kew
// Gardens, HMS Belfast and the Shard all had no row, alongside Babylon Park,
// four Wetherspoons and three of London's six three-Michelin-star restaurants.
// None of those was a taste call. They were simply never searched for.
//
// So this asks the opposite question: here is what is objectively big - by
// audited visitor numbers - which of it do we carry?
//
// THREE STATES, NOT TWO. A name can be:
//   ROW       a real row in a sheet, so it appears in Things to do, the
//             filters, the maps and search.
//   PROSE     named in an area guide's markdown but with no row. It is on the
//             site, but invisible to every listing and filter.
//   ABSENT    nowhere at all.
// PROSE is the interesting one and the reason this is not a simple set diff:
// adding a row for something a guide already covers in prose creates the
// duplication that Neal's Yard, Seven Dials Market and the Guinness brewery
// all showed - the same venue printed twice on one page, once from the sheet
// and once from the markdown. Anything reported as PROSE needs a decision
// about WHERE it should live before a row is written, not a reflex row.
//
//   node scripts/audit-attractions.mjs
//   node scripts/audit-attractions.mjs --absent    # just the missing ones
//
import fs from "node:fs";
import path from "node:path";

const REF = "data/reference/london-attractions.json";
const ARTICLES = "src/content/articles";

const onlyAbsent = process.argv.includes("--absent");

// CONTENT WORDS ARE NEVER STRIPPED.
//
// The first version of this stripped "of", "in" and "london" as noise. That
// reduced "Tower of London" to "tower", which then matched
// westminster-cathedral-tower and reported the Tower of London as covered when
// it is not. It also matched "National Gallery" to the RESTAURANT inside it and
// "Old Royal Naval College" to a Buckingham Palace filming location. Three
// false positives, all of them claiming coverage we did not have - the worst
// possible direction for an audit to be wrong in.
//
// So only a LEADING "the" is dropped, and matching additionally requires the
// shorter name to be at least two words. Punctuation and case go; every word
// that distinguishes one place from another stays.
const norm = (s) =>
  String(s ?? "").toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’.,]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();

/** Does `hay` contain `needle` as a whole-word run of 2+ words? */
function contains(hay, needle) {
  if (!needle || needle.split(" ").length < 2) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

// A ROW THAT MENTIONS AN ATTRACTION IS NOT A ROW THAT COVERS IT.
//
// Only the Activities sheet counts as coverage here, because that is the sheet
// that puts a thing into Things to do, the activity filters and the maps.
// The other two are searched but reported separately, because matching against
// them produced exactly the wrong answer twice: "Locatelli at The National
// Gallery" is a RESTAURANT inside the gallery, and "The Crown's Buckingham
// Palace (Old Royal Naval College)" is a FILMING LOCATION that happens to name
// the site. Counting either as coverage would have marked a major attraction
// done while no visitor could find it on the site.
const COVERS = ["activities"];
const rows = [];
for (const [file, key, label] of [
  ["src/data/activities.json", "activities", "activities"],
  ["src/data/hiddenLondon.json", "spots", "hidden-london"],
  ["src/data/restaurants.json", "restaurants", "restaurants"],
]) {
  if (!fs.existsSync(file)) continue;
  for (const r of JSON.parse(fs.readFileSync(file, "utf8"))[key] ?? []) {
    rows.push({ name: r.name, slug: r.slug, sheet: label, guide: r.guide });
  }
}

// Guide prose: headings and the numbered "Top sights" bullets, which is where
// an area guide names a landmark without the sheet knowing about it.
const prose = [];
for (const f of fs.readdirSync(ARTICLES).filter((f) => f.endsWith(".md"))) {
  const md = fs.readFileSync(path.join(ARTICLES, f), "utf8");
  const id = f.replace(/\.md$/, "");
  for (const [, t] of md.matchAll(/^#{2,3}\s+(.+)$/gm)) prose.push({ text: t, id });
  for (const [, t] of md.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)) prose.push({ text: t, id });
  for (const [, t] of md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)) prose.push({ text: t, id });
}

const ref = JSON.parse(fs.readFileSync(REF, "utf8"));
const summary = { ROW: 0, PROSE: 0, ABSENT: 0 };
const absentAll = [];

for (const list of ref.lists) {
  // A list can be parked with auditSkip while its names stay on record - see
  // the out-of-London day trips. Skipping is a decision that was made, not a
  // gap; re-reporting those every run would train people to ignore the output.
  if (list.auditSkip) {
    console.log(`\n=== ${list.name} - SKIPPED (${list.names.length} names on record) ===`);
    console.log(`  ${list.statusNote ?? "deferred"}`);
    continue;
  }
  console.log(`\n=== ${list.name} (${list.names.length} names, recorded ${list.recorded}) ===`);
  for (const entry of list.names) {
    // A name may be given as a plain string, or as ["Canonical", "alias", ...].
    // ALIASES EXIST BECAUSE THE FIRST RUN REPORTED KEW GARDENS AS PROSE-ONLY
    // when a row had existed all along under "Royal Botanic Gardens, Kew". The
    // two names share no contiguous run of words, so containment matching could
    // not see it - and the sweep nearly added a second Kew row. A false
    // negative is less dangerous than a false positive here, but it still
    // manufactures duplicate work.
    const [name, ...aliases] = Array.isArray(entry) ? entry : [entry];
    const forms = [name, ...aliases].map(norm);
    const n = norm(name);
    const hit = (r) => {
      const rn = norm(r.name);
      return forms.some((f) => rn === f || contains(rn, f) || contains(f, rn));
    };
    const row = rows.filter((r) => COVERS.includes(r.sheet)).find(hit);
    const related = rows.filter((r) => !COVERS.includes(r.sheet)).find(hit);
    const inProse = prose.find((p) => forms.some((f) => contains(norm(p.text), f)));

    let state, detail;
    if (row) {
      state = "ROW";
      detail = `${row.sheet}: ${row.slug}${row.guide ? ` -> ${row.guide}` : ""}`;
    } else if (inProse) {
      state = "PROSE";
      detail = `named in ${inProse.id} but has no row`;
    } else {
      state = "ABSENT";
      detail = "";
      absentAll.push(name);
    }
    summary[state]++;
    if (onlyAbsent && state !== "ABSENT") continue;
    console.log(`  ${state.padEnd(7)} ${name.padEnd(34)} ${detail}`);
    // Shown, never counted: a nearby row is a useful lead when writing the real
    // one, but it is not coverage.
    if (!row && related) {
      console.log(`          ${" ".repeat(34)} (related ${related.sheet} row, not coverage: ${related.slug})`);
    }
  }
}

const total = summary.ROW + summary.PROSE + summary.ABSENT;
console.log(`\n---- ${total} reference names: ${summary.ROW} have a row, ${summary.PROSE} prose-only, ${summary.ABSENT} absent`);
if (summary.PROSE) {
  console.log(`  PROSE-ONLY names are on the site but missing from every listing and filter.`);
  console.log(`  Decide where each belongs before adding a row - a row PLUS existing prose`);
  console.log(`  prints the venue twice on the same guide. See the note at the top of this file.`);
}
if (absentAll.length) {
  console.log(`\nABSENT (${absentAll.length}): ${absentAll.join(", ")}`);
}
