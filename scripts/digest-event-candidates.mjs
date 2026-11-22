// Step 2 of the events pipeline: shrink data/events-crawl/candidates.json to a digest an agent
// can read. Drops lines already covered by the Events tab (venue or event name match), keeps
// sites in the categories that put on visitor events, recommended places first.
//
//   node scripts/digest-event-candidates.mjs [--all]   writes data/events-crawl/digest.md
import fs from "node:fs";

const ALL = process.argv.includes("--all");
const KEEP = new Set(["museum", "gallery", "attraction", "landmark", "arts_centre", "events_venue", "exhibition_centre", "market", "park", "arena", "stadium"]);
const norm = (s) => (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const src = fs.readFileSync("scripts/write-events.mjs", "utf8");
const known = new Set([...src.matchAll(/\b(?:name|venue): "([^"]+)"/g)].map((m) => norm(m[1].replace(/\s*\(.*\)$/, ""))).filter((k) => k.length > 4));
const { results } = JSON.parse(fs.readFileSync("data/events-crawl/candidates.json", "utf8"));
const sites = results
  .filter((r) => r.hits.length && (ALL || r.recommended || KEEP.has(r.category)))
  .sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
let out = `# Event candidates, crawled ${new Date().toISOString().slice(0, 10)}\n\nVenues already in the Events tab are marked (in Events tab).\n\n`;
let lines = 0;
for (const s of sites) {
  const inTab = known.has(norm(s.name)) || [...known].some((k) => k.length > 8 && norm(s.name).includes(k));
  out += `## ${s.name} (${s.category}${s.recommended ? ", recommended" : ""}${inTab ? ", in Events tab" : ""})\n${s.finalUrl ?? s.url}\n`;
  for (const h of s.hits.slice(0, 12)) { out += `- ${h.text.replace(/\s+/g, " ")}  <${h.url}>\n`; lines++; }
  out += "\n";
}
fs.writeFileSync("data/events-crawl/digest.md", out);
console.log(`${sites.length} sites, ${lines} lines, ${Math.round(out.length / 1000)}k chars`);
