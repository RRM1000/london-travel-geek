// Tier C, done properly. Harvests INDEPENDENT REVIEWER blogs, which are a
// different shape from everything else in the corpus.
//
// WHY THIS EXISTS
// The corpus's "blogs" were mostly listicle sites - structurally identical to
// Time Out, just smaller, and drawing on the same handful of famous rooms. The
// genuine reviewers (Picky Glutton, Cheese and Biscuits, Major Foodie) do not
// publish "best of" lists at all: they publish ONE REVIEW PER VENUE, which is
// why a list-scraper found nothing on them and why their picks never reached
// the sheet.
//
// One post = one venue = one opinion, and the title usually carries the verdict:
//
//   "Bronek's Fish Restaurant review - a big fish in a medium-sized pond"
//   "Café François review - the French brasserie that's not French enough"
//
// That verdict clause is the most quotable thing in the whole corpus, because
// it is a real person's judgement rather than a listicle's blurb. It is stored
// as the source quote.
//
//   node scripts/blog-pass.mjs --topic=general --feed=https://pickyglutton.com/feed/
//   node scripts/blog-pass.mjs --topic=general --feed=... --dry-run
import fs from "node:fs";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};
const DRY = process.argv.includes("--dry-run");
const topic = arg("topic");
const feed = arg("feed");
const label = arg("name");

if (!topic || !feed) {
  console.error("usage: blog-pass.mjs --topic=<t> --feed=<rss-url> [--name=<label>] [--dry-run]");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const res = await fetch(feed, { headers: { "User-Agent": UA } });
if (!res.ok) { console.error(`feed fetch failed: ${res.status}`); process.exit(1); }
const xml = await res.text();

const decode = (s) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "")
   .replace(/&#8211;|&#8212;/g, "-").replace(/&#8217;|&#039;|&apos;/g, "'")
   .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, "&")
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
   .replace(/&[a-z]+;/gi, " ").trim();

// <item> blocks only - the channel's own <title> is the blog name, not a post.
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const block = m[1];
  const t = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
  const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
  const date = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
  return { title: decode(t), url: decode(link), date: decode(date) };
}).filter((i) => i.title);

// A review post names its venue before the word "review". Anything without
// that marker is a round-up, an essay or a personal post - not one venue.
const parsed = [];
const skipped = [];
for (const it of items) {
  const m = it.title.match(/^(.+?)\s+review\s*[:–—-]?\s*(.*)$/i);
  if (!m) { skipped.push(it.title); continue; }
  let venue = m[1].trim();
  let verdict = m[2].trim();
  // "Singburi Shoreditch" keeps its branch; "The best and worst..." is not a venue.
  if (/^(the |a )?(best|worst|top|\d)/i.test(venue) || venue.length > 45) {
    skipped.push(it.title);
    continue;
  }
  parsed.push({ venue, verdict, url: it.url, date: it.date });
}

console.log(`${feed}\n  ${items.length} post(s), ${parsed.length} review(s), ${skipped.length} not reviews`);
for (const p of parsed) {
  console.log(`  ${p.venue}${p.verdict ? `  ::  ${p.verdict.slice(0, 70)}` : ""}`);
}
if (skipped.length) {
  console.log(`\n  not reviews (round-ups, essays):`);
  skipped.slice(0, 6).forEach((s) => console.log(`    ${s.slice(0, 70)}`));
}

if (DRY) { console.log("\ndry run - nothing written"); process.exit(0); }
if (!parsed.length) { console.log("\nnothing to record"); process.exit(0); }

let host = feed;
try { host = new URL(feed).hostname.replace(/^www\./, ""); } catch {}
const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const name = label ?? REG.domains[host]?.name ?? host;
const site = `https://${host}/`;

const path = `data/consensus/${topic}.json`;
const doc = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, "utf8"))
  : { cuisine: topic, note: "", recorded: "", sources: [] };
doc.sources ??= [];

// One source entry per BLOG, not per review - a blog is one opinion however
// many venues it has covered, exactly like a publication is.
const existing = doc.sources.find((s) => s.url === site);
const names = parsed.map((p) => p.venue);
const quotes = Object.fromEntries(parsed.filter((p) => p.verdict).map((p) => [p.venue, p.verdict]));
const posts = parsed.map((p) => ({ venue: p.venue, url: p.url, date: p.date }));

if (existing) {
  existing.names = [...new Set([...(existing.names ?? []), ...names])];
  existing.quotes = { ...(existing.quotes ?? {}), ...quotes };
  existing.posts = [...(existing.posts ?? []), ...posts]
    .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i);
  console.log(`\nupdated ${name}: ${existing.names.length} venue(s) total`);
} else {
  doc.sources.push({ name: `${name} (independent reviews)`, url: site, scope: topic, names, quotes, posts });
  console.log(`\nadded ${name}: ${names.length} venue(s)`);
}

doc.recorded = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
console.log(`${path}: ${doc.sources.length} sources`);
console.log("next: node scripts/build-evidence.mjs");
