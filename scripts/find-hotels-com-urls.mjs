// Find each hotel's own page on Hotels.com, so the CJ links have somewhere
// worth pointing at.
//
// STATUS: THIS DOES NOT CURRENTLY WORK, and the right fix is not to make it work.
//
// Hotels.com returns 429 to a script and a bot challenge to a browser. Their
// property pages are indexed, so searching for them was the fallback - but
// DuckDuckGo, Mojeek and the lite endpoints all now answer 202 with an empty
// body after this session's volume. Scraping search results to rebuild a
// catalogue the advertiser publishes properly was always the wrong shape.
//
// THE RIGHT ROUTE IS CJ'S PRODUCT FEED API. developers.cj.com carries a
// Product Feed GraphQL API and a Link Search REST API, both authenticated with
// a Personal Access Token generated in the CJ account. That returns Hotels.com
// property urls from the advertiser, with ids that are correct by construction
// rather than by fuzzy name match - and it can list properties this sheet does
// not have yet, which is the other half of the job.
//
// Kept because the matching logic below is the part worth keeping: whatever
// supplies the urls, a name check has to gate them. Attaching the wrong
// property is worse than attaching none - the reader lands on a hotel that is
// not the one they read about, behind a link marked ad, and the mistake is
// invisible from our side because the link works perfectly.
//
// THE MATCH IS CHECKED, NOT ASSUMED. A url is only accepted when enough
// distinctive words from the hotel's name appear in its slug. Attaching the
// wrong property is worse than attaching none: the reader lands on a hotel that
// is not the one they read about, behind a link marked "ad", and the mistake is
// invisible from our side because the link works perfectly.
//
//   node scripts/find-hotels-com-urls.mjs            # all unresolved
//   node scripts/find-hotels-com-urls.mjs --limit 5  # try a few first
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const OUT = "data/hotels-com-urls.json";
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const hotels = JSON.parse(fs.readFileSync("src/data/hotels.json", "utf8")).hotels;
const found = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

// Words that carry no identifying weight - every third London hotel is a
// "London hotel" - so they must not be what makes a match look convincing.
const NOISE = new Set([
  "hotel", "hotels", "london", "the", "by", "at", "and", "a", "of", "in",
  "uk", "united", "kingdom", "inn", "house", "rooms", "suites", "aparthotel",
  "apartments", "hostel", "collection", "group",
]);

const words = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !NOISE.has(w));

async function search(q) {
  const body = new URLSearchParams({ q }).toString();
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return { blocked: res.status, urls: [] };
  const html = await res.text();
  const urls = [];
  for (const m of html.matchAll(/href="([^"]*uddg=[^"]+)"/g)) {
    try {
      const raw = decodeURIComponent(m[1].match(/uddg=([^&]+)/)[1]);
      if (/^https:\/\/[a-z.]*hotels\.com\/ho\d+\//i.test(raw)) urls.push(raw.split("?")[0]);
    } catch {}
  }
  return { blocked: 0, urls: [...new Set(urls)] };
}

const todo = hotels.filter((h) => !found[h.slug]).slice(0, limit);
console.log(`${hotels.length} hotels, ${Object.keys(found).length} already resolved, trying ${todo.length}\n`);

let hit = 0, miss = 0, rejected = 0, blocked = 0;
for (const h of todo) {
  const { blocked: code, urls } = await search(`site:hotels.com ${h.name} London`);
  if (code) {
    blocked++;
    console.log(`  BLOCKED ${code} - stopping so the rest are not burned`);
    break;
  }

  const want = words(h.name);
  // At least half the distinctive words, and never fewer than one. "The Z Hotel
  // Covent Garden" reduces to z/covent/garden; two of those in a slug is a
  // match, "covent" alone is not.
  const need = Math.max(1, Math.ceil(want.length / 2));
  const scored = urls
    .map((u) => ({ u, score: want.filter((w) => u.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score >= need) {
    found[h.slug] = best.u;
    hit++;
    console.log(`  OK   ${h.name.slice(0, 40).padEnd(42)}${best.score}/${want.length}  ${best.u.slice(0, 62)}`);
  } else if (best) {
    rejected++;
    console.log(`  ??   ${h.name.slice(0, 40).padEnd(42)}${best.score}/${want.length} too weak: ${best.u.slice(0, 52)}`);
  } else {
    miss++;
    console.log(`  --   ${h.name.slice(0, 40).padEnd(42)}nothing indexed`);
  }
  fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
  await new Promise((r) => setTimeout(r, 4000));
}

console.log(`\nmatched ${hit}, rejected as too weak ${rejected}, no result ${miss}${blocked ? ", BLOCKED" : ""}`);
console.log(`${Object.keys(found).length}/${hotels.length} resolved -> ${OUT}`);
