// Step 1 of the food deals pipeline: crawl restaurant and chain sites for pages that
// mention a deal, and save the matching sentences as candidates for an agent to read.
// Free: plain fetches, no APIs. Nothing here decides what is a deal; it finds where to look.
//
//   node scripts/discover-food-deals.mjs [--limit=N] [--only=chains|sheet]
//
// Reads data/snapshot-restaurants-v2.json (open venues with a Website) and
// data/food-deals/chains.json. Writes data/food-deals/candidates.json.
import fs from "node:fs";

const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
const OUT = "data/food-deals/candidates.json";
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const LIMIT = Number(arg("limit") ?? Infinity);
const ONLY = arg("only");
const CONCURRENCY = 8;
const PAGES_PER_SITE = 6;

// Links worth following from a homepage.
const LINK_RE = /offer|deal|promo|special|set[-_ ]?menu|set[-_ ]?lunch|lunch|pre[-_ ]?theatre|early|happy[-_ ]?hour|bottomless|brunch|kids|famil|student|nhs|blue[-_ ]?light|reward|loyalty|app|club|birthday|menu|whats[-_ ]?on|events|voucher|discount/i;
// Sentences that read as a deal.
const DEAL_RES = [
  ["set-menu", /\b(set (lunch|menu)|prix fixe|fixed[- ]price|(two|three|2|3) courses? (for|at|from) £)/i],
  ["pre-theatre", /\bpre[- ]?theatre|early (evening|bird)\b/i],
  ["happy-hour", /\bhappy hours?\b/i],
  ["bottomless", /\bbottomless\b/i],
  ["kids-eat-free", /\bkids? (eat|dine|go) (free|for £?1)\b|children eat free/i],
  ["two-for-one", /\b(2|two)[- ]?(for|4)[- ]?(1|one)\b|buy one,? get one|bogof/i],
  ["percent-off", /\b\d{1,2}% off\b|half[- ]price/i],
  ["byo", /\b(byo|bring your own)\b|no corkage|corkage[- ]free|free corkage/i],
  ["discount-group", /\b(student|nhs|blue light|forces|over[- ]?60s?) discount|unidays|student ?beans|totum|tastecard|blue light card/i],
  ["day-deal", /\b(monday|tuesday|wednesday|thursday|sunday) (deal|offer|special|club|night)s?\b|\b(taco|wing|burger|steak|pizza|curry) (tuesday|monday|wednesday|thursday)\b/i],
  ["free-item", /\bfree (dessert|drink|main|starter|pizza|burger|glass|bottle|meal)\b|birthday (treat|reward|gift|freebie)/i],
  ["app-reward", /\b(download|join|sign up)[^.]{0,40}\b(app|rewards?|club|loyalty)\b/i],
  ["price-hook", /£\d{1,2}(\.\d\d)? (for|lunch|menu|deal|express|bento|thali|pizza and)|\bunder £\d{1,2}\b/i],
];

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|li|h\d|div|section|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&pound;|&#163;/g, "£").replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: ctl.signal });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok) return { status: r.status, url: r.url };
    if (!type.includes("html")) return { status: r.status, url: r.url, skipped: type };
    return { status: r.status, url: r.url, html: (await r.text()).slice(0, 1_500_000) };
  } catch (e) {
    return { status: 0, url, error: String(e.cause?.code ?? e.name) };
  } finally {
    clearTimeout(t);
  }
}

function links(html, base) {
  const host = new URL(base).hostname.replace(/^www\./, "");
  const seen = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let u;
    try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?)$/i.test(u.pathname)) continue;
    const label = m[2].replace(/<[^>]+>/g, " ");
    const key = u.origin + u.pathname;
    if (!LINK_RE.test(u.pathname + " " + label) || seen.has(key)) continue;
    // Offer-ish words rank above plain "menu" so the page budget goes on the likely ones.
    const rank = /offer|deal|promo|special|set|pre[-_ ]?theatre|happy|bottomless|kids|student|reward|birthday|discount/i.test(u.pathname + " " + label) ? 0 : 1;
    seen.set(key, { url: key, rank });
  }
  return [...seen.values()].sort((a, b) => a.rank - b.rank).map((x) => x.url);
}

function hits(text, url) {
  const out = [];
  for (const line of text.split("\n")) {
    if (line.length < 8) continue;
    const types = DEAL_RES.filter(([, re]) => re.test(line)).map(([k]) => k);
    if (types.length) out.push({ url, types, text: line.slice(0, 400) });
  }
  return out;
}

async function crawl(site) {
  const home = await get(site.url);
  const res = { ...site, status: home.status, finalUrl: home.url, error: home.error, pages: 0, hits: [] };
  if (!home.html) return res;
  const queue = [home.url, ...links(home.html, home.url)].slice(0, PAGES_PER_SITE + 1);
  const seenText = new Set();
  for (const [i, u] of queue.entries()) {
    const page = i === 0 ? home : await get(u);
    if (!page.html) continue;
    res.pages++;
    for (const h of hits(textOf(page.html), page.url)) {
      if (seenText.has(h.text)) continue;
      seenText.add(h.text);
      res.hits.push(h);
    }
  }
  return res;
}

const sheet = JSON.parse(fs.readFileSync("data/snapshot-restaurants-v2.json", "utf8"))
  .filter((r) => r.Status === "open" && /^https?:\/\//.test(r.Website ?? ""))
  .map((r) => ({ source: "sheet", slug: r.Slug, name: r.Name, url: r.Website.trim() }));
const chains = JSON.parse(fs.readFileSync("data/food-deals/chains.json", "utf8")).chains.map((c) => ({ source: "chain", name: c.name, url: c.url }));

// One crawl per site: several sheet rows can share a chain's homepage.
const byHost = new Map();
for (const s of [...chains, ...sheet]) {
  if (ONLY === "chains" && s.source !== "chain") continue;
  if (ONLY === "sheet" && s.source !== "sheet") continue;
  let key;
  try { key = new URL(s.url).hostname.replace(/^www\./, "") + new URL(s.url).pathname.replace(/\/$/, ""); } catch { continue; }
  if (!byHost.has(key)) byHost.set(key, { ...s, alsoSlugs: [] });
  else if (s.slug) byHost.get(key).alsoSlugs.push(s.slug);
}
const sites = [...byHost.values()].slice(0, LIMIT);
console.log(`crawling ${sites.length} sites`);

const results = [];
let next = 0;
async function worker() {
  while (next < sites.length) {
    const s = sites[next++];
    results.push(await crawl(s));
    if (results.length % 50 === 0) {
      console.log(`${results.length}/${sites.length}`);
      fs.writeFileSync(OUT, JSON.stringify({ crawled: new Date().toISOString(), results }, null, 1));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(OUT, JSON.stringify({ crawled: new Date().toISOString(), results }, null, 1));

const ok = results.filter((r) => r.pages);
const withHits = ok.filter((r) => r.hits.length);
const byType = {};
for (const r of withHits) for (const t of new Set(r.hits.flatMap((h) => h.types))) byType[t] = (byType[t] ?? 0) + 1;
console.log(`done: ${results.length} sites, ${ok.length} read, ${results.length - ok.length} failed, ${withHits.length} with deal wording`);
console.log("sites per deal type:", byType);
