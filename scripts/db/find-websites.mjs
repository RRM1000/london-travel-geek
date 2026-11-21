// Finds official websites for recommended places that have none, for free:
//   1. the review pages we already hold (Time Out, Hot Dinners, blogs) usually link to the place;
//      a link whose text or address matches the place's name is taken as its site;
//   2. Wikidata's "official website" (P856) for a London item with the same name.
// Each find is recorded with where it came from (attributes.websiteFrom). Re-runnable: places
// already tried are skipped for 30 days.
//
//   node scripts/db/find-websites.mjs              # all of them
//   node scripts/db/find-websites.mjs --max 20 --dry-run
//   node scripts/db/find-websites.mjs --reviewed   # also restaurants, pubs, bars and cafes that 2+ sources review
import { connect } from "./lib.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const MAX = Number(arg("--max") ?? 2000);
const DRY = process.argv.includes("--dry-run");
const REVIEWED = process.argv.includes("--reviewed");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const core = (t) => (t ?? "").toLowerCase().normalize("NFKD").replace(/\s*\(.*\)/g, "")
  .replace(/\b(the|ltd|restaurant|cafe|café|bar|kitchen|and|london|hotel|pub|house|grill|co|uk)\b/g, "").replace(/[^a-z0-9]/g, "");
// links that are never a place's own site
const NOT_OWN = /(instagram|facebook|twitter|x\.com|tiktok|youtube|google\.|goo\.gl|apple\.com|opentable|resy|sevenrooms|designmynight|thefork|quandoo|tripadvisor|yelp|deliveroo|ubereats|just-eat|timeout|hot-dinners|hotdinners|standard\.co\.uk|theguardian|squaremeal|eater\.com|michelin|wikipedia|wikidata|amazon|bit\.ly|linktr\.ee|mailto:|booking\.com|hotels\.com|expedia|getyourguide|ticketmaster|eventbrite|whatsapp|pinterest|spotify|apple\.co|feeds\.|wp-content|cdn\.)/i;

async function get(url, json = false) {
  const res = await fetch(url, { headers: json ? { ...UA, accept: "application/json" } : UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(String(res.status));
  return json ? res.json() : res.text();
}

const pageCache = new Map();
async function fromReviews(p, urls) {
  const c = core(p.name);
  if (c.length < 3) return null;
  for (const url of urls) {
    let html = pageCache.get(url);
    if (html === undefined) { html = await get(url).catch(() => null); pageCache.set(url, html); }
    if (!html) continue;
    const reviewHost = new URL(url).hostname.replace(/^www\./, "");
    for (const m of html.matchAll(/<a[^>]+href="(https?:\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const href = m[1], text = m[2].replace(/<[^>]+>/g, " ");
      if (NOT_OWN.test(href)) continue;
      let host;
      try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { continue; }
      if (host === reviewHost) continue;
      const hostCore = core(host.split(".").slice(0, -1).join(" ").replace(/\b(co|com|org|london|uk)\b/g, ""));
      if (core(text) === c || (c.length >= 5 && hostCore.includes(c)) || (hostCore.length >= 5 && c.includes(hostCore)))
        return { website: `https://${host}${new URL(href).pathname === "/" ? "" : new URL(href).pathname}`.replace(/\/$/, ""), from: url };
    }
  }
  return null;
}

async function fromWikidata(p) {
  const q = `SELECT ?site WHERE { ?item rdfs:label ${JSON.stringify(p.name)}@en; wdt:P856 ?site; wdt:P131* wd:Q23306. } LIMIT 2`;
  const r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, true).catch(() => null);
  const sites = r?.results?.bindings?.map((b) => b.site.value) ?? [];
  return sites.length === 1 ? { website: sites[0], from: "wikidata" } : null;
}

const client = await connect();
const { rows: todo } = await client.query(`
  select p.id, p.name, array_remove(array_agg(distinct r.url), null) as urls
  from places p left join reviews r on r.place_id = p.id and r.url ~ '^https?://' and r.url !~* 'youtube|youtu\\.be|tiktok|instagram'
  where p.duplicate_of is null and p.parent_id is null and p.status <> 'closed' and (p.website is null or p.website = '')
    and (p.recommended or ($2 and p.category in ('restaurant', 'takeaway', 'street_food', 'cafe', 'pub', 'bar')
         and (select count(distinct source_id) from reviews r2 where r2.place_id = p.id) >= 2))
    and coalesce(p.attributes->>'websiteSearchedOn', '') < to_char(current_date - 30, 'YYYY-MM-DD')
  group by p.id order by p.recommended desc, count(r.id) desc, p.id limit $1`, [MAX, REVIEWED]);
console.log(`${todo.length} ${REVIEWED ? "recommended or reviewed" : "recommended"} places without a website`);
let viaReview = 0, viaWiki = 0;
for (const [i, p] of todo.entries()) {
  const hit = (await fromReviews(p, p.urls.slice(0, 6))) ?? (await fromWikidata(p));
  if (hit?.from === "wikidata") viaWiki++; else if (hit) viaReview++;
  if (DRY) { console.log(`${p.name} -> ${hit ? `${hit.website} (from ${hit.from})` : "none"}`); continue; }
  await client.query(
    `update places set website = coalesce(website, $2),
       attributes = attributes || jsonb_build_object('websiteSearchedOn', $3::text) || case when $2 is null then '{}'::jsonb else jsonb_build_object('websiteFrom', $4::text) end
     where id = $1`, [p.id, hit?.website ?? null, today, hit?.from ?? null]);
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1} done: ${viaReview} from review pages, ${viaWiki} from Wikidata`);
}
console.log(`found ${viaReview + viaWiki} websites: ${viaReview} from review pages, ${viaWiki} from Wikidata`);
const s = await client.query(`select count(*)::int recommended, count(nullif(website, ''))::int with_website from places where recommended and duplicate_of is null`);
console.table(s.rows);
await client.end();
