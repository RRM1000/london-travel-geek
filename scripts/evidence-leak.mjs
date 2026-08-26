// Compares the EVIDENCE against what is actually on the sheet and in the
// articles, and reports the two ways they disagree:
//
//   UNUSED    strongly supported by sources, but not written up anywhere.
//             Free quality - the research is already paid for.
//   UNBACKED  written up as an entry, but the evidence does not support it.
//             This is what a "weak page" is made of.
//
//   node scripts/evidence-leak.mjs                 # both, all topics
//   node scripts/evidence-leak.mjs --topic=mexican
//   node scripts/evidence-leak.mjs --unused        # just the opportunities
import fs from "node:fs";

const EV = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const only = arg("topic");
const mode = process.argv.includes("--unused") ? "unused"
  : process.argv.includes("--unbacked") ? "unbacked" : "both";

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

// topic -> the article that publishes it
const ARTICLE = {
  mexican: "best-mexican-restaurants-london", spanish: "best-spanish-restaurants-london",
  seafood: "best-seafood-restaurants-london", vegan: "best-vegetarian-vegan-restaurants-london",
  korean: "best-korean-restaurants-london", thai: "best-thai-restaurants-london",
  french: "best-french-restaurants-london", italian: "best-italian-restaurants-london",
  japanese: "best-japanese-restaurants-london", indian: "best-indian-restaurants-london",
  chinese: "best-chinese-east-asian-restaurants-london", steak: "best-steak-restaurants-london",
  coffee: "best-coffee-london", bars: "best-cocktail-bars-london",
  dessert: "best-bakeries-london", "middle-eastern": "best-middle-eastern-restaurants-london",
  turkish: "best-middle-eastern-restaurants-london", greek: "best-middle-eastern-restaurants-london",
  "late-night": "late-night-eating-london", burgers: "cheap-eats-london",
  vietnamese: "best-chinese-east-asian-restaurants-london",
  pakistani: "best-indian-restaurants-london",
  "sunday-roast": "best-sunday-roast-london",
  // Topics added 2026-08-25 by the SERP pass. Without these the leak report was
  // silently blind to twelve articles - and "burgers -> cheap-eats-london" was
  // checking the cheap eats guide against a burger corpus, which is why every
  // one of its unused names was a burger.
  "cheap-eats": "cheap-eats-london", pizza: "best-pizza-london",
  "dim-sum": "best-dim-sum-london", "afternoon-tea": "best-afternoon-tea-london",
  "fish-and-chips": "best-fish-and-chips-london",
  "breakfast-brunch": "best-breakfast-brunch-london",
  markets: "best-london-markets", "historic-pubs": "historic-pubs-dining-rooms-london",
  views: "best-views-london", comedy: "best-comedy-clubs-london",
  "parks-gardens": "best-parks-gardens-london",
  "london-with-children": "london-with-children", unusual: "unusual-restaurants-london",
  "competitive-socialising": "competitive-socialising-london",
  "historic-houses": "historic-houses-london", "live-music": "best-live-music-venues-london",
  museums: "best-museums-london", cinemas: "best-cinemas-london",
  galleries: "best-galleries-london",
  "ice-cream": "best-ice-cream-london",
};

// What the sheet already knows about, so "unused" means genuinely unwritten
// rather than merely absent from one article.
const sheetNames = new Set();
for (const f of ["restaurants", "activities", "hotels", "hiddenLondon"]) {
  const p = `src/data/${f}.json`;
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const rows = Array.isArray(d) ? d : d[Object.keys(d).find((k) => Array.isArray(d[k]))] ?? [];
  for (const r of rows) if (r.name) sheetNames.add(norm(r.name));
}

const entriesOf = (slug) => {
  const p = `src/content/articles/${slug}.md`;
  if (!fs.existsSync(p)) return null;
  const md = fs.readFileSync(p, "utf8");
  // "### Venue Name, Area" - take the part before the comma. Some guides
  // number their entries as "## 1. Venue" instead, so catch both or the
  // article reads as having no entries at all.
  const h3 = [...md.matchAll(/^### (.+)$/gm)].map(([, t]) => t);
  const numbered = [...md.matchAll(/^## \d+\.\s*(.+)$/gm)].map(([, t]) => t);
  const heads = h3.length >= numbered.length ? h3 : numbered;
  return new Set(heads.map((t) => norm(t.split(",")[0].trim())));
};

const topics = [...new Set(Object.values(EV).flatMap((v) => v.topics))].sort();
let totalUnused = 0, totalUnbacked = 0;

for (const topic of topics) {
  if (only && topic !== only) continue;
  const slug = ARTICLE[topic];
  if (!slug) continue;
  const entries = entriesOf(slug);
  if (!entries) continue;

  const inTopic = Object.entries(EV).filter(([, v]) => v.topics.includes(topic));

  // Supported by the bar in data/sources.json, and nowhere on the site.
  const unused = inTopic
    .filter(([k, v]) =>
      v.sourceCount >= 2 && (v.tierCount >= 2 || v.hasAward) &&
      !entries.has(k) && !sheetNames.has(k))
    .sort((a, b) => b[1].sourceCount - a[1].sourceCount);

  // Written up, but the evidence is thin or absent.
  const evByKey = new Map(inTopic);
  const unbacked = [...entries]
    .map((k) => ({ k, v: evByKey.get(k) ?? EV[k] }))
    .filter((e) => !e.v || e.v.sourceCount < 2)
    .map((e) => ({ k: e.k, n: e.v?.name ?? e.k, c: e.v?.sourceCount ?? 0 }));

  if (!unused.length && !unbacked.length) continue;
  console.log(`\n${"=".repeat(70)}\n${topic}  ->  ${slug}   (${entries.size} entries)`);

  if (unused.length && mode !== "unbacked") {
    console.log(`\n  UNUSED - supported, not written up (${unused.length}):`);
    for (const [, v] of unused.slice(0, 15)) {
      console.log(`    ${String(v.sourceCount).padStart(2)} src  ${v.tierSpread.padEnd(12)} ${v.name}`);
      console.log(`            ${v.sources.slice(0, 3).map((s) => s.source).join(", ")}`);
    }
    if (unused.length > 15) console.log(`    ... and ${unused.length - 15} more`);
    totalUnused += unused.length;
  }

  if (unbacked.length && mode !== "unused") {
    console.log(`\n  UNBACKED - written up, evidence thin (${unbacked.length}):`);
    for (const e of unbacked.slice(0, 15)) {
      console.log(`    ${e.c} src   ${e.n}`);
    }
    if (unbacked.length > 15) console.log(`    ... and ${unbacked.length - 15} more`);
    totalUnbacked += unbacked.length;
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`${totalUnused} supported venues not written up`);
console.log(`${totalUnbacked} entries standing on fewer than 2 sources`);
console.log(`\nUNUSED is free quality. UNBACKED needs more research or removal.`);
