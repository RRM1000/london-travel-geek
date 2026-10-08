// Checks every "Cited by N sources" and every "#N of 14, Time Out" in the
// karaoke guide, and the figures in its evidence block, against
// data/evidence.json and data/consensus/karaoke.json.
//
// Counts are TOPIC-SCOPED: evidence.json's sourceCount spans every corpus, and
// Lucky Voice, All Star Lanes and The Blues Kitchen also sit in the activities,
// dinner-and-a-show and live-music corpora. This guide prints byTopic.karaoke.
//
// "Sources" means distinct DOMAINS (a YouTube or TikTok channel is its own
// domain, every Reddit thread is one domain between them), because that is what
// build-evidence counts.
//
//   node scripts/verify-karaoke-citations.mjs
import fs from "node:fs";

const TOPIC = "karaoke";
const art = fs.readFileSync("src/content/articles/best-karaoke-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
// Page headings that differ from the canonical evidence name.
const HEADING = {
  "BAO KTV": "Bao",
  "Bloomsbury Lanes": "Bloomsbury Bowling Lanes",
  "U9": "U9 Karaoke",
  "Lucky Voice Holborn": "Lucky Voice",
  "HUCKSTER": "Huckster",
};
const resolve = (n) => {
  const h = HEADING[n] ?? n;
  return norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(h))] ?? h);
};

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

// Time Out's ranks, read from the recorded quotes ("#4 of 14 ...").
const to = doc.sources.find((s) => s.url.includes("timeout.com/london/nightlife/best-karaoke-bars"));
const toRank = {};
for (const [name, q] of Object.entries(to.quotes)) {
  const m = String(q).match(/^#(\d+) of (\d+)/);
  if (m) toRank[norm(name)] = { rank: +m[1], of: +m[2] };
}

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^#{3,4}\s+(.+?)\s*$/);
  if (h) lastName = h[1].replace(/\s+—.*$/, "").replace(/,.*$/, "").trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].replace(/,.*$/, "").trim();
  const claimed = line.match(/Cited by (\d+) sources?/)?.[1];
  if (claimed && lastName) {
    const rec = evByNorm[resolve(lastName)];
    if (!rec) errors.push(`${lastName}: not in evidence.json at all`);
    else {
      const scoped = rec.byTopic?.[TOPIC]?.sourceCount ?? null;
      if (scoped === null) errors.push(`${lastName}: has no ${TOPIC} citations at all`);
      else if (scoped !== Number(claimed)) errors.push(`${lastName}: article says ${claimed}, ${TOPIC} corpus says ${scoped}`);
      else checked.push(`${lastName}: ${claimed} OK`);
    }
  }
  const rank = line.match(/#(\d+) of (\d+), Time Out/);
  if (rank && lastName) {
    const r = toRank[resolve(lastName)];
    if (!r) errors.push(`${lastName}: page prints a Time Out rank, but Time Out did not rank it`);
    else if (r.rank !== +rank[1] || r.of !== +rank[2]) errors.push(`${lastName}: page says #${rank[1]} of ${rank[2]}, Time Out says #${r.rank} of ${r.of}`);
    else checked.push(`${lastName}: Time Out #${r.rank} OK`);
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

// "N of the 24 sources" / "N of 24" in prose and the FAQ.
for (const mm of art.matchAll(/(\d+) of (?:the )?(\d+)(?: sources)?/g)) {
  if (+mm[2] === actual.sources) {
    // the count must belong to Lucky Voice or BAM, the only venues described this way
    const n = +mm[1];
    const ok = [evByNorm[norm("Lucky Voice")], evByNorm[norm("BAM Karaoke Box")], evByNorm[norm("Rowans")]]
      .some((v) => v?.byTopic?.[TOPIC]?.sourceCount === n);
    if (!ok) errors.push(`"${mm[0]}": no venue on the page has that ${TOPIC} count`);
  }
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`evidence block: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
