// Checks every "Cited by N sources" and every printed rank in the Sunday roast
// article against data/evidence.json and the sources' own quotes in
// data/consensus/sunday-roast.json.
//
// This article previously published The Camberwell Arms at "#9" (it is #60, on
// the extended list) and The Red Lion & Sun at "#20" (it is #3). Both numbers
// looked plausible and neither was derivable. That is what this script exists
// to stop.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans all 48 corpora, so
// Blacklock reads 15 there and 5 here - and 5 is what a roast guide may print.
import fs from "node:fs";

const art = fs.readFileSync("src/content/articles/best-sunday-roast-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync("data/consensus/sunday-roast.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [norm(k), v]));

const gastro = byNorm(doc.sources.find((s) => /top50gastropubs\.com/.test(s.url))?.quotes);
const timeout = byNorm(doc.sources.find((s) => /timeout\.com/.test(s.url))?.quotes);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  const claimed = line.match(/Cited by (\d+) sources?/)?.[1]
    ?? line.match(/\|\s*(\d+)\s*(?:·[^|]*)?\|\s*[^|]*\|\s*$/)?.[1];
  if (claimed && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.["sunday-roast"]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no sunday-roast citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, sunday-roast corpus says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
  }

  // "#3, Estrella Damm Top 50 Gastropubs 2026" and "#60, Estrella Damm extended
  // list (51-100)". Both are checked against the list's own quote, AND the
  // extended-list wording is enforced: a place above 50 must not be printed as
  // if it were in the Top 50, which is exactly how #60 became "#9".
  for (const m of line.matchAll(/#(\d+), Estrella Damm ([^·*\n]+)/g)) {
    if (!lastName) { errors.push(`orphan Estrella Damm rank: ${line.trim()}`); continue; }
    const real = gastro[resolve(lastName)]?.match(/^#(\d+) in the Estrella Damm/)?.[1];
    if (real !== m[1]) { errors.push(`${lastName}: "#${m[1]}, Estrella Damm" not derivable (list says ${real ?? "not on it"})`); continue; }
    const saysExtended = /extended/i.test(m[2]);
    if (Number(m[1]) > 50 && !saysExtended)
      errors.push(`${lastName}: #${m[1]} is on the extended 51-100 list and must say so`);
    if (Number(m[1]) <= 50 && saysExtended)
      errors.push(`${lastName}: #${m[1]} is in the Top 50, not the extended list`);
  }

  for (const m of line.matchAll(/#(\d+), Time Out|Time Out #(\d+)/g)) {
    if (!lastName) continue;
    const want = m[1] ?? m[2];
    const real = timeout[resolve(lastName)]?.match(/^#(\d+) in Time Out/)?.[1];
    if (real !== want) errors.push(`${lastName}: "Time Out #${want}" not derivable (list says ${real ?? "not on it"})`);
  }
}

// The Top 50 table: every "| **#N** | Pub |" row must match the list.
for (const m of art.matchAll(/^\|\s*\*\*#(\d+)\*\*\s*\|\s*([^|]+?)\s*\|/gm)) {
  const real = gastro[resolve(m[2])]?.match(/^#(\d+) in the Estrella Damm/)?.[1]
    ?? timeout[resolve(m[2].replace(/,.*$/, ""))]?.match(/^#(\d+) in Time Out/)?.[1];
  if (real !== m[1]) errors.push(`ranking table: "${m[2]}" printed at #${m[1]}, sources say ${real ?? "not on either list"}`);
  else checked.push(`table ${m[2]} #${m[1]} OK`);
}

const venues = Object.values(ev).filter((v) => v.byTopic?.["sunday-roast"]).map((v) => ({ ...v, ...v.byTopic["sunday-roast"] }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  awards: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named pubs and restaurants\*\*/);
const m2 = art.match(/\*\*(\d+) are named by two or more independent sources; (\d+) carry a dated ranking\.\*\*/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1], awards: +m2[2] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
