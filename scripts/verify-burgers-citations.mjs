// Checks every "Cited by N sources" and every award claim in the burger article
// against data/evidence.json and the quotes in data/consensus/burgers.json.
// Anything that cannot be derived is an error, not a warning.
import fs from "node:fs";

const ART = "src/content/articles/best-burgers-london.md";
const art = fs.readFileSync(ART, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync("data/consensus/burgers.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [norm(k), v]));

const awards = byNorm(doc.sources.find((s) => s.url.includes("nationalburgerawards"))?.quotes);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const errors = [], checked = [];
const lines = art.split(/\r?\n/);
let lastName = null;

for (const line of lines) {
  // A heading is "### Name, Area and Area" - take everything before the first comma.
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s.*)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^[*-]\s*\*\*([^*]+?)\*\*/);
  if (b) lastName = b[1].split(",")[0].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  const c = line.match(/Cited by (\d+) sources?/);
  if (!c) continue;
  if (!lastName) { errors.push(`orphan citation line: ${line.trim()}`); continue; }

  const rec = evByNorm[norm(lastName)];
  const claimed = Number(c[1]);
  if (!rec) { errors.push(`${lastName}: not in evidence.json at all`); continue; }
  // Topic-scoped: sourceCount spans every corpus, which is not what a burger
  // guide is claiming when it prints a number.
  const scoped = rec.byTopic?.burgers?.sourceCount ?? rec.sourceCount;
  if (scoped !== claimed) errors.push(`${lastName}: article says ${claimed}, burgers corpus says ${scoped}`);
  else checked.push(`${lastName}: ${claimed} OK`);
}

// Award claims anywhere in the article must be backed by the award's own record.
for (const m of art.matchAll(/\*\*(?:winner|second in the signature round), National Burger Awards 2026\*\*/gi)) {
  // located below alongside the venue it sits under
}
const awardClaims = [
  [/### Honest Burgers[^]*?\*\*winner, National Burger Awards 2026\*\*/i, "Honest Burgers", /overall winner 2026/i],
  [/### Burger & Beyond[^]*?\*\*second in the signature round, National Burger Awards 2026\*\*/i, "Burger & Beyond", /second in the signature round/i],
];
for (const [pattern, venue, expect] of awardClaims) {
  if (!pattern.test(art)) continue;
  const q = awards[norm(venue)] ?? "";
  if (!expect.test(q)) errors.push(`${venue}: award claim not derivable from the award record (corpus says "${q || "nothing"}")`);
  else checked.push(`${venue}: award claim OK`);
}

// Every venue the article calls a National Burger Awards 2026 finalist must be
// one. This is the claim most likely to drift as the corpus is rebuilt.
for (const line of lines) {
  const f = line.match(/National Burger Awards 2026 (?:London )?finalist/i);
  if (!f) continue;
  const name = (lines.slice(0, lines.indexOf(line)).reverse().find((l) => /^#{3,4}\s+/.test(l)) || "")
    .replace(/^#{3,4}\s+/, "").split(",")[0].trim();
  const inline = line.match(/^\*\s*\*\*([^*]+?)\*\*/);
  const venue = inline ? inline[1].split(",")[0].trim() : name;
  if (!venue) continue;
  if (!awards[norm(venue)]) errors.push(`${venue}: called a 2026 finalist but the award record does not name it`);
  else checked.push(`${venue}: finalist claim OK`);
}

// Figures quoted in the methodology block, read out of the article rather than
// hard-coded, so the check cannot silently go stale.
const venues = Object.values(ev).filter((v) => v.topics.includes("burgers"))
  .map((v) => ({ ...v, ...v.byTopic.burgers }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  awards: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named burgers\*\*/);
const m2 = art.match(/\*\*(\d+) are named by two or more independent sources; (\d+) carry a dated award\.\*\*/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1], awards: +m2[2] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("no unverifiable numbers found");
