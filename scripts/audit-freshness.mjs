// Tells you what needs re-checking before it goes wrong, instead of after.
//
//   npm run audit:fresh              what is due in the next few weeks
//   npm run audit:fresh -- --all     every page ranked by staleness risk
//   npm run audit:fresh -- --month=3 pretend it is March, to plan ahead
//
// WHY THIS EXISTS
// 80 of this site's articles quote a price. The Wimbledon guide carries 143
// price mentions and the transport fares guide 136. Those numbers do not decay
// gradually - they go wrong on a specific day, when TfL raises fares or a
// ballot opens or an attraction reprices, and nothing on the site notices.
//
// A government VAT cut held attraction prices down from 25 June to 1 September
// 2026. Anything written in that window quoted the low figure and was wrong the
// next morning. That is the failure this is meant to catch.
//
// It works two ways:
//   1. data/review-calendar.json says WHEN known things change and WHICH pages
//      quote them. This is the useful half, and it only works if you add to it.
//   2. A staleness score for everything else: how much time-sensitive content a
//      page carries, against how long since anyone touched it.
import fs from "node:fs";

const DIR = "src/content/articles";
const args = process.argv.slice(2);
const showAll = args.includes("--all");
const monthArg = Number((args.find((a) => a.startsWith("--month=")) || "").slice(8));
const now = new Date();
const month = monthArg || now.getMonth() + 1;

const calendar = JSON.parse(fs.readFileSync("data/review-calendar.json", "utf8"));

const articles = {};
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const raw = fs.readFileSync(`${DIR}/${f}`, "utf8");
  const fm = (raw.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] ?? "";
  const dateOf = (k) => (fm.match(new RegExp(`^${k}: *(\\S+)`, "m")) || [])[1];
  const updated = dateOf("updatedAt") || dateOf("publishedAt");
  // An explicit reviewBy in the front matter always wins over the heuristic.
  const reviewBy = dateOf("reviewBy");
  articles[slug] = {
    slug,
    updated,
    reviewBy,
    days: updated ? Math.floor((now - new Date(updated)) / 86400000) : 9999,
    // Signals that a page makes claims which expire.
    prices: (raw.match(/£\d/g) || []).length,
    years: (raw.match(/\b20(?:2[4-9]|3\d)\b/g) || []).length,
    // "until", "ends", "closes", "opens" plus a date is the highest-risk shape.
    dated: (raw.match(/\b(?:until|ends?|closes?|opens?|runs? (?:to|until))\b[^.]{0,40}\b(?:January|February|March|April|May|June|July|August|September|October|November|December|20\d\d)\b/gi) || []).length,
  };
}

// ---------------------------------------------------------------- calendar
const weeksUntil = (m) => {
  let d = (m - month + 12) % 12;
  return Math.round(d * 4.35);
};

const due = [];
for (const e of calendar.events) {
  const recurring = e.everyMonths;
  const weeks = recurring ? 0 : weeksUntil(e.month);
  if (!recurring && weeks > (e.leadWeeks ?? 4)) continue;
  const pages = e.slugs.filter((s) => articles[s]);
  const missing = e.slugs.filter((s) => !articles[s]);
  due.push({ ...e, weeks, pages, missing, recurring });
}
due.sort((a, b) => a.weeks - b.weeks);

console.log(`\n=== DUE NOW (month ${month})\n`);
if (!due.length) console.log("  nothing on the calendar in the lead window");
for (const e of due) {
  const when = e.recurring ? `every ${e.everyMonths} months` : e.weeks <= 0 ? "THIS MONTH" : `in ~${e.weeks} weeks`;
  console.log(`  ${e.name}  — ${when}`);
  console.log(`     ${e.what}`);
  for (const s of e.pages) {
    const a = articles[s];
    console.log(`       ${s}  (last updated ${a.updated}, ${a.days}d ago, ${a.prices} prices)`);
  }
  for (const s of e.missing) console.log(`       ${s}  — NOT WRITTEN YET`);
  console.log("");
}

// ------------------------------------------------------------- staleness
const risk = (a) => a.prices + a.years * 0.5 + a.dated * 3;
const overdue = Object.values(articles)
  .filter((a) => a.reviewBy && new Date(a.reviewBy) < now)
  .sort((a, b) => new Date(a.reviewBy) - new Date(b.reviewBy));

if (overdue.length) {
  console.log(`=== PAST THEIR OWN reviewBy DATE\n`);
  for (const a of overdue) console.log(`  ${a.reviewBy}  ${a.slug}`);
  console.log("");
}

const ranked = Object.values(articles)
  .filter((a) => risk(a) > 0)
  .map((a) => ({ ...a, score: Math.round(risk(a) * Math.min(a.days / 90, 3)) }))
  .sort((a, b) => b.score - a.score);

console.log(`=== HIGHEST STALENESS RISK${showAll ? "" : "  (top 12 — use --all for everything)"}\n`);
console.log(`  ${"score".padStart(5)} ${"£".padStart(4)} ${"dated".padStart(5)} ${"age".padStart(5)}  guide`);
for (const a of (showAll ? ranked : ranked.slice(0, 12)))
  console.log(`  ${String(a.score).padStart(5)} ${String(a.prices).padStart(4)} ${String(a.dated).padStart(5)} ${String(a.days + "d").padStart(5)}  ${a.slug}`);

console.log(`\n${Object.values(articles).filter((a) => a.prices).length} of ${Object.keys(articles).length} articles quote a price.`);
console.log("Add reviewBy: YYYY-MM-DD to any article's front matter to set your own deadline.");
console.log("Add to data/review-calendar.json whenever you learn that something changes on a schedule.\n");
