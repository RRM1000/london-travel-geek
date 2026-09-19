// Checks that every number printed in the family hotels guide is still true.
//
// Figures are READ OUT OF THE ARTICLE and compared against data/evidence.json
// and data/topics/hotels-family.json, the same design as
// verify-budget-hotels-citations.mjs. This topic carries no prices - every
// rate is PENDING on purpose - so this checker has nothing price-shaped to
// verify; it checks the evidence numbers, the per-entry citation counts, and
// that the further-out section only holds a hotel the topic config marks
// as a qualifying outer candidate.
//
//   node scripts/verify-family-hotels-citations.mjs
import fs from "node:fs";

const ARTICLE = process.env.ARTICLE ?? "src/content/articles/best-family-hotels-london.md";
const article = fs.readFileSync(ARTICLE, "utf8").replace(/\r\n/g, "\n");
const body = article.replace(/^---\n[\s\S]*?\n---\n/, "");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const topic = JSON.parse(fs.readFileSync("data/topics/hotels-family.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, data says ${actual}`);
};

// ---- derived figures, scoped to this topic only --------------------------
const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes("hotels-family"))
  .map((v) => ({ name: v.name, count: v.byTopic["hotels-family"].sourceCount }));
const countOf = new Map(rows.map((r) => [norm(r.name), r.count]));
const derived = {
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
};

const candidateByKey = new Map(topic.candidates.map((c) => [norm(c.evidenceKey ?? c.name), c]));

// ---- the evidence block ----------------------------------------------------
const block = body.match(/\*\*(\d+) named hotels\*\*/);
if (!block) errors.push("evidence block: \"N named hotels\" not found or reworded");
else check("named hotels", block[1], derived.venues);
const two = body.match(/\*\*(\d+) hotels are named by two or more independent sources/);
if (!two) errors.push("evidence block: two-or-more sentence not found or reworded");
else check("named by 2+", two[1], derived.twoPlus);

// ---- sections --------------------------------------------------------------
const sections = {};
for (const part of body.split(/^## /m).slice(1)) {
  const [head, ...rest] = part.split("\n");
  sections[head.trim()] = rest.join("\n");
}
const winners = sections["The winners"];
const strong = sections["Also strongly backed"];
const further = sections["Further out, on a fast line"];
if (!winners) errors.push('section "The winners" not found');
if (!strong) errors.push('section "Also strongly backed" not found');
if (!further) errors.push('section "Further out, on a fast line" not found');

const ENTRY = new RegExp("^### (.+)\\n\\n(\\*[^\\n]*\\*)", "gm");
const entries = [
  ...[...(winners ?? "").matchAll(ENTRY)].map((m) => ({ where: "central", tier: "winner", name: m[1].trim(), meta: m[2] })),
  ...[...(strong ?? "").matchAll(ENTRY)].map((m) => ({ where: "central", tier: "strong", name: m[1].trim(), meta: m[2] })),
  ...[...(further ?? "").matchAll(ENTRY)].map((m) => ({ where: "outer", tier: "outer", name: m[1].trim(), meta: m[2] })),
];
if (entries.length < 15) errors.push(`only ${entries.length} hotel entries matched - has the format changed?`);

for (const e of entries) {
  const key = norm(e.name);
  const cited = e.meta.match(/Cited by (\d+) sources?/);
  if (!cited) { errors.push(`${e.name}: no "Cited by" in its metadata line`); continue; }
  if (!countOf.has(key)) errors.push(`${e.name}: no hotels-family evidence under that name`);
  else check(`${e.name} citation line`, cited[1], countOf.get(key));

  if (e.tier === "winner" && countOf.get(key) < 6) errors.push(`${e.name}: under "The winners" but cited by only ${countOf.get(key)}`);
  if (e.tier === "strong" && (countOf.get(key) < 4 || countOf.get(key) > 5)) errors.push(`${e.name}: under "Also strongly backed" but cited by ${countOf.get(key)}, expected 4-5`);

  if (/PENDING/.test(e.meta)) errors.push(`${e.name}: metadata line still carries a PENDING placeholder`);

  const c = candidateByKey.get(key);
  if (!c) { errors.push(`${e.name}: has an article entry but no matching row in data/topics/hotels-family.json candidates`); continue; }
  if (Boolean(c.outer) !== (e.where === "outer")) {
    errors.push(`${e.name}: article section is "${e.where}" but the topic config marks outer=${c.outer}`);
  }
  const station = e.meta.match(/(\d+) min from ([^·]+)·/);
  if (station && c.station && !station[2].trim().startsWith(c.station)) {
    errors.push(`${e.name}: metadata line names "${station[2].trim()}" but the topic config's station is "${c.station}"`);
  }
}

// A candidate marked outer:true should actually have an entry, and nothing
// marked outer:false should be sitting under "Further out".
for (const c of topic.candidates) {
  const key = norm(c.evidenceKey ?? c.name);
  const inArticle = entries.find((e) => norm(e.name) === key);
  if (!inArticle) errors.push(`${c.name}: in the topic config's candidates but has no entry in the article`);
}

// ---- a price, or no line at all --------------------------------------------
// Priced on Hotels.com for one room sleeping two adults and two children. A hotel
// that sells no such room carries no price line, so this is no longer one per
// entry - but a placeholder must never ship.
const nightLines = [...body.matchAll(/Typical family night ([^\s·]+(?:\s[^\s·]+)?)/g)];
const notPriced = nightLines.filter((m) => !/^£[\d,]+$/.test(m[1]));
if (notPriced.length) errors.push(`${notPriced.length} "Typical family night" line(s) carry something that is not a price: ${notPriced.map((m) => m[1]).join(", ")}`);
if (/PENDING/.test(body)) errors.push("the article still contains the word PENDING");

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the family hotels guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `family hotels guide verified: ${derived.venues} named hotels, ${derived.twoPlus} on two or more, ` +
  `${entries.length} entries checked against data/evidence.json and data/topics/hotels-family.json`,
);
