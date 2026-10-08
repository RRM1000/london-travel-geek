// Checks every "Cited by N sources" in the speakeasy guide, and the figures in its
// evidence block, against data/evidence.json and data/consensus/speakeasy.json.
//
// Counts are TOPIC-SCOPED: Nightjar, Opium, Happiness Forgets and others also sit
// in the bars corpus. This guide prints byTopic.speakeasy only.
//
// "Sources" here means distinct DOMAINS (a YouTube channel counts as its own
// domain, every Reddit thread is one domain between them), because that is what
// build-evidence counts. The record count in the consensus file is larger - a
// masthead with five reviews is five records and one opinion.
//
//   node scripts/verify-speakeasy-citations.mjs
import fs from "node:fs";

const TOPIC = "speakeasy";
const art = fs.readFileSync("src/content/articles/best-speakeasy-bars-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

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

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  // "### Angelina, Dalston — the line" -> "Angelina"
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
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named bars\*\*/);
const m2 = art.match(/\*\*(\d+) bars are named by two or more independent sources/);
if (!m || !m2) errors.push("evidence block: could not find the figures in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimed[k]}, the build says ${actual[k]}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`evidence block: ${errors.some((e) => e.startsWith("evidence block")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
