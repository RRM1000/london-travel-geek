// Checks every "Cited by N sources" in the fried chicken article against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// a single guide must not print that.
//
// THIS GUIDE IS BUILT ON A DISAGREEMENT, so two claims here are load-bearing in
// a way a citation count is not, and both go stale silently:
//
//   1. The champion, 20Ft Fried Chicken, appears on NO editorial list - it is
//      named by the award and nothing else. The article opens on that fact and
//      returns to it twice. The moment any masthead or blog names 20Ft, the
//      framing is wrong and nothing else in the project would notice.
//   2. Sichuan Fry is recorded as permanently closed. A guide that prints a
//      closure has to keep being right about it.
//
// Same reasoning as the skill's rule about marking what the evidence does not
// reach: make the verifier check the absence, not just the presence.
import fs from "node:fs";

const TOPIC = "fried-chicken";
const ARTICLE = "src/content/articles/best-fried-chicken-london.md";
const art = fs.readFileSync(ARTICLE, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const aliasFile = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8"));
const ALIAS = aliasFile.aliases ?? aliasFile;
const resolve = (n) => {
  const hit = Object.keys(ALIAS).find((k) => typeof ALIAS[k] === "string" && norm(k) === norm(n));
  return norm(hit ? ALIAS[hit] : n);
};

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  // Headings here read "### Good Friend - the most-cited fried chicken in
  // London", so the venue is everything before the em dash rather than before
  // the last comma.
  const h = line.match(/^#{3,4}\s+(.+?)\s+[—-]\s+/);
  if (h) lastName = h[1].trim();

  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
  if (claimed && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.[TOPIC]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no ${TOPIC} citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, ${TOPIC} evidence says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
  }
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ ...v, ...v.byTopic[TOPIC] }));
const actual = {
  sources: doc.sources.filter((s) => (s.names ?? []).length).length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  awarded: venues.filter((v) => v.hasAward).length,
};

const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*/);
const m2 = art.match(/\*\*(\d+) are named by two or more sources/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1] };
  for (const k of Object.keys(claimed))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}

// CLAIM 1: the champion is on no editorial list. "Editorial" means any tier
// other than A - a masthead, a blog or a video channel. If 20Ft ever picks one
// up, the article's entire framing needs rewriting.
const champion = venues.find((v) => norm(v.name) === norm("20Ft Fried Chicken"));
const claimsChampionUncited = /appears on \*\*no editorial list in this pass at all\*\*/.test(art);
if (!champion) {
  errors.push("20Ft Fried Chicken is not in the evidence at all - the award source may have been dropped");
} else if (claimsChampionUncited) {
  const nonAward = (champion.sources ?? []).filter((s) => s.tier !== "A");
  if (nonAward.length)
    errors.push(
      `the article says the champion appears on no editorial list, but 20Ft is now named by ` +
      `${nonAward.length} non-award source(s): ${nonAward.map((s) => s.source).join(", ")}. Rewrite the opening.`,
    );
}

// CLAIM 2: Sichuan Fry is closed. Checked against the project's own list rather
// than left as a sentence nobody revisits.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
const closedNames = Object.values(closed).map((c) => norm(c.name));
if (/Sichuan Fry[^.]*permanently closed/i.test(art) && !closedNames.includes(norm("Sichuan Fry")))
  errors.push("the article calls Sichuan Fry permanently closed but it is not in data/closed.json - record it there so one place is authoritative");

// Nothing in the guide may be a venue this project already knows is closed.
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  const re = new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[—-]`, "m");
  if (re.test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
console.log(`tier A: ${actual.awarded} venue(s) with a dated award`);
console.log(`champion check: ${claimsChampionUncited ? "claim present and tested" : "claim absent"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
