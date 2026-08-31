// Finds REAL VENUES trapped in the furniture list - the mirror image of the
// problem audit-corpus.mjs solves.
//
// WHY THIS EXISTS. "Special Guests" sat in name-noise.json's siteChrome for
// months. It is a real London coffee bar, and Time Out named it one of the best
// in the UK for 2026, so every mention of it was being deleted before it could
// be counted. Somebody had met the phrase as a section heading on one site and
// written it off for every site.
//
// THE SIGNAL. Furniture is site-specific: "Essential Cookies" appears on one
// publication's pages and nowhere else. A venue is what INDEPENDENT
// PUBLICATIONS AGREE ON. So a name that the noise list deletes, but which two
// or more separate domains both chose to write down, is very unlikely to be
// furniture - it is a venue being silently erased.
//
//   node scripts/audit-noise-list.mjs
import fs from "node:fs";
import { isFurniture, norm } from "./lib/noise.mjs";

const seen = new Map(); // norm -> {display, domains:Set, topics:Set}

for (const f of fs.readdirSync("data/consensus").filter((x) => x.endsWith(".json"))) {
  const topic = f.replace(/\.json$/, "");
  const doc = JSON.parse(fs.readFileSync(`data/consensus/${f}`, "utf8"));
  for (const s of doc.sources ?? []) {
    let host = s.url;
    try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
    for (const raw of s.names ?? []) {
      if (!isFurniture(raw)) continue;
      const k = norm(raw);
      if (!k) continue;
      const rec = seen.get(k) ?? { display: String(raw).trim(), domains: new Set(), topics: new Set() };
      rec.domains.add(host);
      rec.topics.add(topic);
      seen.set(k, rec);
    }
  }
}

const suspects = [...seen.values()]
  .filter((r) => r.domains.size >= 2)
  .sort((a, b) => b.domains.size - a.domains.size);

if (!suspects.length) {
  console.log("no deleted name is corroborated by more than one publication");
  process.exit(0);
}

console.log(`${suspects.length} name(s) the noise list deletes, but which two or more`);
console.log(`independent publications both wrote down. Each is probably a real venue.\n`);
for (const r of suspects) {
  console.log(`  ${r.display}`);
  console.log(`      ${r.domains.size} domains: ${[...r.domains].join(", ")}`);
  console.log(`      topics: ${[...r.topics].join(", ")}`);
}
console.log(`\nCheck each by hand. If it is a venue, remove it from data/name-noise.json`);
console.log(`(siteChrome, or whichever pattern catches it) and rebuild the evidence.`);
