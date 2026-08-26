// Does the number in the title match the number of entries on the page?
//
// WHY THIS EXISTS
// A title that says "19 Chippies Compared" above twenty chippies is a small lie
// that a reader can check in about four seconds, and it undermines everything
// else on the page. It happens naturally: entries get added and the title does
// not follow. Six articles had drifted before this check existed, and two of
// those drifted the same day they were written.
//
// Numbers that are not entry counts - prices, years, street numbers, "24-hour",
// "54,000 square feet" - are filtered out rather than reported, so a hit here
// should always be worth acting on.
//
//   node scripts/audit-counts.mjs
import fs from "node:fs";

const DIR = "src/content/articles";
const rows = [];

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const md = fs.readFileSync(`${DIR}/${f}`, "utf8");

  const h3 = (md.match(/^### /gm) ?? []).length;
  const numbered = (md.match(/^## \d+\.\s/gm) ?? []).length;
  const actual = Math.max(h3, numbered);
  if (!actual) continue;   // prose pages have no entry count to check

  for (const field of ["title", "seoTitle"]) {
    const text = (md.match(new RegExp(`^${field}: "(.+)"$`, "m")) ?? [])[1];
    if (!text) continue;

    // Only a number that reads as a COUNT of things - "20 Chippies", "38
    // Viewpoints", "17 Rooms". A number followed by a lowercase word, a
    // currency symbol or a year is something else entirely.
    for (const m of text.matchAll(/\b(\d{1,3})\s+([A-Z][a-z]+|[a-z]+)\b/g)) {
      const n = Number(m[1]);
      const word = m[2];
      if (n < 3 || n > 200) continue;
      if (/^(hour|hours|minute|minutes|am|pm|st|nd|rd|th)$/i.test(word)) continue;
      if (/£|\$/.test(text.slice(Math.max(0, m.index - 1), m.index + 1))) continue;
      if (n !== actual) {
        rows.push({ slug, field, claimed: n, actual, text });
      }
    }
  }
}

if (!rows.length) {
  console.log("every article title matches its entry count");
} else {
  console.log(`${rows.length} title(s) claiming a count that does not match the page:\n`);
  for (const r of rows) {
    console.log(`  ${r.slug}`);
    console.log(`    ${r.field} says ${r.claimed}, the page has ${r.actual} entries`);
    console.log(`    "${r.text}"`);
  }
  process.exitCode = 1;
}
