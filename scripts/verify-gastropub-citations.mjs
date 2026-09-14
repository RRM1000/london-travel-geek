// Checks every "Cited by N sources" in the gastropubs guide against data/evidence.json,
// every rank printed in a citation line against the source that published it, and the
// evidence block's figures against the build.
//
// Counts are TOPIC-SCOPED to gastropub-food. Headings carry the area ("The Devonshire,
// Soho"), so a heading that does not match a record is retried without its last comma
// part - except where the canonical name itself carries the area (The Cow, Notting Hill).
//
// THREE CLAIMS ARE LOAD-BEARING AND WOULD GO STALE IN SILENCE:
//   1. The Harwood Arms is London's only Michelin-starred pub. It is in the short version,
//      a heading and an FAQ. It rests on the Michelin record's quote.
//   2. The opening's disagreement: Estrella Damm #1 is The Devonshire, Time Out's #1 is The
//      Camberwell Arms, the Evening Standard's #1 is The French House. If any list is
//      re-collected with a new number one, the first two paragraphs are wrong.
//   3. "seven of the pubs below are closed on Mondays" - the count is printed and the
//      names are in the FAQ; the two must stay the same length.
import fs from "node:fs";

const TOPIC = "gastropub-food";
const ARTICLE = "src/content/articles/best-gastropubs-london.md";
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
for (const v of Object.values(ev)) if (v.byTopic?.[TOPIC]) evByNorm[norm(v.name)] = v;
const lookup = (name) => evByNorm[resolve(name)] ?? evByNorm[resolve(name.replace(/,[^,]*$/, ""))] ?? null;

const errors = [], checked = [];

// 1. Per-entry counts, from headings and from the "Also on the lists" table.
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)\s+—\s+/);
  if (h) lastName = h[1].trim();
  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
  if (claimed && lastName) {
    const rec = lookup(lastName);
    const got = rec?.byTopic[TOPIC].sourceCount;
    if (got === undefined) errors.push(`${lastName}: no ${TOPIC} citations in evidence.json`);
    else if (got !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, evidence says ${got}`);
    else checked.push(`${lastName}: ${claimed}`);
  }
  const row = line.match(/^\|\s*([^|*]+?)\s*\|\s*[^|]+\|\s*(\d+)\s*\|/);
  if (row && !/Cited by/.test(line)) {
    const rec = lookup(row[1]);
    const got = rec?.byTopic[TOPIC].sourceCount;
    if (got === undefined) errors.push(`table row ${row[1]}: no ${TOPIC} citations`);
    else if (got !== Number(row[2])) errors.push(`table row ${row[1]}: article says ${row[2]}, evidence says ${got}`);
    else checked.push(`table ${row[1]}: ${row[2]}`);
  }
}

// 2. Ranks. Every "#N, Estrella Damm", "#N of 20, Time Out" and "#N of 50, Evening Standard"
//    on an entry's citation line must match that source's own quote for the venue.
const rankOf = (sourceMatch, name) => {
  const src = doc.sources.find((s) => sourceMatch.test(s.name));
  const key = Object.keys(src?.quotes ?? {}).find((k) => resolve(k) === resolve(name) || resolve(k) === resolve(name.replace(/,[^,]*$/, "")));
  return key ? src.quotes[key].match(/#(\d+)/)?.[1] ?? null : null;
};
lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)\s+—\s+/);
  if (h) { lastName = h[1].trim(); continue; }
  if (!lastName || !/Cited by/.test(line)) continue;
  for (const [re, srcRe, label] of [
    [/#(\d+), Estrella Damm/, /^Estrella Damm/, "Estrella Damm"],
    [/#(\d+) of 20, Time Out/, /^Time Out/, "Time Out"],
    [/#(\d+) of 50, Evening Standard/, /^Evening Standard/, "Evening Standard"],
  ]) {
    const printed = line.match(re)?.[1];
    if (!printed) continue;
    const actual = rankOf(srcRe, lastName);
    if (actual !== printed) errors.push(`${lastName}: prints #${printed} ${label}, the source says ${actual ?? "not listed"}`);
    else checked.push(`${lastName}: #${printed} ${label}`);
    if (label === "Estrella Damm" && Number(printed) > 50 && !/extended list/.test(line))
      errors.push(`${lastName}: #${printed} is on the 51-100 extension and the line does not say so`);
  }
}

// 3. Evidence block.
const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => v.byTopic[TOPIC]);
const actual = {
  sources: doc.sources.filter((s) => (s.names ?? []).length).length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  judged: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*\. \*\*(\d+) are named by two or more sources; (\d+) are on a judged list/);
if (!m) errors.push("methodology: could not find the figures block");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m[4], judged: +m[5] };
  for (const k of Object.keys(claimed)) if (claimed[k] !== actual[k]) errors.push(`methodology: article says ${k} = ${claimed[k]}, build says ${actual[k]}`);
}

// 4. Load-bearing claims.
const michelin = doc.sources.find((s) => /^Michelin/.test(s.name));
if (!/only MICHELIN-Star pub/i.test(michelin?.quotes?.["The Harwood Arms"] ?? ""))
  errors.push("the Harwood Arms 'only Michelin-starred pub' claim no longer rests on the Michelin record's quote");
const first = (re) => { const s = doc.sources.find((x) => re.test(x.name)); return Object.entries(s?.quotes ?? {}).find(([, q]) => /^#1\b/.test(q))?.[0]; };
for (const [re, want, label] of [[/^Estrella Damm/, "The Devonshire", "Estrella Damm"], [/^Time Out/, "The Camberwell Arms", "Time Out"], [/^Evening Standard/, "The French House", "Evening Standard"]]) {
  const got = first(re);
  if (!got || resolve(got) !== resolve(want)) errors.push(`opening says ${label}'s number one is ${want}; the record says ${got ?? "none"}`);
}
const monday = art.match(/seven of the pubs below are \*\*closed on Mondays\*\*/) ? 7 : null;
const faqMonday = art.match(/a: "The Marksman,([^"]+?) are all closed on Mondays/);
if (monday && faqMonday) {
  const n = ("The Marksman," + faqMonday[1]).split(/,| and /).map((x) => x.trim()).filter(Boolean).length;
  if (n !== monday) errors.push(`short version says seven pubs close on Mondays; the FAQ names ${n}`);
}

// Nothing with an entry may be on the closed list.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  if (new RegExp(`^#{3,4}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[, ]`, "m").test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("no unverifiable numbers found");
