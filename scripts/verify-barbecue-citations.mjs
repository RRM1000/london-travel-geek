// Checks every "Cited by N sources" in the barbecue article against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// a single guide must not print that.
//
// THREE CLAIMS HERE ARE LOAD-BEARING AND ROT SILENTLY:
//
//   1. NO JUDGED AWARD EXISTS for this topic. The article says so in the
//      evidence block and builds its opening on the absence. The British BBQ
//      Society judges cook teams and Grillstock is liquidated - but if either
//      ever starts awarding restaurants, or another body does, the framing is
//      wrong and nothing else in the project would notice.
//   2. Smokestak is the most-cited, by a distance. The opening and the first
//      entry both rest on it.
//   3. Texas Joe's is CLOSED SUNDAY AND MONDAY. That is the single fact on the
//      page most likely to waste a reader's journey, and the only one printed
//      as a warning callout.
import fs from "node:fs";

const TOPIC = "barbecue";
const ARTICLE = "src/content/articles/best-barbecue-london.md";
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

// CLAIM 1 - no judged award. Checked rather than trusted, because the absence
// is what the opening argues from.
const awarded = venues.filter((v) => v.hasAward);
const claimsNoAward = /No judged award exists for this topic/.test(art);
if (claimsNoAward && awarded.length) {
  const names = awarded.map((v) => v.name).join(", ");
  errors.push(
    `the article says no judged award exists for barbecue, but ${awarded.length} venue(s) now carry one (${names}). Rewrite the evidence block and the opening.`,
  );
}

// CLAIM 2 - Smokestak leads.
const top = [...venues].sort((a, b) => b.sourceCount - a.sourceCount)[0];
if (/named by nine of fifteen sources|Nine of fifteen sources name it/i.test(art) && top && !/smokestak/i.test(top.name)) {
  errors.push(`the article says Smokestak is the most-cited, but the top of the evidence is now ${top.name} at ${top.sourceCount}`);
}

// CLAIM 3 - the closed days. The one warning callout on the page.
if (!/closed Sunday and Monday/i.test(art)) {
  errors.push("the Texas Joe's closed-days warning has gone from the article - it is the fact most likely to waste a reader's journey");
}

// Nothing in the guide may be a venue this project already knows is closed.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  const re = new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[—-]`, "m");
  if (re.test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
console.log(`tier A: ${awarded.length} venue(s) with a dated award - the no-award claim is ${claimsNoAward ? "present and tested" : "absent"}`);
console.log(`most-cited: ${top ? `${top.name} at ${top.sourceCount}` : "none"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
