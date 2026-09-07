// Checks that every number printed in the hot chocolate guide is still true.
//
// The figures are READ OUT OF THE ARTICLE and compared against a fresh build,
// so this goes stale the moment the evidence changes rather than the moment
// someone forgets. Hard-coding the expected numbers here would defeat the
// point - that is exactly how the pizza checker went stale when a source was
// rebuilt.
//
//   node scripts/verify-hot-chocolate-citations.mjs
//
// TRAP 7 IS THE ONE THAT BITES THIS TOPIC. Several of these venues also carry
// coffee, ice-cream and dessert citations - Badiani is in three corpora - so a
// count must come from byTopic["hot-chocolate"], never from the venue's total.
// Counting hosts across evidence.json unfiltered gave 14 sources when the real
// answer for this topic is 12, because eight hosts belonged to other topics.
import fs from "node:fs";

const ARTICLE = "src/content/articles/best-hot-chocolate-london.md";
const article = fs.readFileSync(ARTICLE, "utf8");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const consensus = JSON.parse(fs.readFileSync("data/consensus/hot-chocolate.json", "utf8"));

const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes("hot-chocolate"))
  .map((v) => ({ name: v.name, count: v.byTopic["hot-chocolate"].sourceCount }));

const derived = {
  sources: consensus.sources.length,
  citations: rows.reduce((s, r) => s + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
};

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) {
    errors.push(`${label}: article says ${claimed}, build says ${actual}`);
  }
};

// ---- the evidence block ------------------------------------------------
const block = article.match(
  /\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*/,
);
if (!block) errors.push("evidence block not found or reworded");
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named venues", block[3], derived.venues);
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const two = article.match(/\*\*(\w+) venues are named by two or more/);
if (!two) errors.push("two-or-more sentence not found");
else check("venues on 2+", two[1], WORDS[derived.twoPlus] ?? derived.twoPlus);

// ---- per-entry citation lines ------------------------------------------
for (const r of rows.filter((x) => x.count >= 2)) {
  if (!article.includes(r.name)) continue; // not every backed venue gets an entry
  const line = new RegExp(`${r.name}[\\s\\S]{0,400}?Cited by (\\d+) sources`);
  const m = article.match(line);
  if (!m) errors.push(`${r.name}: named in the article with no citation line`);
  else check(`${r.name} citation line`, m[1], r.count);
}

// ---- no rank against an unordered source -------------------------------
// Nothing in this corpus published an order, so ANY rank claim is wrong.
const ranked = consensus.sources.filter((s) => s.ranked === true);
if (!ranked.length && /#\d+ of \d+/.test(article)) {
  errors.push("article prints a rank but no source in this topic published an order");
}

// ---- the closures the guide reports ------------------------------------
// The article's whole "what the shared list gets wrong" section rests on these.
const enrich = JSON.parse(fs.readFileSync("data/enrichment.json", "utf8"));
const claimedClosed = ["Paul A Young", "Ruby Violet", "DeRosier"];
const slugs = { "Paul A Young": "paul-a-young", "Ruby Violet": "ruby-violet-tufnell-park", "DeRosier": "derosier" };
for (const name of claimedClosed) {
  const rec = enrich[slugs[name]] ?? {};
  if (rec.businessStatus !== "CLOSED_PERMANENTLY") {
    errors.push(`${name} is printed as closed but enrichment says ${rec.businessStatus ?? "nothing"}`);
  }
}

// ---- every venue given an entry must still be trading ------------------
const entryVenues = {
  "Italian Bear Chocolate": "italian-bear-chocolate",
  "Dark Sugars Cocoa House": "dark-sugars-brick-lane",
  "Chin Chin Dessert Club": "chin-chin-dessert-club",
  "Knoops": "knoops-covent-garden",
  "Mamasons Dirty Ice Cream": "mamasons-dirty-ice-cream",
  "Andrea's Hot Chocolate": "andreas-hot-chocolate",
  "Melt Chocolates": "melt-chocolates",
  "Badiani": "badiani-soho",
};
for (const [name, slug] of Object.entries(entryVenues)) {
  const rec = enrich[slug] ?? {};
  if (rec.businessStatus && rec.businessStatus !== "OPERATIONAL") {
    errors.push(`${name} has an entry but enrichment says ${rec.businessStatus}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the hot chocolate guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `hot chocolate guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} venues, ${derived.twoPlus} on two or more, 3 closures confirmed`,
);
