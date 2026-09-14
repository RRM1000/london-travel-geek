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

// A few titles count a SUBSET of the page rather than its ### headings, because
// the heading count is measuring the wrong thing. "10 Banksys" sits above a page
// whose headings are mostly neighbourhoods; "23 Worth Walking To" counts plaque
// subjects, six of which live in a bullet list rather than a heading.
//
// The number here is hand-verified against the article body. The audit still
// compares the title against it, so a title that drifts is still caught - this
// only changes WHAT the title is checked against, it does not switch the check
// off. If you add entries to one of these pages, update the number here too.
const SUBSET = {
  "london-street-art": {
    n: 15,
    why: "Banksys viewable as originals in situ; the ### are mostly areas",
  },
  "banksy-walk-london": {
    n: 10,
    why: "original Banksys; eight numbered stops, two of which are pairs",
  },
  "london-blue-plaques": {
    n: 23,
    why: "plaque subjects, six of which are bullets in the Elsewhere section",
  },
  "one-day-london-itineraries-by-interest": {
    n: 13,
    why: "each itinerary is an ## of its own; the two ### are stops inside the museums day",
  },
  "windowless-hotel-rooms-london": {
    n: 6,
    why: "chains, not properties; 3 of the 14 ### cover several addresses each under one operator",
  },
};

const DIR = "src/content/articles";
const rows = [];

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const md = fs.readFileSync(`${DIR}/${f}`, "utf8");

  const h3 = (md.match(/^### /gm) ?? []).length;
  const numbered = (md.match(/^## \d+\.\s/gm) ?? []).length;
  const actual = SUBSET[slug]?.n ?? Math.max(h3, numbered);
  if (!actual) continue;   // prose pages have no entry count to check

  for (const field of ["title", "seoTitle"]) {
    const text = (md.match(new RegExp(`^${field}: "(.+)"$`, "m")) ?? [])[1];
    if (!text) continue;
    const candidates = [];

    // Only a number that reads as a COUNT of things - "20 Chippies", "38
    // Viewpoints", "17 Rooms". A number followed by a lowercase word, a
    // currency symbol or a year is something else entirely.
    for (const m of text.matchAll(/\b(\d{1,3})\s+([A-Z][a-z]+|[a-z]+)\b/g)) {
      const n = Number(m[1]);
      const word = m[2];
      if (n < 3 || n > 200) continue;
      if (/^(hour|hours|minute|minutes|am|pm|st|nd|rd|th|star|stars)$/i.test(word)) continue;
      // A price's fractional half reads as a bare count - "£10.70 Southern"
      // matches "70 Southern" exactly as a real "70 Somethings" would. Walk
      // back over the digit run (and any decimal point or thousands comma)
      // to the character that actually precedes the number, rather than
      // looking only one character back, which lands on the "." and never
      // reaches the "£" a few characters further out.
      let back = m.index;
      while (back > 0 && /[\d.,]/.test(text[back - 1])) back--;
      if (/[£$]/.test(text[back - 1] ?? "")) continue;
      candidates.push(n);
    }

    // A title may legitimately carry several counts - "17 Nights, 8 Venues and
    // 4 Festivals" is three true statements about one page. Flag it only when
    // NONE of its numbers is the entry count, not once per number that is not.
    if (candidates.length && !candidates.includes(actual)) {
      rows.push({ slug, field, claimed: candidates[0], actual, text });
    }
  }
}

if (!rows.length) {
  console.log("every article title matches its entry count");
} else {
  console.log(`${rows.length} title(s) claiming a count that does not match the page:\n`);
  for (const r of rows) {
    console.log(`  ${r.slug}`);
    const sub = SUBSET[r.slug];
    console.log(
      sub
        ? `    ${r.field} says ${r.claimed}, but scripts/audit-counts.mjs records ${r.actual} (${sub.why})`
        : `    ${r.field} says ${r.claimed}, the page has ${r.actual} entries`,
    );
    console.log(`    "${r.text}"`);
  }
  process.exitCode = 1;
}
