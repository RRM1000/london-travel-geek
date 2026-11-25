// Makes the deals table match data/food-deals/deals.json, the file the site's deals pages are
// built from. The file is the source of truth: a run replaces every deal row in one transaction,
// so a deal removed from the file (expired, gone) leaves the database too. Nothing else points at
// deals rows, so replacing them is safe. Places are linked by placeId when the deal carries one (the
// First Table rows from first-table.mjs: matched to one branch by postcode, so never re-linked by name),
// then by slug, then by name; a deal at a place we don't hold gets a place row (recommended = false),
// as the first import did.
//
//   node scripts/db/sync-deals.mjs                         # data/food-deals/deals.json
//   node scripts/db/sync-deals.mjs path/to/deals.json      # another copy of it
import fs from "node:fs";
import { connect } from "./lib.mjs";

const FILE = process.argv[2] ?? "data/food-deals/deals.json";
const deals = JSON.parse(fs.readFileSync(FILE, "utf8")).filter((d) => d.name && d.offer);
if (deals.length < 100) throw new Error(`only ${deals.length} deals in ${FILE}; refusing to replace the table with so few`);
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10) : null);
const slugify = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const client = await connect();
await client.query("begin");
// a place row for any deal whose place we don't hold
await client.query(`
  insert into places (slug, name, category, status, recommended, website, attributes, origin, first_seen, last_checked)
  select distinct on (t.slug) t.slug, t.name, 'restaurant', 'unknown', false, t.site, '{}'::jsonb, 'sheet:Food Deals', current_date, current_date
  from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::bigint[]) as t(slug, name, site, own, pid)
  where t.pid is null
    and not exists (select 1 from places p where p.slug = t.own)
    and not exists (select 1 from places p where p.duplicate_of is null and p.parent_id is null and name_core(p.name) = name_core(t.name))
  on conflict (slug) do nothing`,
  [deals.map((d) => "deal-" + slugify(d.name)), deals.map((d) => s(d.name)), deals.map((d) => s(d.site)), deals.map((d) => s(d.slug)), deals.map((d) => d.placeId ?? null)]);
// A placeId must name a live place: a deleted or merged row would otherwise leave the deal unlinked.
const pids = deals.map((d) => d.placeId).filter((v) => v != null);
if (pids.length) {
  const { rows } = await client.query("select id from places where id = any($1::bigint[]) and duplicate_of is null", [pids]);
  const ok = new Set(rows.map((r) => Number(r.id)));
  const bad = deals.filter((d) => d.placeId != null && !ok.has(Number(d.placeId)));
  if (bad.length) { await client.query("rollback"); throw new Error(`placeId not found (or merged): ${bad.slice(0, 5).map((d) => `${d.name} ${d.placeId}`).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}`); }
}
await client.query("delete from deals");
const ins = await client.query(`
  insert into deals (place_id, place_name, type, offer, price, days, times, conditions, branches, ends_on, source_url, quote, attributes, last_checked)
  select coalesce(
           t.pid,
           (select id from places p where p.slug = t.slug),
           (select id from places p where p.duplicate_of is null and p.parent_id is null and name_core(p.name) = name_core(t.name)
              order by p.recommended desc, p.id limit 1),
           (select id from places p where p.slug = 'deal-' || t.dslug)),
         t.name, t.type, t.offer, t.price, t.days, t.times, t.conditions, t.branches, t.ends_on, t.source_url, t.quote, t.attrs, t.checked
  from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::date[],
              $11::text[], $12::text[], $13::jsonb[], $14::date[], $15::text[], $16::bigint[])
    as t(slug, name, type, offer, price, days, times, conditions, branches, ends_on, source_url, quote, attrs, checked, dslug, pid)
  returning id`,
  [deals.map((d) => s(d.slug)), deals.map((d) => s(d.name)), deals.map((d) => s(d.type)), deals.map((d) => s(d.offer)),
   deals.map((d) => s(d.price)), deals.map((d) => s(d.days)), deals.map((d) => s(d.times)), deals.map((d) => s(d.conditions)),
   deals.map((d) => s(d.branches)), deals.map((d) => date(d.endDate)), deals.map((d) => s(d.sourceUrl)), deals.map((d) => s(d.quote)),
   deals.map((d) => JSON.stringify(d)), deals.map((d) => date(d.checked)), deals.map((d) => slugify(d.name)), deals.map((d) => d.placeId ?? null)]);
await client.query("commit");
const c = await client.query("select count(*)::int deals, count(place_id)::int linked, count(*) filter (where ends_on < current_date)::int ended from deals");
console.log(`replaced the deals table with ${ins.rowCount} deals from ${FILE}`);
console.table(c.rows);
await client.end();
