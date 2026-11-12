// Splits data/food-deals/candidates.json into N batch files for the extraction agents:
// every site the crawl read that has deal wording, with its matched lines.
//   node scripts/split-food-deal-batches.mjs [N] [candidates file] [batch name prefix]
import fs from "node:fs";

const N = Number(process.argv[2] ?? 3);
const IN = process.argv[3] ?? "data/food-deals/candidates.json";
const PREFIX = process.argv[4] ?? "batch";
const { results } = JSON.parse(fs.readFileSync(IN, "utf8"));
// Lines that are page code, not prose.
const junk = (t) => /[{};]\s*--|:root|rgba\(|function\s*\(|=>/.test(t);
const sites = results
  .map((r) => ({ ...r, hits: r.hits.filter((h) => !junk(h.text)) }))
  .filter((r) => r.hits.length)
  .map((r) => ({
    name: r.name,
    slug: r.slug ?? null,
    alsoSlugs: r.alsoSlugs ?? [],
    source: r.source,
    site: r.finalUrl ?? r.url,
    hits: r.hits.slice(0, 30).map((h) => ({ page: h.url, types: h.types, text: h.text })),
  }));
fs.mkdirSync("data/food-deals/batches", { recursive: true });
for (let i = 0; i < N; i++) {
  const part = sites.filter((_, j) => j % N === i);
  fs.writeFileSync(`data/food-deals/batches/${PREFIX}-${i + 1}.json`, JSON.stringify(part, null, 1));
  console.log(`${PREFIX}-${i + 1}: ${part.length} sites`);
}
