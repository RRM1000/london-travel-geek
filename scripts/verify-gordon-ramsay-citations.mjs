// Checks every "Cited by N sources" and every "Named by none of the sources" claim in the Gordon Ramsay
// guide against data/evidence.json and data/consensus/gordon-ramsay.json, plus the figures in the
// evidence block, the Michelin stars on each facts line and the Time Out ratings quoted in the prose.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and High, the River
// Restaurant and Bread Street Kitchen Limehouse also sit in the rooftop corpus. This guide prints
// byTopic["gordon-ramsay"] only.
//
// "Sources" are distinct DOMAINS (a YouTube channel counts as its own domain), because that is what
// build-evidence counts. Nothing in this corpus is a ranked list, so no rank may be printed.
//
//   node scripts/verify-gordon-ramsay-citations.mjs
import fs from "node:fs";

const TOPIC = "gordon-ramsay";
const art = fs.readFileSync("src/content/articles/gordon-ramsay-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const ALIAS_MAP = new Map(Object.entries(ALIAS).map(([from, to]) => [norm(from), to]));
const resolve = (n) => norm(ALIAS_MAP.get(norm(n)) ?? n);

// What a heading says -> the name the sources and the evidence build use.
const HEADING = {
  "Lucky Cat at 22 Bishopsgate": "Lucky Cat 22 Bishopsgate",
  "The River Restaurant": "The River Restaurant by Gordon Ramsay",
  "Hell's Kitchen": "Hell's Kitchen London",
  "Gordon Ramsay Bar & Grill": "Gordon Ramsay Bar & Grill Mayfair",
  "Street Pizza": "Street Pizza",
  "Plane Food": "Plane Food",
  "Pizza East": "Pizza East",
};
// Branches covered together under one heading, each of which must have no citation.
const GROUPED_NONE = ["Bread Street Kitchen St Paul's", "Bread Street Kitchen The City", "Bread Street Kitchen Battersea", "Bread Street Kitchen Stratford"];

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;
const scopedCount = (name) => evByNorm[resolve(name)]?.byTopic?.[TOPIC]?.sourceCount ?? 0;

const hostOf = (url) => {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  if (/^(youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) {
    const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
    if (handle) return `${host}/${handle}`;
  }
  return host;
};

const michelinRecords = doc.sources.filter((s) => /guide\.michelin\.com/.test(s.url));
const michelinQuote = (name) => {
  for (const m of michelinRecords) {
    const key = Object.keys(m.quotes ?? {}).find((k) => resolve(k) === resolve(name));
    if (key && /MICHELIN STAR/.test(m.quotes[key])) return m.quotes[key];
  }
  return null;
};
// Time Out ratings, read out of the quotes ("Rated 4 out of 5 ...", "3 out of 5. ...").
const timeOutRating = (name) => {
  for (const s of doc.sources.filter((x) => /timeout\.com/.test(x.url))) {
    const key = Object.keys(s.quotes ?? {}).find((k) => resolve(k) === resolve(name));
    const m = key && s.quotes[key].match(/(\d) out of 5/);
    if (m) return Number(m[1]);
  }
  return null;
};

const errors = [], checked = [];
const headings = new Set();
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)\s*$/);
  if (h) {
    lastName = h[1].replace(/\s+\(.*\)\s*$/, "").replace(/,.*$/, "").replace(/\s+—.*$/, "").trim();
    lastName = HEADING[lastName] ?? lastName;
    headings.add(resolve(lastName));
  }
  if (!lastName) continue;

  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
  if (claimed) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.[TOPIC]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no ${TOPIC} citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, ${TOPIC} corpus says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
    if (closed[norm(lastName)] || Object.values(closed).some((c) => norm(c.name) === norm(lastName)))
      errors.push(`${lastName}: is in data/closed.json but has a citation line on the page`);
  }

  if (/Named by none of the sources/i.test(line)) {
    if (/^\*/.test(line) && scopedCount(lastName) !== 0) errors.push(`${lastName}: page says named by none, the corpus has ${scopedCount(lastName)}`);
    else checked.push(`${lastName}: named by none OK`);
  }

  // Michelin star claims on a facts line
  const stars = line.match(/^\*.*\b(Three|One|Two) Michelin stars?\b/);
  if (stars) {
    const q = michelinQuote(lastName);
    const want = { Three: "THREE", Two: "TWO", One: "ONE" }[stars[1]];
    if (!q || !q.startsWith(want)) errors.push(`${lastName}: facts line says ${stars[1]} Michelin star(s), the Michelin record says ${q ?? "nothing"}`);
    else checked.push(`${lastName}: ${stars[1]} Michelin OK`);
  }
  if (/^\*.*Listed in the Michelin Guide/.test(line)) {
    const rec = michelinRecords.find((m) => (m.names ?? []).some((n) => resolve(n) === resolve(lastName)));
    if (!rec || michelinQuote(lastName)) errors.push(`${lastName}: facts line says listed without a star, check the Michelin record`);
    else checked.push(`${lastName}: Michelin listing OK`);
  }

  // No rank may be printed: nothing in this corpus is an ordered list.
  if (/#\d+ of \d+/.test(line)) errors.push(`${lastName}: a rank is printed but no source in this corpus publishes an order`);
}

// The grouped Bread Street Kitchen branches must still be uncited.
for (const b of GROUPED_NONE) {
  if (scopedCount(b) !== 0) errors.push(`${b}: the page lists it as named by none, the corpus has ${scopedCount(b)}`);
  else checked.push(`${b}: named by none OK`);
}

// Time Out ratings quoted in words in the prose and FAQ.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const toClaims = [
  [/1890 five out of five/, "Restaurant 1890 by Gordon Ramsay"],
  [/Pétrus and the Chelsea flagship four/, "Pétrus by Gordon Ramsay"],
  [/Pétrus and the Chelsea flagship four/, "Restaurant Gordon Ramsay"],
  [/and High three/, "Restaurant Gordon Ramsay High"],
  [/gave it four out of five in 2023/, "Savoy Grill"],
];
for (const [re, name] of toClaims) {
  if (!re.test(art)) continue;
  const want = {
    "Restaurant 1890 by Gordon Ramsay": 5, "Pétrus by Gordon Ramsay": 4, "Restaurant Gordon Ramsay": 4,
    "Restaurant Gordon Ramsay High": 3, "Savoy Grill": 4,
  }[name];
  const real = timeOutRating(name);
  if (real !== want) errors.push(`${name}: page quotes a Time Out rating of ${want}, the corpus has ${real}`);
  else checked.push(`${name}: Time Out ${want}/5 OK`);
}
void WORDS;

// Every restaurant in the corpus must be on the page.
for (const v of Object.values(ev).filter((x) => x.byTopic?.[TOPIC])) {
  if (!headings.has(resolve(v.name))) errors.push(`${v.name}: in the corpus but has no heading on the page`);
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => v.byTopic[TOPIC]);
const domains = new Set(
  doc.sources
    .map((s) => hostOf(s.url))
    .filter((h) => !(REG.excluded ?? []).includes(h) && REG.domains[h]?.tier !== "F"),
);
const actual = {
  sources: domains.size,
  citations: venues.reduce((n, v) => n + v.sourceCount, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
};
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named restaurants\*\*/);
const m2 = art.match(/\*\*(\d+) restaurants are named by two or more independent sources/);
if (!m || !m2) errors.push("evidence block: could not find the figures in the article");
else {
  const claimedFig = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1] };
  for (const k of Object.keys(actual))
    if (claimedFig[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimedFig[k]}, the build says ${actual[k]}`);
}

// Declined hosted visits must not be counted.
for (const d of doc.declined ?? []) {
  if (doc.sources.some((s) => s.url === d.url)) errors.push(`declined source is also counted: ${d.url}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`evidence block: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
