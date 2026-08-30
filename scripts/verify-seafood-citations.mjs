// Checks every "Cited by N sources" and every printed rank in the seafood article
// against data/evidence.json and the sources' own quotes in
// data/consensus/seafood.json. Anything that cannot be derived is an error.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans all 48 corpora, and
// a single guide must not print that. Sarv's Slice once read 5 in the pizza guide
// on the strength of two pizza citations.
import fs from "node:fs";

const art = fs.readFileSync("src/content/articles/best-seafood-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync("data/consensus/seafood.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [norm(k), v]));

// Time Out is the only ranked source in this corpus, so a printed "Time Out #N"
// is checked against its own quotes.
const timeout = byNorm(doc.sources.find((s) => /timeout\.com/.test(s.url))?.quotes);

// The Good Food Guide is the only body that awards anything here. A "Good Food
// Guide" badge on an entry has to be a real tier-A citation in THIS corpus.
const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^\s*[-*|]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  const claimedRaw = line.match(/Cited by (\d+) sources?/)?.[1]
    ?? line.match(/\|\s*(\d+)(?:\s*·[^|]*)?\s*\|\s*[^|]*\|\s*$/)?.[1];
  const rank = line.match(/Time Out #(\d+)/);

  if (claimedRaw) {
    if (!lastName) { errors.push(`orphan citation line: ${line.trim()}`); }
    else {
      const rec = evByNorm[resolve(lastName)];
      const claimed = Number(claimedRaw);
      if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
      else {
        const scoped = rec.byTopic?.seafood?.sourceCount ?? null;
        if (scoped === null) errors.push(`${lastName}: has no seafood citations at all`);
        else if (scoped !== claimed) errors.push(`${lastName}: article says ${claimed}, seafood corpus says ${scoped}`);
        else checked.push(`${lastName}: ${claimed} OK`);
      }
    }
  }

  if (rank && lastName) {
    const real = timeout[resolve(lastName)]?.match(/^#(\d+) in Time Out/)?.[1];
    if (real !== rank[1]) errors.push(`${lastName}: "Time Out #${rank[1]}" not derivable (list says ${real ?? "not on it"})`);
  }

  // A Good Food Guide badge must correspond to a tier-A seafood citation.
  if (/·\s*Good Food Guide/.test(line) && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec?.byTopic?.seafood?.hasAward) errors.push(`${lastName}: badged "Good Food Guide" but carries no tier-A seafood citation`);
  }
}

const venues = Object.values(ev).filter((v) => v.byTopic?.seafood).map((v) => ({ ...v, ...v.byTopic.seafood }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  awards: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named restaurants\*\*/);
const m2 = art.match(/\*\*(\d+) restaurants are named by two or more independent sources; (\d+) carry a dated award\.\*\*/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1], awards: +m2[2] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}

console.log(`${checked.length} citation line(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
