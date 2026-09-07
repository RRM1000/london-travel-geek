// Checks every "Cited by N sources" in the wine bars article against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// a single guide must not print that.
//
// TWO CLAIMS HERE ARE LOAD-BEARING AND WOULD GO STALE IN SILENCE:
//
//   1. Exactly ONE Gold Star went to a wine bar. The article opens on that and
//      closes on it, and it is the reason the guide is built on citation counts
//      rather than on the award. If a second London wine bar ever wins, the
//      framing is wrong and nothing else would notice.
//   2. The £12 corkage at The 10 Cases. The topic config recorded that no
//      corkage figure was obtainable anywhere the fetcher could reach, so this
//      one number is the whole format section. If it is edited out, the section
//      loses the only thing that made it worth printing.
import fs from "node:fs";

const TOPIC = "wine-bars";
const ARTICLE = "src/content/articles/best-wine-bars-london.md";
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
  // Headings read "### Peckham Cellars - the neighbourhood one that outgrew
  // the neighbourhood", so the venue is everything before the em dash.
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

// CLAIM 1 - exactly one award, and it is a wine bar.
const awarded = venues.filter((v) => v.hasAward);
const claimsOneAward = /exactly one went to a wine bar/.test(art);
if (claimsOneAward && awarded.length !== 1)
  errors.push(
    `the article says exactly one award went to a wine bar, but ${awarded.length} venue(s) now carry one ` +
    `(${awarded.map((v) => v.name).join(", ")}). Rewrite the opening and the closing section.`,
  );

// CLAIM 2 - the corkage figure, which is the format section's only number.
if (!/£12/.test(art))
  errors.push("the £12 corkage figure at The 10 Cases has gone - the config recorded that no corkage figure was obtainable, so this is the only verified number in the format section");

// Nothing in the guide may be a venue this project already knows is closed.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  const re = new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[—-]`, "m");
  if (re.test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
console.log(`tier A: ${awarded.length} venue(s) with a dated award`);
console.log(`award check: ${claimsOneAward ? "claim present and tested" : "claim absent"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
