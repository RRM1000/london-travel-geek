// Works out which ticketing system each venue sells through, so one reader per
// system can collect events from every venue that uses it.
//
// Reads each venue's homepage and its what's-on page (the first link that looks
// like one), and records every ticketing system whose fingerprint appears, plus
// whether the pages carry schema.org Event data a generic reader can use.
//
// Results are cached in data/listings/platforms.json by venue id; a venue
// already checked is skipped unless --recheck is passed.
//
//   node scripts/listings/detect-platforms.mjs [--recheck] [--limit N]
//
import fs from "node:fs";

const VENUES = "data/listings/venues.json";
const OUT = "data/listings/platforms.json";
const UA = "Mozilla/5.0 (compatible; LondonTravelGeek-listings/0.1; +https://www.londontravelgeek.co.uk)";
const RECHECK = process.argv.includes("--recheck");
const li = process.argv.indexOf("--limit");
const LIMIT = li > 0 ? Number(process.argv[li + 1]) : Infinity;
const CONCURRENCY = 8;

// Order matters only for the report: the first match is the likely primary.
const FINGERPRINTS = [
  ["spektrix", /spektrix/i],
  ["tessitura", /tessitura|\/tnew\/|tnew-/i],
  ["audienceview", /audienceview|\.ovationtix\./i],
  ["ticketsolve", /ticketsolve\.com/i],
  ["ticketsource", /ticketsource\.co\.uk/i],
  ["tickettailor", /tickettailor\.com/i],
  ["seetickets", /seetickets\.com/i],
  ["dice", /dice\.fm/i],
  ["ra", /\bra\.co\/events|residentadvisor\.net/i],
  ["skiddle", /skiddle\.com/i],
  ["fatsoma", /fatsoma\.com/i],
  ["fixr", /fixr\.co/i],
  ["eventbrite", /eventbrite\.(co\.uk|com)\/e\//i],
  ["ticketmaster", /ticketmaster\.co\.uk|ticketmaster\.com/i],
  ["axs", /\baxs\.com/i],
  ["eventim", /eventim\.co\.uk/i],
  ["gigantic", /gigantic\.com/i],
  ["tribe", /tribe-events|wp-json\/tribe\/events/i],
];

const EVENT_TYPES = /"@type"\s*:\s*\[?\s*"(Event|MusicEvent|TheaterEvent|ComedyEvent|DanceEvent|ExhibitionEvent|Festival|ScreeningEvent|SportsEvent|ChildrensEvent|EducationEvent|LiteraryEvent|SocialEvent|VisualArtsEvent)"/;

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const { venues } = JSON.parse(fs.readFileSync(VENUES, "utf8"));
const todo = venues.filter((v) => v.website && (RECHECK || !cache[v.id])).slice(0, LIMIT);

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: ctl.signal });
    const html = r.ok ? await r.text() : "";
    return { status: r.status, url: r.url, html };
  } catch (e) {
    return { status: 0, url, html: "", error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

// The what's-on page: first same-site link whose href or text says so.
function findEventsUrl(html, base) {
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  const want = /what'?s[-\s]?on|whats-on|events|listings|gigs|calendar|programme|shows|tickets|performances|exhibitions/i;
  let m;
  while ((m = re.exec(html))) {
    const [, href, text] = m;
    const plain = text.replace(/<[^>]+>/g, " ");
    if (!want.test(href) && !want.test(plain)) continue;
    try {
      const u = new URL(href, base);
      const b = new URL(base);
      if (u.hostname.replace(/^www\./, "") !== b.hostname.replace(/^www\./, "")) continue;
      if (u.pathname === "/" || u.pathname === b.pathname) continue;
      return u.toString();
    } catch { /* bad href */ }
  }
  return "";
}

function fingerprint(html) {
  return FINGERPRINTS.filter(([, re]) => re.test(html)).map(([k]) => k);
}

async function check(v) {
  const home = await get(v.website);
  const rec = { checked: new Date().toISOString().slice(0, 10), status: home.status, finalUrl: home.url };
  if (home.error) rec.error = home.error;
  if (!home.html) return rec;
  rec.eventsUrl = findEventsUrl(home.html, home.url);
  let html = home.html;
  if (rec.eventsUrl) {
    const ev = await get(rec.eventsUrl);
    rec.eventsStatus = ev.status;
    html += ev.html;
    rec.eventsJsonLd = EVENT_TYPES.test(ev.html);
  }
  rec.homeJsonLd = EVENT_TYPES.test(home.html);
  rec.platforms = fingerprint(html);
  return rec;
}

let done = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const v = queue.shift();
    cache[v.id] = { name: v.name, website: v.website, ...(await check(v)) };
    if (++done % 25 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(cache, null, 1) + "\n");
      console.log(`${done}/${todo.length}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(OUT, JSON.stringify(cache, null, 1) + "\n");

// Report across everything cached, not just this run.
const recs = Object.values(cache);
const count = {};
for (const r of recs) for (const p of r.platforms ?? []) count[p] = (count[p] ?? 0) + 1;
const jsonld = recs.filter((r) => r.homeJsonLd || r.eventsJsonLd).length;
const failed = recs.filter((r) => !r.platforms).length;
console.log(`${recs.length} venues checked: ${jsonld} publish schema.org events, ${failed} could not be read`);
console.log(Object.fromEntries(Object.entries(count).sort((a, b) => b[1] - a[1])));
