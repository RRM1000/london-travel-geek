// Checks every "Cited by N sources" and every award badge in the Indian article
// against data/evidence.json and the awards' own quotes in
// data/consensus/steak.json. Anything that cannot be derived is an error.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans all 48 corpora, and
// a single guide must not print that.
import fs from "node:fs";

const art = fs.readFileSync("src/content/articles/best-steak-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync("data/consensus/steak.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [norm(k), v]));

// Steak has exactly one ranked source - the World's 101 Best Steak Restaurants -
// so a printed #N is checked against that list's own quotes.
const w101 = byNorm(doc.sources.find((s) => /101 Best Steak/i.test(s.name))?.quotes);


const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

// The article may use any name data/name-aliases.json accepts - "Crisp Pizza"
// is a legitimate way to refer to Crisp Pizza at The Marlborough.
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

// Every citation line: "**Name**" or "### Name, Area" followed by the metadata line.
const errors = [], checked = [];

// Pull each "Cited by N sources[ · rank · rank]" together with the nearest
// preceding venue name, whether that is a heading or a bold list item.
const lines = art.split(/\r?\n/);
let lastName = null;
for (const line of lines) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^\s*[-*|]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  const c = line.match(/Cited by (\d+) sources?/);
  if (!c) continue;
  if (!lastName) { errors.push(`orphan citation line: ${line.trim()}`); continue; }

  const key = resolve(lastName);
  const rec = evByNorm[key];
  const claimed = Number(c[1]);
  if (!rec) { errors.push(`${lastName}: not in evidence.json at all`); continue; }
  // Topic-scoped: sourceCount spans all 48 corpora, which is not what an Indian
  // guide is claiming when it prints a number.
  const scoped = rec.byTopic?.steak?.sourceCount ?? rec.sourceCount;
  if (scoped !== claimed)
    errors.push(`${lastName}: article says ${claimed}, steak corpus says ${scoped}`);
  else checked.push(`${lastName}: ${claimed} OK`);

  // The only rank this article can print is a World's 101 placement.
  const w = line.match(/#(\d+), World's 101/);
  if (w) {
    const real = w101[key]?.match(/^#(\d+) in the World's 101/)?.[1];
    if (real !== w[1]) errors.push(`${lastName}: "#${w[1]}, World's 101" not derivable (list says ${real ?? "not on it"})`);
  }
}

// Corpus-scale figures quoted in the methodology block. Read out of the article
// rather than hard-coded here, so the check cannot silently go stale the way it
// did when the National Pizza Awards source was rebuilt.
const steakVenues = Object.values(ev).filter((v) => v.topics.includes("steak"))
  .map((v) => ({ ...v, ...v.byTopic.steak }));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: steakVenues.length,
  twoPlus: steakVenues.filter((v) => v.sourceCount >= 2).length,
  awards: steakVenues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named restaurants\*\*/);
const m2 = art.match(/\*\*(\d+) restaurants are named by two or more independent sources; (\d+) carry a dated (?:award|ranking)\.\*\*/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1], awards: +m2[2] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}
const facts = { ok: !errors.some((e) => e.startsWith("methodology")) };

console.log(`${checked.length} citation line(s) verified against the evidence build`);
console.log(`methodology figures: ${facts.ok ? "all correct" : "MISMATCH"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
