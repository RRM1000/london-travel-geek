// Checks every "Cited by N sources" in the Caribbean article against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// a single guide must not print that.
//
// TWO CLAIMS HERE ARE STRUCTURAL AND WOULD ROT WITHOUT ANYTHING NOTICING:
//
//   1. Ewart's is named by four sources of which only ONE is a masthead. The
//      entry is entirely about that distribution - it is the example of the
//      community covering a place the magazines have not. If a masthead picks
//      it up, the entry stops being true.
//   2. No judged award is counted. The UK Caribbean Food Awards is real and
//      judged, but its domain returns a Cloudflare error and its winners could
//      not be verified, so nothing from it was seeded. If a tier A source is
//      ever added the evidence block's line has to change.
import fs from "node:fs";

const TOPIC = "caribbean";
const ARTICLE = "src/content/articles/best-caribbean-restaurants-london.md";
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

// CLAIM 1 - Ewart's is covered by one masthead and three non-mastheads. The
// whole entry argues from that split, so it is measured rather than trusted.
const ewarts = venues.find((v) => /ewart/i.test(v.name));
if (/only one is a masthead/i.test(art)) {
  if (!ewarts) errors.push("the article's Ewart's entry claims a source split, but Ewart's is not in the evidence at all");
  else {
    const mastheads = (ewarts.sources ?? []).filter((s) => s.tier === "B").length;
    if (mastheads !== 1)
      errors.push(`the Ewart's entry says only one of its sources is a masthead, but it now has ${mastheads}. Rewrite that entry - it exists to make the point about coverage.`);
  }
}

// CLAIM 2 - no judged award is counted here.
const awarded = venues.filter((v) => v.hasAward);
const claimsNoAward = /No judged award is counted here/.test(art);
if (claimsNoAward && awarded.length) {
  const names = awarded.map((v) => v.name).join(", ");
  errors.push(`the evidence block says no judged award is counted, but ${awarded.length} venue(s) now carry one (${names}). Update the block.`);
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
console.log(`tier A: ${awarded.length} venue(s) with a dated award - the no-award line is ${claimsNoAward ? "present and tested" : "absent"}`);
if (ewarts) console.log(`Ewart's: ${ewarts.sourceCount} sources, ${(ewarts.sources ?? []).filter((s) => s.tier === "B").length} masthead(s)`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
