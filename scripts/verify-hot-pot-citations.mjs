// Checks every "Cited by N sources" in the hot pot article against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// a single guide must not print that.
//
// THIS TOPIC HAS NO TIER A AND THE ARTICLE SAYS SO IN PRINT. There is no
// judged, dated ranking for hot pot anywhere - no Michelin category, no Good
// Food Guide list, nothing - and the evidence block states plainly that not one
// venue carries one. That sentence goes stale the moment a source with an award
// is added, and nothing else would notice, so the absence is checked here
// rather than trusted. Same reasoning as the skill's rule about marking what
// the evidence does not reach: make the verifier check the absence.
import fs from "node:fs";

const TOPIC = "hot-pot";
const ARTICLE = "src/content/articles/best-hot-pot-london.md";
const art = fs.readFileSync(ARTICLE, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

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
  // "### Haidilao, Leicester Square" - the map's anchor format, so the venue is
  // everything before the last comma.
  const h = line.match(/^#{3,4}\s+(.+?),\s*[^,]+\s*$/);
  if (h) lastName = h[1].trim();
  // "- **Laoma** - King's Cross Road..." and "- **Nan Hotpot**, Chinatown - ..."
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();

  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
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
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ ...v, ...v.byTopic[TOPIC] }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*/);
const m2 = art.match(/\*\*(\d+) restaurants are named by two or more independent sources/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}

// The no-award claim, checked rather than trusted.
const awarded = venues.filter((v) => v.hasAward);
const claimsNoAward = /not one venue on this page carries a dated ranking/i.test(art);
if (awarded.length && claimsNoAward) {
  errors.push(
    `methodology: the article says no venue carries a dated ranking, but ${awarded.length} now do ` +
    `(${awarded.map((v) => v.name).join(", ")}). Rewrite the evidence block.`,
  );
} else if (!awarded.length && !claimsNoAward) {
  errors.push("methodology: no venue carries an award and the article no longer says so. The absence is the finding - say it.");
}

// Nothing in the guide may be a venue this project already knows is closed.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  const re = new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`, "m");
  if (re.test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
console.log(`tier A: ${awarded.length} venue(s) with a dated award - the article's no-award claim is ${claimsNoAward ? "present" : "absent"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
