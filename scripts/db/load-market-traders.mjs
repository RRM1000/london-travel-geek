// Loads the traders at London's food markets into market_traders and links each to a place.
//
//   node scripts/db/load-market-traders.mjs                     # Borough Market from its own site
//   node scripts/db/load-market-traders.mjs work/market-traders # plus every <market>.json in that folder
//
// A <market>.json file is an array of { market, name, kind, description, url } taken from that
// market's own trader directory (kind: street_food, restaurant, bar, coffee, bakery, produce, other).
// Re-runnable: rows are keyed on (market, name); last_checked is refreshed on every row seen.
//
// Linking: the market itself is matched to a place by name. A trader is linked to a place with the
// same core name (name_core) within 1.5 km of the market, or to one of our own places anywhere.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const DIR = process.argv[2];
const clean = (v) => (v ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#8211;|&ndash;/g, "-").replace(/\s+/g, " ").trim();

// --- Borough Market: its trader search returns HTML cards, 12 a page ---
async function borough() {
  const kinds = { "street-food": "street_food", restaurants: "restaurant", "bars-pubs": "bar", "coffee-shops": "coffee" };
  const out = [];
  for (const [type, kind] of Object.entries(kinds)) {
    for (let page = 1; page <= 20; page++) {
      const url = `https://boroughmarket.org.uk/wp-admin/admin-ajax.php?action=search_traders&trader-type=${type}&bo_p=${page}`;
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
      if (!res.ok) throw new Error(`Borough Market ${res.status} for ${type} page ${page}`);
      const body = await res.json();
      const html = body.html ?? "";
      const cards = [...html.matchAll(/<a[^>]+href="([^"]*\/traders\/[^"]+)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<a[^>]+href="[^"]*\/traders\/|$)/g)];
      for (const c of cards) {
        const desc = clean(c[3].match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]);
        out.push({ market: "Borough Market", name: clean(c[2]), kind, description: desc || null,
          url: new URL(c[1], "https://boroughmarket.org.uk").href });
      }
      if (cards.length < 12) break;
    }
  }
  if (out.length < 20) throw new Error(`Borough Market returned only ${out.length} traders; its page layout may have changed`);
  return out;
}

let traders = [];
try { traders.push(...(await borough())); console.log(`Borough Market: ${traders.length} traders`); }
catch (e) { console.log(`Borough Market skipped: ${e.message}`); }
if (DIR && fs.existsSync(DIR)) {
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
    const rows = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const ok = rows.filter((r) => r.market && r.name);
    traders.push(...ok.map((r) => ({ ...r, name: clean(r.name), description: clean(r.description) || null })));
    console.log(`${f}: ${ok.length} traders`);
  }
}
// one row per market and name
const seen = new Set();
traders = traders.filter((t) => { const k = t.market + "|" + t.name.toLowerCase(); return !seen.has(k) && seen.add(k); });

const client = await connect();
await client.query("begin");
for (const t of traders) {
  await client.query(
    `insert into market_traders (market, name, kind, description, url, last_checked)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (market, name) do update set kind = coalesce(excluded.kind, market_traders.kind),
       description = coalesce(excluded.description, market_traders.description),
       url = coalesce(excluded.url, market_traders.url), last_checked = excluded.last_checked`,
    [t.market, t.name, t.kind ?? null, t.description ?? null, t.url ?? null, today]);
}

// the market's own place row: our own row first, then the map's market or food hall
await client.query(`
  update market_traders t set market_place_id = (
    select p.id from places p
    where p.duplicate_of is null and name_core(p.name) = name_core(t.market)
    order by p.recommended desc, (p.category in ('market', 'street_food', 'attraction')) desc, p.lat is null, p.id limit 1)
  where t.market_place_id is null`);

// each trader to a place: same core name near the market, else one of our own places anywhere
const linked = await client.query(`
  with c as (
    select t.id, (
      select p.id from places p, places m
      where m.id = t.market_place_id and p.duplicate_of is null and name_core(p.name) = name_core(t.name)
        and length(name_core(t.name)) >= 3 and p.id <> m.id and p.lat is not null and m.lat is not null
        and abs(p.lat - m.lat) < 0.0135 and abs(p.lng - m.lng) < 0.022
      order by p.recommended desc, abs(p.lat - m.lat) + abs(p.lng - m.lng) limit 1) near,
    (select p.id from places p
      where p.duplicate_of is null and name_core(p.name) = name_core(t.name) and length(name_core(t.name)) >= 4
        and (p.recommended or p.origin = 'data/evidence.json')
      order by p.recommended desc, p.id limit 1) own
    from market_traders t where t.place_id is null)
  update market_traders t set place_id = coalesce(c.near, c.own) from c
  where t.id = c.id and coalesce(c.near, c.own) is not null returning t.id`);
await client.query("commit");

const s = await client.query(`select market, count(*)::int traders, count(place_id)::int linked,
  count(*) filter (where kind = 'street_food')::int street_food from market_traders group by 1 order by 2 desc`);
console.log(`${traders.length} traders read, ${linked.rowCount} newly linked to places`);
console.table(s.rows);
const top = await client.query(`select market, name, kind, sources from market_traders_ranked where sources > 0 limit 25`);
console.log("Most-cited traders:");
console.table(top.rows);
await client.end();
