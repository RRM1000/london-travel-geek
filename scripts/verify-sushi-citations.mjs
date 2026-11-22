// Checks every "Cited by N sources", every printed rank and every "named in N Reddit threads"
// claim in the sushi guide against data/evidence.json and data/consensus/sushi.json, plus the
// figures in the evidence block.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and Sumi, Chisou,
// Zuma and Nobu also sit in the Japanese corpus. This guide prints byTopic.sushi only.
//
// "Sources" are distinct DOMAINS (a YouTube channel counts as its own domain, every Reddit
// thread shares one), because that is what build-evidence counts. The record count in the
// consensus file is larger: a masthead with three guides is three records and one opinion.
//
// Ranks: Time Out's list is the only ranked source in this corpus, so a printed "#N of 20,
// Time Out" must match the order of names in that record. Every other source is unordered and
// carries no rank. A Michelin star printed on an entry must be in the Michelin record's quote.
//
//   node scripts/verify-sushi-citations.mjs
import fs from "node:fs";

const TOPIC = "sushi";
const art = fs.readFileSync("src/content/articles/best-sushi-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
// Same rule as build-evidence.mjs: a Map keyed on the normalised alias, so a later entry overrides an earlier one.
const ALIAS_MAP = new Map(Object.entries(ALIAS).map(([from, to]) => [norm(from), to]));
const resolve = (n) => norm(ALIAS_MAP.get(norm(n)) ?? n);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const hostOf = (url) => {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  if (/^(youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) {
    const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
    if (handle) return `${host}/${handle}`;
  }
  return host;
};

const timeOut = doc.sources.find((s) => /timeout\.com/.test(s.url) && s.ranked);
const timeOutRank = (name) => {
  const i = timeOut.names.findIndex((n) => resolve(n) === resolve(name));
  return i < 0 ? null : i + 1;
};
const michelin = doc.sources.find((s) => /guide\.michelin\.com/.test(s.url));
const michelinQuote = (name) => {
  const key = Object.keys(michelin.quotes ?? {}).find((k) => resolve(k) === resolve(name));
  return key ? michelin.quotes[key] : null;
};
// Reddit is recorded as one record per subreddit with a threads array; a thread counts once per restaurant.
const allThreads = doc.sources.filter((s) => /reddit.com/.test(s.url)).flatMap((s) => s.threads ?? [{ names: s.names }]);
const redditThreads = (name) => allThreads.filter((t) => t.names.some((n) => resolve(n) === resolve(name))).length;
const totalThreads = allThreads.length;

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  // "### Sushi Tetsu, Clerkenwell — the line" -> "Sushi Tetsu"
  const h = line.match(/^#{3,4}\s+(.+?)\s*$/);
  if (h) lastName = h[1].replace(/\s+—.*$/, "").replace(/,.*$/, "").trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].replace(/,.*$/, "").trim();
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

  // "#5 of 20, Time Out"
  for (const m of line.matchAll(/#(\d+) of 20,? Time Out/g)) {
    const real = timeOutRank(lastName);
    if (String(real) !== m[1]) errors.push(`${lastName}: "#${m[1]} of 20, Time Out" not derivable (list says ${real ?? "not on it"})`);
    else checked.push(`${lastName}: Time Out #${m[1]} OK`);
  }
  // any other printed rank against a name is a claim we cannot verify
  for (const m of line.matchAll(/#(\d+) of (\d+)/g)) {
    if (m[2] !== "20") errors.push(`${lastName}: printed rank "#${m[1]} of ${m[2]}" has no ordered source behind it`);
  }

  // "named in 5 of the 12 Reddit threads"
  const rt = line.match(/named in (\d+) of the (\d+) Reddit threads/);
  if (rt) {
    const real = redditThreads(lastName);
    if (Number(rt[1]) !== real) errors.push(`${lastName}: article says ${rt[1]} Reddit threads, the corpus has ${real}`);
    else if (Number(rt[2]) !== totalThreads) errors.push(`${lastName}: article says ${rt[2]} threads read, the corpus has ${totalThreads}`);
    else checked.push(`${lastName}: ${rt[1]} Reddit threads OK`);
  }

  // Michelin star claims
  if (/\b(one|two|three) Michelin stars?\b/i.test(line) && /^\*[^*]/.test(line)) {
    const q = michelinQuote(lastName);
    if (!q || !/STAR/.test(q)) errors.push(`${lastName}: facts line claims a Michelin star the Michelin record does not carry`);
    else checked.push(`${lastName}: Michelin star OK`);
  }
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

// Every Time Out rank has to be a real one and no unordered source may carry rank wording.
if (/Infatuation[^.\n]*#\d|Hot Dinners[^.\n]*#\d|Michelin[^.\n]*#\d/.test(art.replace(/#\d+ of 20,? Time Out/g, "")))
  errors.push("a rank is printed against an unordered source");

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`evidence block: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
