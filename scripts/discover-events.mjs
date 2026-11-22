// Step 1 of the events pipeline: crawl venue sites (attractions, museums, galleries, parks,
// markets, event venues) for What's On pages, and save the dated, event-like sentences as
// candidates for an agent to read. Free: plain fetches, no APIs. Nothing here decides what
// is an event worth listing; it finds where to look. Same shape as discover-food-deals.mjs.
//
//   node scripts/discover-events.mjs --from=data/events-crawl/sites-all.json [--limit=N] [--out=...]
//
// --from is a JSON list of {slug, name, category, recommended, url}, read from the database.
import fs from "node:fs";

const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const FROM = arg("from") ?? "data/events-crawl/sites-all.json";
const OUT = arg("out") ?? "data/events-crawl/candidates.json";
const LIMIT = Number(arg("limit") ?? Infinity);
const CONCURRENCY = 8;
const PAGES_PER_SITE = 6;

// Links worth following from a homepage.
const LINK_RE = /what'?s[-_ ]?on|whats-on|events?|exhibitions?|festival|season|christmas|winter|halloween|easter|summer|lates?\b|late-night|programme|calendar|tickets|seasonal|special|celebrat|new[-_ ]?year|half[-_ ]?term|family/i;
// A sentence carrying a date: "12 December", "December 2026", "until 4 Jan", "2026–27".
const MONTH = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)";
const DATE_RE = new RegExp(`\\b(\\d{1,2}(st|nd|rd|th)?\\s+${MONTH}\\b|${MONTH}\\s+\\d{1,2}(st|nd|rd|th)?\\b|${MONTH}\\s+20(26|27)\\b|\\b20(26|27)\\b)`, "i");
const EVENT_RE = /exhibition|festival|season|christmas|festive|winter|light(s|ing)? (trail|show|festival)|grotto|santa|panto|fireworks|new year|halloween|late(s| night| opening)|concert|screening|performance|show(s|ing)?\b|market|fair|trail|workshop|tour|talk|opens|opening|closes|until|runs? (from|until)|book now|tickets|on sale|half[- ]term|family/i;
const PAST_RE = /\b20(1\d|2[0-5])\b/;

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|li|h\d|div|section|tr|article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&pound;|&#163;/g, "£").replace(/&#39;|&rsquo;/g, "'").replace(/&ndash;|&#8211;/g, "–").replace(/&[a-z]+;|&#\d+;/g, " ")
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
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|ics)$/i.test(u.pathname)) continue;
    const label = m[2].replace(/<[^>]+>/g, " ");
    const key = u.origin + u.pathname;
    if (!LINK_RE.test(u.pathname + " " + label) || seen.has(key)) continue;
    const rank = /what'?s[-_ ]?on|whats-on|events|exhibitions|christmas|festive|winter|season/i.test(u.pathname + " " + label) ? 0 : 1;
    seen.set(key, { url: key, rank });
  }
  return [...seen.values()].sort((a, b) => a.rank - b.rank).map((x) => x.url);
}

function hits(text, url) {
  const out = [];
  for (const line of text.split("\n")) {
    if (line.length < 12 || line.length > 600) continue;
    if (!DATE_RE.test(line) || !EVENT_RE.test(line) || PAST_RE.test(line)) continue;
    out.push({ url, text: line.slice(0, 400) });
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
  res.hits = res.hits.slice(0, 40);
  return res;
}

// One crawl per site: several places can share a homepage. Recommended places first.
const byHost = new Map();
for (const s of JSON.parse(fs.readFileSync(FROM, "utf8")).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0))) {
  let key;
  try { key = new URL(s.url).hostname.replace(/^www\./, "") + new URL(s.url).pathname.replace(/\/$/, ""); } catch { continue; }
  if (!byHost.has(key)) byHost.set(key, { ...s, url: s.url.trim(), alsoSlugs: [] });
  else byHost.get(key).alsoSlugs.push(s.slug);
}
const sites = [...byHost.values()].slice(0, LIMIT);
console.log(`crawling ${sites.length} sites`);

const results = [];
let next = 0;
async function worker() {
  while (next < sites.length) {
    const s = sites[next++];
    results.push(await crawl(s));
    if (results.length % 100 === 0) {
      console.log(`${results.length}/${sites.length}`);
      fs.writeFileSync(OUT, JSON.stringify({ crawled: new Date().toISOString(), results }, null, 1));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(OUT, JSON.stringify({ crawled: new Date().toISOString(), results }, null, 1));
const ok = results.filter((r) => r.pages);
console.log(`done: ${results.length} sites, ${ok.length} read, ${results.length - ok.length} failed, ${ok.filter((r) => r.hits.length).length} with dated event wording`);
