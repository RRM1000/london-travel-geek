// Copies the What's On listings from the Sheet's Listings tab into the events table, after
// `npm run listings` has rewritten the tab. Keyed on the Listing ID, so a performance seen
// again keeps its row and gets a fresh last_checked; one no longer listed is left as it was.
//
//   node scripts/db/sync-listings.mjs
import { readTab } from "../sheets.mjs";
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10) : null);
const num = (v) => (s(v) !== null && !isNaN(Number(v)) ? Number(v) : null);

const rows = (await readTab("Listings")).filter((r) => s(r.Title) && s(r["Listing ID"]));
console.log(`${rows.length} listings in the Sheet`);
const client = await connect();
const cols = ["venue_name", "name", "type", "starts_on", "ends_on", "price_from", "price_to", "url", "feed", "external_id", "attributes", "first_seen"];
const seen = new Set();
const batch = [];
for (const r of rows) {
  if (seen.has(r["Listing ID"])) continue;
  seen.add(r["Listing ID"]);
  batch.push({
    venue_name: s(r.Venue), name: s(r.Title), type: s(r.Category), starts_on: date(r.Date),
    ends_on: date(r.Run?.split(" to ")[1]) ?? date(r.Date), price_from: num(r["Price From"]), price_to: num(r["Price To"]),
    url: s(r.Link), feed: s(r.Source), external_id: s(r["Listing ID"]), attributes: JSON.stringify(r), first_seen: date(r["First Seen"]) ?? today,
  });
}
let inserted = 0;
await client.query("begin");
for (let i = 0; i < batch.length; i += 1000) {
  const c = batch.slice(i, i + 1000);
  const res = await client.query(
    `insert into events (${cols.join(",")}, recommended, last_checked, place_id)
     select u.venue_name, u.name, u.type, u.starts_on, u.ends_on, u.price_from, u.price_to, u.url, u.feed, u.external_id,
       u.attributes::jsonb, u.first_seen, false, $13::date,
       (select p.id from places p where p.origin = 'sheet:Listing Venues' and lower(p.name) = lower(u.venue_name) limit 1)
     from unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::date[], $6::numeric[], $7::numeric[], $8::text[], $9::text[], $10::text[], $11::text[], $12::date[])
       as u(venue_name, name, type, starts_on, ends_on, price_from, price_to, url, feed, external_id, attributes, first_seen)
     on conflict (coalesce(feed, ''), external_id) where external_id is not null do update set
       name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on, price_from = excluded.price_from,
       price_to = excluded.price_to, url = excluded.url, attributes = excluded.attributes, last_checked = excluded.last_checked
     returning (xmax = 0) as inserted`,
    [...cols.map((k) => c.map((r) => r[k])), today]);
  inserted += res.rows.filter((x) => x.inserted).length;
}
await client.query("commit");
console.log(`events: ${inserted} new, ${batch.length - inserted} refreshed`);
await client.end();
