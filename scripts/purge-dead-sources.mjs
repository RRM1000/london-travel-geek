// Removes sources that contribute no evidence, so "distinct domains" stops
// overstating the breadth of the corpus.
//
// Three kinds get purged:
//   1. EMPTY from a domain we KNOW blocks the fetcher (visitlondon, londonist,
//      thatsup, quintessentially). Keeping them is a promise the corpus cannot
//      cash - and the browser route can re-add them properly later.
//   2. EMPTY from an aggregator we would not count anyway (opentable, corner,
//      trip101, wanderlog).
//   3. Sources whose every extracted name is site furniture.
//
// EMPTY from a good domain is KEPT and reported: those are worth refetching or
// reading through the browser, not deleting.
//
//   node scripts/purge-dead-sources.mjs           # dry run
//   node scripts/purge-dead-sources.mjs --write
import fs from "node:fs";

const WRITE = process.argv.includes("--write");
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));

const blocked = new Set(REG.blocked?.permanent403 ?? []);
const excluded = new Set(REG.excluded ?? []);
const NOISE_SET = new Set(
  [...NOISE.siteChrome, ...NOISE.countries, ...NOISE.genericCategories].map((s) => s.toLowerCase()),
);
const NOISE_RE = NOISE.patterns.map((p) => new RegExp(p, "i"));
const FURNITURE = [
  /investor relations/i, /work for/i, /privacy notice/i, /do not sell/i,
  /accessibility/i, /get listed/i, /advertis/i, /^offers?$/i, /^faq/i,
  /terms of use/i, /manage cookies/i, /^time out/i, /newsletter/i,
  /^(design|journeys|hotels|arts|fiction|culture|travel|style|beauty)$/i,
];
const isJunk = (n) => {
  const s = String(n).trim();
  if (!s) return true;
  if (NOISE_SET.has(s.toLowerCase())) return true;
  if (NOISE_RE.some((r) => r.test(s))) return true;
  return FURNITURE.some((r) => r.test(s));
};
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

let purged = 0, keptForRetry = 0;
const retry = [];

for (const f of fs.readdirSync("data/consensus").filter((x) => x.endsWith(".json"))) {
  const path = `data/consensus/${f}`;
  const doc = JSON.parse(fs.readFileSync(path, "utf8"));
  const before = doc.sources.length;

  doc.sources = doc.sources.filter((s) => {
    const host = hostOf(s.url);
    const names = s.names ?? [];
    const clean = names.filter((n) => !isJunk(n)).length;

    if (names.length === 0) {
      if (blocked.has(host) || excluded.has(host)) {
        console.log(`  purge EMPTY/blocked   ${f.replace(".json", "")} / ${host}`);
        purged++;
        return false;
      }
      // Good domain, empty result: worth another go, not deletion.
      retry.push(`${f.replace(".json", "")} / ${host}  ${s.url}`);
      keptForRetry++;
      return true;
    }
    // Never purge a hand-recorded single-venue review. See the note in
    // audit-extraction.mjs: the byline heuristic used to score these ALL JUNK.
    if (clean === 0 && names.length > 1) {
      console.log(`  purge ALL-JUNK        ${f.replace(".json", "")} / ${host}  (${names.length} names)`);
      purged++;
      return false;
    }
    return true;
  });

  if (WRITE && doc.sources.length !== before) {
    fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  }
}

console.log(`\n${purged} source(s) ${WRITE ? "purged" : "would be purged"}`);
console.log(`${keptForRetry} empty source(s) KEPT - good domains worth refetching or reading via browser:`);
retry.slice(0, 30).forEach((r) => console.log(`  ${r}`));
if (retry.length > 30) console.log(`  ... and ${retry.length - 30} more`);
if (!WRITE) console.log(`\ndry run - re-run with --write`);
