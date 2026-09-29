// Checks that every number printed in the hotels-with-a-pool guide is still true.
//
// Figures are READ OUT OF THE ARTICLE and compared against data/evidence.json,
// data/consensus/hotels-pool.json and data/topics/hotels-pool.json, the same
// design as verify-family-hotels-citations.mjs. Nothing expected is hard-coded:
// rebuild the evidence and this re-derives every figure.
//
// It checks:
//   - the evidence block: sources, citations, named hotels, hotels on 2+
//   - the YouTube channel count in the same block
//   - each entry's "Cited by N" against this topic's count only (trap 7)
//   - each entry sits in the section its topic-config group says, and names
//     the station the config names
//   - every config candidate and every notASwimmingPool hotel has an entry,
//     and nothing has an entry without a config row
//   - The Berkeley's entry still says its pool is seasonal
//   - no working notes (PENDING, TODO, verify) reached the page
//
//   node scripts/verify-pool-hotels-citations.mjs
import fs from "node:fs";

const ARTICLE = process.env.ARTICLE ?? "src/content/articles/hotels-with-pool-london.md";
const TOPIC = "hotels-pool";
const article = fs.readFileSync(ARTICLE, "utf8").replace(/\r\n/g, "\n");
const body = article.replace(/^---\n[\s\S]*?\n---\n/, "");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const corpus = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const topic = JSON.parse(fs.readFileSync(`data/topics/${TOPIC}.json`, "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, data says ${actual}`);
};

// ---- derived figures, scoped to this topic only ----------------------------
const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes(TOPIC))
  .map((v) => ({ name: v.name, count: v.byTopic[TOPIC].sourceCount }));
const countOf = new Map(rows.map((r) => [norm(r.name), r.count]));

const hostOf = (url) => {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
  return /^(youtube\.com|tiktok\.com)$/.test(host) && handle ? `${host}/${handle}` : host;
};
// A record that carried no names (The Telegraph's 402) contributed nothing and
// is not counted as a source (trap 8).
const hosts = new Set(corpus.sources.filter((s) => (s.names ?? []).length).map((s) => hostOf(s.url)));
const derived = {
  sources: hosts.size,
  citations: rows.reduce((a, r) => a + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
  youtube: [...hosts].filter((h) => h.startsWith("youtube.com/")).length,
};

// ---- the evidence block ------------------------------------------------------
const block = body.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named hotels\*\*/);
if (!block) errors.push('evidence block: "N sources carrying N citations across N named hotels" not found or reworded');
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named hotels", block[3], derived.venues);
}
const two = body.match(/\*\*(\d+) hotels are named by two or more independent sources/);
if (!two) errors.push("evidence block: two-or-more sentence not found or reworded");
else check("named by 2+", two[1], derived.twoPlus);
const yt = body.match(/and (\w+) YouTube channels/);
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
if (yt) check("YouTube channels", WORDS.indexOf(yt[1]) >= 0 ? WORDS.indexOf(yt[1]) : yt[1], derived.youtube);

// The Short Version's "named by N of the M sources" for the most-cited hotel.
const corinthia = body.match(/Corinthia London is on (\d+) of the lists/);
if (corinthia) check("Short Version Corinthia count", corinthia[1], countOf.get(norm("The Corinthia")));
const topLine = body.match(/named by (\d+) of the (\d+) sources, more than any other hotel/);
if (topLine) {
  const top = [...rows].sort((a, b) => b.count - a.count);
  check("Short Version top count", topLine[1], top[0].count);
  check("Short Version source total", topLine[2], derived.sources);
  if (top[1] && top[1].count === top[0].count) errors.push(`"more than any other hotel" is false: ${top[0].name} and ${top[1].name} tie`);
}

// ---- sections ----------------------------------------------------------------
const SECTION_GROUP = {
  "Rooftop and sky-high pools": "rooftop",
  "Pools that welcome children": "family",
  "Spa pools, mostly for adults": "spa",
  "Good-value hotels with a pool": "chain",
  "On the pool lists, but not a swimming pool": "not-a-pool",
};
const entries = [];
for (const part of body.split(/^## /m).slice(1)) {
  const [head, ...rest] = part.split("\n");
  const group = SECTION_GROUP[head.trim()];
  if (!group) continue;
  for (const m of rest.join("\n").matchAll(/^### (.+)\n\n(\*[^\n]*\*)\n\n([^\n]+)/gm)) {
    entries.push({ group, name: m[1].trim(), meta: m[2], prose: m[3] });
  }
}
for (const g of Object.keys(SECTION_GROUP)) if (!body.includes(`\n## ${g}\n`)) errors.push(`section "${g}" not found`);
if (entries.length < 20) errors.push(`only ${entries.length} hotel entries matched - has the format changed?`);

const configRows = [
  ...topic.candidates.map((c) => ({ ...c })),
  ...topic.notASwimmingPool.map((n) => ({ ...n, group: "not-a-pool" })),
];
const byName = new Map(configRows.map((c) => [norm(c.name), c]));

for (const e of entries) {
  const c = byName.get(norm(e.name));
  if (!c) { errors.push(`${e.name}: has an entry but no row in data/topics/${TOPIC}.json`); continue; }
  const key = norm(c.evidenceKey ?? c.name);
  const cited = e.meta.match(/Cited by (\d+) sources?/);
  if (!cited) errors.push(`${e.name}: no "Cited by" in its facts line`);
  else if (!countOf.has(key)) errors.push(`${e.name}: no ${TOPIC} evidence under "${c.evidenceKey}"`);
  else check(`${e.name} citation line`, cited[1], countOf.get(key));

  if (c.group !== e.group) errors.push(`${e.name}: sits under "${e.group}" but the topic config says "${c.group}"`);
  const station = e.meta.match(/Station: ([^·]+)·/);
  if (c.station && (!station || station[1].trim() !== c.station)) {
    errors.push(`${e.name}: facts line names station "${station?.[1]?.trim()}" but the config says "${c.station}"`);
  }
  if (c.link && !e.meta.includes(`(${c.link})`)) errors.push(`${e.name}: facts line does not carry the config's link ${c.link}`);
  const words = e.prose.split(/\s+/).length;
  if (words < 50) errors.push(`${e.name}: entry is ${words} words, under the 50-word floor`);
}
for (const c of configRows) {
  if (!entries.find((e) => norm(e.name) === norm(c.name))) errors.push(`${c.name}: in the topic config but has no entry in the article`);
}

// ---- facts that must not drift ---------------------------------------------
const berkeley = entries.find((e) => norm(e.name) === "berkeley");
if (berkeley && !/spring and summer/.test(berkeley.meta + berkeley.prose)) errors.push("The Berkeley: entry no longer says the rooftop pool is seasonal");
if (/\b(PENDING|TODO|TBC|needs verifying|unconfirmed)\b/i.test(body)) errors.push("the article carries a working note (PENDING / TODO / unconfirmed)");

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the hotels-with-a-pool guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `hotels-with-a-pool guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} named hotels, ${derived.twoPlus} on two or more, ${entries.length} entries checked`,
);
