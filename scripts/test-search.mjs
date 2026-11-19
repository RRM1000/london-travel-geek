// Runs real queries through the site search ranking and prints the top hits.
//   node scripts/test-search.mjs [index.json] ["query" ...]
// With no index path it fetches http://localhost:4400/search-index.json (the
// review preview). With no queries it runs the list below, which includes
// searches readers actually typed (GA4 site_search) and cases that used to fail.
import fs from "node:fs";
import { prepare, search } from "../src/lib/search-rank.js";

const args = process.argv.slice(2);
const file = args[0]?.endsWith(".json") ? args.shift() : null;
const data = file
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : await (await fetch("http://localhost:4400/search-index.json")).json();
const prepared = prepare(data.records);

const QUERIES = args.length
  ? args
  : [
      "rain", "raining", "rainy day", "Covent garden", "pubs", "pubs west end", "christmas pubs",
      "fireworks", "ARE THERE SEATED AREAS TO WATCH THE FIREWORKSON NYE?", "Madam", "warner",
      "Sunday markets", "Cheap vegan food", "Bus timetables", "Bus tour", "Ice skating Battersea",
      "temple garden", "statues", "stonehenge", "Brgier", "kabannas", "Comic con tickets",
      "West end musical christmas", "dim sum", "oyster card", "Dishoom", "Soho", "walking",
    ];

for (const q of QUERIES) {
  const { results, loose } = search(prepared, q);
  console.log(`\n"${q}"  ${results.length} results${loose ? " (loose)" : ""}`);
  for (const { r, s } of results.slice(0, 6)) console.log(`  ${s.toFixed(0).padStart(4)}  ${r.t}  ${r.n.slice(0, 90)}`);
}
