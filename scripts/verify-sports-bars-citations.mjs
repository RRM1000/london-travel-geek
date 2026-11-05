// Checks every "Cited by N sources" and every "#N of M, Time Out" in the
// sports bars guide, and the figures in its evidence block, against
// data/evidence.json and data/consensus/sports-bars.json.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// Big Penny Social, Long Arm, Boxpark and others also sit in the craft beer,
// pub garden and other corpora. This guide prints byTopic["sports-bars"].
//
// "Sources" means distinct DOMAINS (a YouTube or TikTok channel is its own
// domain), because that is what build-evidence counts.
//
// Time Out ranks three lists here: football pubs (of 42, Apr 2024), rugby pubs
// (of 16, Jan 2026) and the 50 Best Bars (of 50, Jul 2026). A venue may carry a
// rank on more than one, so every printed rank is checked against all three.
//
//   node scripts/verify-sports-bars-citations.mjs
import fs from "node:fs";

const TOPIC = "sports-bars";
const art = fs.readFileSync("src/content/articles/best-sports-bars-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
// Page headings that differ from the canonical evidence name.
const HEADING = {
  "Belushi's London Bridge": "Belushi's",
  "Boxpark Shoreditch, Wembley and Croydon": "Boxpark",
};
const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;
const aliasOf = (n) => ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n;
// Try the heading as written, then without its ", Area" suffix.
const lookup = (name) => {
  for (const n of [name, name.replace(/,.*$/, "").trim()]) {
    const h = HEADING[n] ?? n;
    const rec = evByNorm[norm(aliasOf(h))];
    if (rec?.byTopic?.[TOPIC]) return rec;
  }
  return evByNorm[norm(aliasOf(HEADING[name] ?? name))] ?? null;
};

const hostOf = (url) => {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  if (/^(youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) {
    const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
    if (handle) return `${host}/${handle}`;
  }
  return host;
};

// Time Out's ranks, read from the recorded quotes ("#4 of 42 ...").
const toRanks = {};
for (const s of doc.sources.filter((s) => s.url.includes("timeout.com"))) {
  for (const [name, q] of Object.entries(s.quotes ?? {})) {
    const m = String(q).match(/^#(\d+) of (\d+)/);
    if (m) (toRanks[norm(aliasOf(name))] ??= []).push({ rank: +m[1], of: +m[2] });
  }
}

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)\s*$/);
  if (h) lastName = h[1].replace(/\s+—.*$/, "").trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
  if (claimed && lastName) {
    const rec = lookup(lastName);
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.[TOPIC]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no ${TOPIC} citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, ${TOPIC} corpus says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
  }
  for (const rank of line.matchAll(/#(\d+) of (\d+), Time Out/g)) {
    if (!lastName) continue;
    const rec = lookup(lastName);
    const rs = (rec && toRanks[norm(rec.name)]) || toRanks[norm(lastName)] || [];
    if (!rs.length) errors.push(`${lastName}: page prints a Time Out rank, but Time Out did not rank it`);
    else if (!rs.some((r) => r.rank === +rank[1] && r.of === +rank[2]))
      errors.push(`${lastName}: page says #${rank[1]} of ${rank[2]}, Time Out says ${rs.map((r) => `#${r.rank} of ${r.of}`).join(", ")}`);
    else checked.push(`${lastName}: Time Out #${rank[1]} of ${rank[2]} OK`);
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
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*/);
const m2 = art.match(/\*\*(\d+) venues are named by two or more independent sources/);
if (!m || !m2) errors.push("evidence block: could not find the figures in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimed[k]}, the build says ${actual[k]}`);
}

// "N of the 22 sources" in prose and the FAQ must belong to a venue on the page.
const counts = new Set(venues.map((v) => v.sourceCount));
for (const mm of art.matchAll(/(\d+) of (?:the )?(\d+) sources/g)) {
  if (+mm[2] !== actual.sources) errors.push(`"${mm[0]}": the build has ${actual.sources} sources`);
  else if (!counts.has(+mm[1])) errors.push(`"${mm[0]}": no venue has that ${TOPIC} count`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`build: ${JSON.stringify(actual)}`);
console.log(`evidence block: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
