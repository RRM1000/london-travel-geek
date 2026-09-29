// Checks every "Cited by N sources" in the dinner-and-a-show guide against
// data/evidence.json, and the evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// this guide must print only what the dinner-and-a-show sources say. Ronnie
// Scott's is cited across live-music, hotels and this topic; only this topic's
// count belongs here.
//
// TWO CLAIMS ON THIS PAGE WOULD GO STALE IN SILENCE:
//
//   1. "No award body judges this category", which is why the page ranks
//      nothing and groups by format instead. If a tier-A source is ever added
//      to the corpus, the framing is wrong and nothing else would notice.
//   2. The most-cited venue. The Short Version names it; if the build moves,
//      the sentence is false.
//
//   node scripts/verify-dinner-and-a-show-citations.mjs
import fs from "node:fs";

const TOPIC = "dinner-and-a-show";
const ARTICLE = "src/content/articles/dinner-and-a-show-london.md";
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

// Headings read "### Ronnie Scott's, Soho": the venue is everything before the
// first comma. A heading can name the evidence record explicitly where the
// page name and the recorded name differ - "<!-- evidence: Dishoom -->" on
// the line under the heading.
const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s+[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const override = line.match(/<!--\s*evidence:\s*(.+?)\s*-->/);
  if (override) lastName = override[1];

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

// Table rows carry their own count: "| **[Name](url)** | ... | 3 sources |".
for (const line of art.split(/\r?\n/)) {
  const row = line.match(/^\|\s*\*\*\[?([^\]*|]+?)\]?(?:\([^)]*\))?\*\*.*?\|\s*(\d+) sources?\s*\|/);
  if (!row) continue;
  const [, name, n] = row;
  const rec = evByNorm[resolve(name.trim())];
  const scoped = rec?.byTopic?.[TOPIC]?.sourceCount;
  if (scoped == null) errors.push(`table row ${name}: no ${TOPIC} citations`);
  else if (scoped !== Number(n)) errors.push(`table row ${name}: article says ${n}, evidence says ${scoped}`);
  else checked.push(`table ${name}: ${n} OK`);
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ ...v, ...v.byTopic[TOPIC] }));
const actual = {
  sources: new Set(doc.sources.filter((s) => (s.names ?? []).length).map((s) => {
    const u = new URL(s.url);
    const host = u.hostname.replace(/^www\./, "");
    const handle = /^(youtube\.com|tiktok\.com)$/.test(host) ? u.pathname.match(/\/(@[^/]+)/)?.[1] : null;
    return handle ? `${host}/${handle}` : host;
  })).size,
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
};

const m = art.match(/\*\*(\d+) independent sources\*\* naming \*\*(\d+) venues\*\*/);
const m2 = art.match(/\*\*(\d+) are named by two or more/);
if (!m || !m2) errors.push("evidence block: could not find the figures in the article");
else {
  const claimed = { sources: +m[1], venues: +m[2], twoPlus: +m2[1] };
  for (const k of Object.keys(claimed))
    if (claimed[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimed[k]}, build says ${actual[k]}`);
}

// CLAIM 1 - no award.
const awarded = venues.filter((v) => v.hasAward);
if (/no award body/i.test(art) && awarded.length)
  errors.push(`the article says no award body judges this category, but ${awarded.length} venue(s) now carry a tier-A citation`);

// CLAIM 2 - the most-cited venue named in the Short Version.
const top = [...venues].sort((a, b) => b.sourceCount - a.sourceCount);
// The Short Version reads "**The Blues Kitchen** is named by more of the
// sources than anything else" - the bold name sits directly before the claim.
const mc = art.match(/\*\*([^*]+)\*\*\s+is named by more of the sources than anything else/);
if (!mc) errors.push("the Short Version no longer names the most-cited venue in the expected form");
else {
  const rec = evByNorm[resolve(mc[1])];
  const n = rec?.byTopic?.[TOPIC]?.sourceCount ?? 0;
  if (n < top[0].sourceCount || top.filter((v) => v.sourceCount === n).length > 1)
    errors.push(`"${mc[1]}" is called the most-cited, but the build has ${top[0].name} on ${top[0].sourceCount} and ${mc[1]} on ${n}`);
  else checked.push(`most-cited: ${mc[1]} on ${n} OK`);
}

// Nothing in the guide may be a venue this project already knows is closed.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  if (!name) continue;
  const re = new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|\\s*$)`, "m");
  if (re.test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`evidence figures: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
