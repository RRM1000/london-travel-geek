// Checks every "Cited by N sources", every Time Out rank and every award badge
// in the fish and chips article against data/evidence.json and the sources' own
// quotes in data/consensus/fish-and-chips.json.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans all 48 corpora, and
// a single guide must not print that.
import fs from "node:fs";

const TOPIC = "fish-and-chips";
const art = fs.readFileSync("src/content/articles/best-fish-and-chips-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

// Quotes are keyed by the spelling the source used, so they need resolving too -
// Time Out writes "Golden Union" and the sheet says "Golden Union Fish Bar".
const byNorm = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o ?? {})) out[resolve(k)] = v;
  return out;
};
const timeout = byNorm(doc.sources.find((s) => s.url.includes("timeout.com"))?.quotes);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  // A bold first cell is the venue name in most tables - but in the Time Out
  // comparison table it is the RANK, and treating "#1" as a venue makes every
  // row of that table look like a missing restaurant. Those rows are handled
  // whole, further down.
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t && !/^#\d+$/.test(t[1].trim())) lastName = t[1].trim();
  if (t && /^#\d+$/.test(t[1].trim())) lastName = null;

  // "Cited by N sources" on an entry, or "| N sources |" / "| N |" in a table.
  const claimed = line.match(/Cited by (\d+) sources?/)?.[1]
    ?? line.match(/\|\s*(\d+) sources?\s*\|/)?.[1]
    ?? line.match(/\|\s*(\d+)\s*\|\s*[^|]*\|\s*$/)?.[1];
  if (claimed && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.[TOPIC]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no ${TOPIC} citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, ${TOPIC} corpus says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
  }

  for (const m of line.matchAll(/#(\d+), Time Out|Time Out rank[^|]*\|\s*\*\*#(\d+)\*\*/g)) {
    if (!lastName) continue;
    const want = m[1] ?? m[2];
    const real = timeout[resolve(lastName)]?.match(/^#(\d+) in Time Out/)?.[1];
    if (real !== want) errors.push(`${lastName}: "Time Out #${want}" not derivable (list says ${real ?? "not on it"})`);
    else checked.push(`${lastName}: Time Out #${want} OK`);
  }

  // An award badge must correspond to a real tier-A citation in THIS corpus.
  if (/National Fish and Chip Awards 2026 shortlist/.test(line) && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec?.byTopic?.[TOPIC]?.hasAward) errors.push(`${lastName}: badged with the award but carries no tier-A ${TOPIC} citation`);
    else checked.push(`${lastName}: award OK`);
  }
}

// The Time Out comparison table pairs a rank with a count in the same row.
for (const m of art.matchAll(/^\|\s*\*\*#(\d+)\*\*\s*\|\s*([^|,]+?)(?:,[^|]*)?\s*\|\s*(\d+) sources?\s*\|/gm)) {
  const [, rank, name, count] = m;
  const real = timeout[resolve(name)]?.match(/^#(\d+) in Time Out/)?.[1];
  if (real !== rank) errors.push(`ranking table: "${name}" printed at Time Out #${rank}, list says ${real ?? "not on it"}`);
  const scoped = evByNorm[resolve(name)]?.byTopic?.[TOPIC]?.sourceCount;
  if (scoped !== Number(count)) errors.push(`ranking table: "${name}" printed at ${count} sources, corpus says ${scoped ?? "none"}`);
  if (real === rank && scoped === Number(count)) checked.push(`table ${name} OK`);
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ ...v, ...v.byTopic[TOPIC] }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  awards: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named chippies\*\*/);
const m2 = art.match(/\*\*(\d+) are named by two or more independent sources; (\d+) carry a dated award\.\*\*/);
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
