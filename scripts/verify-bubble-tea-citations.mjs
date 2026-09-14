// Checks that every number printed in the bubble tea guide is still true.
//
// Figures are READ OUT OF THE ARTICLE and compared against a fresh build, the
// same design as verify-hot-chocolate-citations.mjs, so this goes stale when
// the evidence changes rather than when someone forgets to update it.
//
//   node scripts/verify-bubble-tea-citations.mjs
//
// TWO THINGS BITE THIS TOPIC.
// 1. CHURN. Five of the most-recommended names had closed by the first pass
//    (The Alley, Dragon Cat Cafe, CoCo, Quaker Street, Tealive). They sit in
//    data/closed.json, so build-evidence drops them - and the article must
//    never give one an entry. Their "recommended by" counts in the closures
//    table come from the consensus file, because evidence no longer has them.
// 2. RANKS. Only Time Out and The Strand published an order. A "#n of 10"
//    beside any other source name is an error.
import fs from "node:fs";

const ARTICLE = "src/content/articles/best-bubble-tea-london.md";
const article = fs.readFileSync(ARTICLE, "utf8");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const consensus = JSON.parse(fs.readFileSync("data/consensus/bubble-tea.json", "utf8"));
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues;

const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes("bubble-tea"))
  .map((v) => ({ name: v.name, count: v.byTopic["bubble-tea"].sourceCount }));
const countOf = Object.fromEntries(rows.map((r) => [r.name, r.count]));

const derived = {
  sources: consensus.sources.length,
  citations: rows.reduce((s, r) => s + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
};

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, build says ${actual}`);
};

// ---- the evidence block ------------------------------------------------
const block = article.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*/);
if (!block) errors.push("evidence block not found or reworded");
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named venues", block[3], derived.venues);
}
const two = article.match(/\*\*(\d+) venues are named by two or more/);
if (!two) errors.push("two-or-more sentence not found");
else check("venues on 2+", two[1], derived.twoPlus);

// ---- every citation line -----------------------------------------------
// Entries (### headings) carry the line directly under the heading; the
// cross-reference bullets carry it at the end of the bullet after the name.
const ALIAS = { "Pürcha": "Purcha", "Yi Fang": "Yi Fang Fruit Tea" };
const cited = [
  ...[...article.matchAll(/^### (.+)\r?\n\r?\n\*[^\n]*?Cited by (\d+) sources?/gm)].map((m) => [m[1], m[2]]),
  ...[...article.matchAll(/^- (?:[^*\s]+ )?(?:\*\*[^*]+\*\*: )?\*\*([^*]+)\*\*[^\n]*?Cited by (\d+) sources?/gm)].map((m) => [m[1], m[2]]),
];
if (cited.length < 18) errors.push(`only ${cited.length} citation lines matched - has the format changed?`);
for (const [raw, n] of cited) {
  const name = ALIAS[raw.trim()] ?? raw.trim();
  if (!(name in countOf)) { errors.push(`${name}: has a citation line but no bubble-tea evidence`); continue; }
  check(`${name} citation line`, n, countOf[name]);
}
for (const h of article.matchAll(/^### (.+)$/gm)) {
  if (!cited.some(([n]) => n === h[1].trim())) errors.push(`${h[1]}: entry has no citation line`);
}

// ---- ranks only from sources that ranked -------------------------------
for (const m of article.matchAll(/#(\d+) of (\d+), ([A-Za-z ]+?)[*·\n]/g)) {
  const who = m[3].trim();
  if (!["Time Out", "The Strand"].includes(who)) errors.push(`rank printed against ${who}, which published no order`);
  const src = consensus.sources.find((s) => s.name.startsWith(who === "The Strand" ? "The Strand" : "Time Out"));
  const quoted = Object.values(src?.quotes ?? {}).some((q) => q.startsWith(`#${m[1]} of ${m[2]}, ${who}`));
  if (!quoted) errors.push(`#${m[1]} of ${m[2]}, ${who}: no matching quote in the consensus file`);
}

// ---- nothing closed gets an entry --------------------------------------
const closedNames = Object.values(closed).map((v) => v.name);
for (const h of article.matchAll(/^### (.+)$/gm)) {
  if (closedNames.includes(h[1].trim())) errors.push(`${h[1]} is in data/closed.json but has an entry`);
}

// ---- the closures table ------------------------------------------------
let tableRows = 0;
const named = (n) => consensus.sources.filter((s) => s.names.includes(n)).length;
for (const m of article.matchAll(/^\| \*\*([^*]+)\*\*[^|]*\| (\d+)( of 15 sources)?[,| ]/gm)) {
  const name = { "Dragon Cat Café": "Dragon Cat Cafe" }[m[1]] ?? m[1];
  tableRows++;
  check(`${name} closures-table count`, m[2], named(name));
}

if (tableRows < 7) errors.push(`closures table: matched ${tableRows} of 7 rows`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the bubble tea guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `bubble tea guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} venues, ${derived.twoPlus} on two or more, ${cited.length} citation lines checked`,
);
