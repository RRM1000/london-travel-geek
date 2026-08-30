// Checks every "Cited by N sources" line in the Chinese and East Asian guide.
//
// THIS ARTICLE SPANS THREE CORPORA - chinese, thai and korean - because they are
// three cuisines that a menu convention files together. A Thai restaurant's
// count must come from the THAI corpus: printing its Chinese-guide count would
// be the same error as printing a venue's all-topics sourceCount, one level up.
// The article marks the cuisine in the citation line ("Cited by 5 Thai sources")
// and this script holds it to that.
import fs from "node:fs";

const art = fs.readFileSync("src/content/articles/best-chinese-east-asian-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const docs = Object.fromEntries(["chinese", "thai", "korean"].map((t) =>
  [t, JSON.parse(fs.readFileSync(`data/consensus/${t}.json`, "utf8"))]));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?(?:\s+—.*)?\s*$/);
  if (h) lastName = h[1].replace(/\s+—.*$/, "").trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  // "Cited by 5 Thai sources" names the corpus; a bare "Cited by 3 sources"
  // means the Chinese one, which is this page's default.
  const c = line.match(/Cited by (\d+)(?: (Thai|Korean|Chinese))? sources?/);
  const tableCount = line.match(/^\|[^|]*\|[^|]*\|[^|]*\|\s*(\d+)\s*\|/);
  const claimed = c?.[1] ?? tableCount?.[1];
  const topic = (c?.[2] ?? "chinese").toLowerCase();
  if (!claimed || !lastName) continue;

  const rec = evByNorm[resolve(lastName)];
  if (!rec) { errors.push(`${lastName}: not in evidence.json at all`); continue; }
  const scoped = rec.byTopic?.[topic]?.sourceCount ?? null;
  if (scoped === null) errors.push(`${lastName}: has no ${topic} citations at all`);
  else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed} ${topic} sources, corpus says ${scoped}`);
  else checked.push(`${lastName}: ${claimed} ${topic} OK`);
}

// A Michelin badge must be a real tier-A citation in that venue's own corpus.
let starName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?(?:\s+—.*)?\s*$/);
  if (h) starName = h[1].replace(/\s+—.*$/, "").trim();
  const m = line.match(/(One|Two|Three) Michelin stars?, 2026/);
  if (!m || !starName) continue;
  const rec = evByNorm[resolve(starName)];
  const topics = ["chinese", "thai", "korean"].filter((t) => rec?.byTopic?.[t]?.hasAward);
  if (!topics.length) errors.push(`${starName}: badged with a Michelin star but carries no tier-A citation in any of its corpora`);
  else checked.push(`${starName}: star OK (${topics.join(",")})`);
}

// The three corpus figures in the evidence block.
const want = {};
for (const t of ["chinese", "thai", "korean"]) {
  const v = Object.values(ev).filter((x) => x.byTopic?.[t]);
  want[t] = {
    sources: docs[t].sources.length,
    citations: docs[t].sources.reduce((n, s) => n + (s.names ?? []).length, 0),
    venues: v.length,
    twoPlus: v.filter((x) => x.byTopic[t].sourceCount >= 2).length,
  };
}
for (const [t, w] of Object.entries(want)) {
  const label = t[0].toUpperCase() + t.slice(1);
  const m = art.match(new RegExp(`${label} — (\\d+) sources?,? (?:carrying )?(\\d+) citations across (\\d+) restaurants, (\\d+) named twice or more`));
  if (!m) { errors.push(`methodology: could not find the ${t} figures in the evidence block`); continue; }
  const got = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m[4] };
  for (const k of Object.keys(w))
    if (w[k] !== got[k]) errors.push(`methodology: ${t} ${k} printed as ${got[k]}, evidence build says ${w[k]}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
