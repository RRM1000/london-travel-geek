// Checks that every number printed in the market stalls guide is still true.
//
// The figures are READ OUT OF THE ARTICLE and compared against a fresh build,
// so this goes stale the moment the evidence changes rather than the moment
// someone forgets.
//
//   node scripts/verify-market-stalls-citations.mjs
//
// TRAP 7 BITES HARD HERE. Most of these traders also carry citations from other
// corpora (JUMA from middle-eastern, Bread Ahead from dessert, Monmouth from
// coffee), and the database's market_traders_ranked view adds them all up -
// OMA reaches 19 there on Greek-restaurant lists. A count printed here must
// come from byTopic["market-stalls"], never from the venue's total.
import fs from "node:fs";

const TOPIC = "market-stalls";
const article = fs.readFileSync("src/content/articles/best-market-stalls-london.md", "utf8");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const consensus = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes(TOPIC))
  .map((v) => ({ name: v.name, count: v.byTopic[TOPIC].sourceCount }));
const byName = Object.fromEntries(rows.map((r) => [norm(r.name), r]));

// One opinion per domain (one per channel for YouTube), as build-evidence counts.
const hostOf = (url) => {
  const u = new URL(url);
  const h = u.hostname.replace(/^www\./, "");
  return h === "youtube.com" ? `${h}/${u.pathname.split("/")[1]}` : h;
};
const derived = {
  sources: new Set(consensus.sources.map((s) => hostOf(s.url))).size,
  citations: rows.reduce((s, r) => s + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
};

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, build says ${actual}`);
};

const block = article.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named traders\*\*/);
if (!block) errors.push("evidence block not found or reworded");
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named traders", block[3], derived.venues);
}
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  "Twenty", "Twenty-one", "Twenty-two", "Twenty-three", "Twenty-four", "Twenty-five", "Twenty-six",
  "Twenty-seven", "Twenty-eight", "Twenty-nine", "Thirty", "Thirty-one", "Thirty-two"];
const two = article.match(/\*\*(\S+) traders are named by two or more/);
if (!two) errors.push("two-or-more sentence not found");
else check("traders on 2+", two[1], WORDS[derived.twoPlus] ?? derived.twoPlus);

// Every "### Name" heading followed by a "Cited by N" line.
const lines = article.split(/\r?\n/);
let heading = null;
const ALIAS = { juma: "jumakitchen" };
for (const line of lines) {
  const h = line.match(/^###\s+(.+?)\s*$/);
  if (h) { heading = h[1]; continue; }
  if (!heading || !line.startsWith("*")) continue;
  const m = line.match(/Cited by (\d+) sources?/);
  const key = ALIAS[norm(heading)] ?? norm(heading);
  if (m) {
    const r = byName[key];
    if (!r) errors.push(`${heading}: has a citation line but no ${TOPIC} evidence`);
    else check(`${heading} citation line`, m[1], r.count);
  }
  // Ranks: only against a source that published an order, and only the rank it gave.
  for (const rk of line.matchAll(/#(\d+) of (\d+), ([^·*]+?)\s*(?:·|\*)/g)) {
    const src = consensus.sources.find((s) => s.ranked && s.name.startsWith(rk[3].trim()));
    if (!src) { errors.push(`${heading}: rank against ${rk[3]}, which published no order`); continue; }
    const q = Object.entries(src.quotes ?? {}).find(([n]) => (ALIAS[norm(heading)] ?? norm(heading)) === norm(n))?.[1] ?? "";
    if (!q.startsWith(`#${rk[1]} of ${rk[2]}`)) errors.push(`${heading}: prints #${rk[1]} of ${rk[2]}, source says "${q}"`);
  }
  heading = null;
}

// The two award winners are printed with their award, not a count; both must be in the corpus.
for (const name of ["Oshpaz", "Joy & Gladness"]) {
  const src = consensus.sources.find((s) => s.url.includes("britishstreetfood") && s.names.includes(name));
  if (!src) errors.push(`${name}: printed as an award winner but no British Street Food Awards record names it`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the market stalls guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(`market stalls guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} traders, ${derived.twoPlus} on two or more`);
