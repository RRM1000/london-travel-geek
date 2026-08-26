// How much of the corpus is actually venue names, and how much is website
// furniture the extractor mistook for names?
//
// WHY THIS EXISTS
// consensus.mjs pulls h2/h3 headings, which is right for a listicle and wrong
// for a page that puts venues in <li> or renders them with JavaScript. When it
// is wrong it does not fail - it returns "Investor relations", "Work for Time
// Out", "DESIGN", "JOURNEYS" and counts them as evidence. A source that
// contributed 12 junk names looks identical in the file to one that contributed
// 12 restaurants, so apparent breadth grows while real evidence does not.
//
//   node scripts/audit-extraction.mjs            # per-source health
//   node scripts/audit-extraction.mjs --bad      # only the broken ones
import fs from "node:fs";

const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));
const NOISE_SET = new Set(
  [...NOISE.siteChrome, ...NOISE.countries, ...NOISE.genericCategories].map((s) => s.toLowerCase()),
);
const NOISE_RE = NOISE.patterns.map((p) => new RegExp(p, "i"));

// Furniture that is not in name-noise.json because it only ever appears in a
// scraped page, never in a hand-written list.
const FURNITURE = [
  /investor relations/i, /work for/i, /privacy notice/i, /do not sell/i,
  /accessibility/i, /get listed/i, /advertis/i, /^offers?$/i, /^faq/i,
  /terms of use/i, /manage cookies/i, /^time out/i, /newsletter/i,
  /^(design|journeys|hotels|arts|fiction|culture|travel|style|beauty)$/i,
  /^[A-Z][a-z]+ [A-Z][a-z]+$/,   // a byline: "Iona Goulder"
  /valentine|christmas|easter|halloween/i,
  /^\d+ (at-home|things|ways|reasons)/i,
];

const isSuspect = (n) => {
  const s = String(n).trim();
  if (!s) return true;
  if (NOISE_SET.has(s.toLowerCase())) return true;
  if (NOISE_RE.some((r) => r.test(s))) return true;
  if (FURNITURE.some((r) => r.test(s))) return true;
  return false;
};

const onlyBad = process.argv.includes("--bad");
const rows = [];

for (const f of fs.readdirSync("data/consensus").filter((x) => x.endsWith(".json"))) {
  const topic = f.replace(/\.json$/, "");
  const doc = JSON.parse(fs.readFileSync(`data/consensus/${f}`, "utf8"));
  for (const s of doc.sources ?? []) {
    const names = s.names ?? [];
    const suspect = names.filter(isSuspect).length;
    const clean = names.length - suspect;
    let host = s.url;
    try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch {}
    // Zero names = the fetch produced nothing. All-suspect = it produced junk.
    // Both are dead sources wearing the costume of a live one.
    const verdict =
      names.length === 0 ? "EMPTY"
      : clean === 0 ? "ALL JUNK"
      : suspect / names.length > 0.6 ? "MOSTLY JUNK"
      : suspect / names.length > 0.3 ? "noisy"
      : "ok";
    rows.push({ topic, host, name: s.name, total: names.length, clean, verdict });
  }
}

const bad = rows.filter((r) => ["EMPTY", "ALL JUNK", "MOSTLY JUNK"].includes(r.verdict));
const show = onlyBad ? bad : rows;

const order = { EMPTY: 0, "ALL JUNK": 1, "MOSTLY JUNK": 2, noisy: 3, ok: 4 };
show.sort((a, b) => order[a.verdict] - order[b.verdict] || a.topic.localeCompare(b.topic));

console.log("verdict      names  clean  topic / source");
for (const r of show) {
  console.log(
    `${r.verdict.padEnd(12)}${String(r.total).padStart(5)}${String(r.clean).padStart(7)}  ${r.topic} / ${r.host}`,
  );
}

const tot = rows.length;
console.log(`\n${bad.length} of ${tot} sources are dead or junk (${Math.round((bad.length / tot) * 100)}%)`);
console.log(`  EMPTY       ${rows.filter((r) => r.verdict === "EMPTY").length}  - fetch returned nothing`);
console.log(`  ALL JUNK    ${rows.filter((r) => r.verdict === "ALL JUNK").length}  - every name is site furniture`);
console.log(`  MOSTLY JUNK ${rows.filter((r) => r.verdict === "MOSTLY JUNK").length}  - more furniture than venues`);
console.log(`  noisy       ${rows.filter((r) => r.verdict === "noisy").length}  - usable, some furniture`);
console.log(`  ok          ${rows.filter((r) => r.verdict === "ok").length}`);
console.log(`\nA dead source still counts toward "distinct domains", so breadth is`);
console.log(`overstated by roughly the dead count until these are refetched or removed.`);
