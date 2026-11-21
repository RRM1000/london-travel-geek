// Loads every London food and drink business from the Food Standards Agency hygiene
// register (FHRS) into places. Re-runnable: rows are keyed on fsa_id, and each run
// refreshes last_checked on the rows it created (our own rows record it in attributes.fsa.seenOn).
//
//   node scripts/db/load-fsa.mjs            # DATABASE_URL from env or work/.env
//
// A business already in places (same name and postcode) gets its fsa_id filled in
// rather than a second row. Everything new is recommended = false.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";



const API = "https://api.ratings.food.gov.uk";
const headers = { "x-api-version": "2", accept: "application/json" };
async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(API + url, { headers });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// FHRS business type name -> our category
const TYPES = {
  "Restaurant/Cafe/Canteen": "restaurant",
  "Pub/bar/nightclub": "pub",
  "Takeaway/sandwich shop": "takeaway",
  "Hotel/bed & breakfast/guest house": "hotel",
  "Mobile caterer": "street_food",
};

const today = new Date().toISOString().slice(0, 10);
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const key = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").replace(/^the/, "");
const pc = (v) => (v ?? "").toUpperCase().replace(/\s+/g, "");

const fixture = process.env.FSA_FIXTURE; // a JSON file of establishments, for testing without the API
let establishments = [];
if (fixture) {
  establishments = JSON.parse(fs.readFileSync(fixture, "utf8"));
} else {
  const types = (await get("/BusinessTypes/basic")).businessTypes.filter((t) => TYPES[t.BusinessTypeName]);
  const authorities = (await get("/Authorities")).authorities.filter((a) => a.RegionName === "London");
  console.log(`${authorities.length} London authorities, ${types.length} business types`);
  if (types.some((t) => !t.BusinessTypeId)) throw new Error("A business type has no BusinessTypeId; the API shape may have changed");
  if (!authorities.length || !types.length) throw new Error("FHRS returned no London authorities or business types; the API shape may have changed");
  for (const a of authorities) {
    let n = 0;
    for (const t of types) {
      for (let page = 1; ; page++) {
        const r = await get(`/Establishments?localAuthorityId=${a.LocalAuthorityId}&businessTypeId=${t.BusinessTypeId}&pageSize=5000&pageNumber=${page}`);
        establishments.push(...r.establishments);
        n += r.establishments.length;
        if (page >= (r.meta?.totalPages ?? 1)) break;
      }
    }
    console.log(`  ${a.Name.padEnd(28)} ${n}`);
  }
}
console.log(`fetched ${establishments.length} establishments`);

const client = await connect();

// existing places without an fsa_id, matched on name + postcode
const existing = await client.query("select id, name, postcode from places where fsa_id is null and postcode is not null");
const byNamePc = new Map(existing.rows.map((r) => [key(r.name) + "|" + pc(r.postcode), r.id]));

const rows = [];
const links = [];
const linked = new Set();
for (const e of establishments) {
  const category = TYPES[e.BusinessType];
  if (!category || !s(e.BusinessName)) continue;
  const address = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4].map(s).filter(Boolean).join(", ");
  const attrs = {
    fsaBusinessType: e.BusinessType, hygieneRating: s(e.RatingValue), ratingDate: s(e.RatingDate)?.slice(0, 10) ?? null,
    localAuthority: s(e.LocalAuthorityName), seenOn: today,
  };
  const lat = Number(e.geocode?.latitude) || null;
  const lng = Number(e.geocode?.longitude) || null;
  const match = byNamePc.get(key(e.BusinessName) + "|" + pc(e.PostCode));
  if (match && !linked.has(match)) { linked.add(match); links.push({ id: match, fsa_id: String(e.FHRSID), attrs, lat, lng }); continue; }
  rows.push({
    name: s(e.BusinessName), category, subcategory: e.BusinessType, address: address || null, postcode: s(e.PostCode),
    borough: s(e.LocalAuthorityName), lat, lng, fsa_id: String(e.FHRSID), attributes: JSON.stringify({ fsa: attrs }),
  });
}

await client.query("begin");
for (const l of links) {
  await client.query(
    `update places set fsa_id = $2, lat = coalesce(lat, $3), lng = coalesce(lng, $4),
       attributes = attributes || jsonb_build_object('fsa', $5::jsonb) where id = $1`,
    [l.id, l.fsa_id, l.lat, l.lng, JSON.stringify(l.attrs)]);
}
const cols = ["name", "category", "subcategory", "address", "postcode", "borough", "lat", "lng", "fsa_id", "attributes"];
let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const params = [];
  const values = chunk.map((r) => {
    const v = cols.map((c) => `$${params.push(r[c] ?? null)}`);
    return `(${v.join(",")},'open',false,'fsa',$${params.push(today)}::date,$${params.push(today)}::date)`;
  });
  const res = await client.query(
    `insert into places (${cols.join(",")},status,recommended,origin,first_seen,last_checked) values ${values.join(",")}
     on conflict (fsa_id) where fsa_id is not null do update set
       -- only rows that came from FSA take its name and address; our own rows keep theirs
       name = case when places.origin = 'fsa' then excluded.name else places.name end,
       address = case when places.origin = 'fsa' then excluded.address else places.address end,
       postcode = coalesce(places.postcode, excluded.postcode), borough = coalesce(places.borough, excluded.borough),
       lat = coalesce(excluded.lat, places.lat), lng = coalesce(excluded.lng, places.lng),
       attributes = places.attributes || excluded.attributes,
       -- our own rows keep their editorial last_checked; attributes.fsa.seenOn records the register
       last_checked = case when places.origin = 'fsa' then excluded.last_checked else places.last_checked end
     returning (xmax = 0) as inserted`, params);
  inserted += res.rows.filter((r) => r.inserted).length;
}
await client.query("commit");
console.log(`linked ${links.length} existing places, inserted ${inserted} new, refreshed ${rows.length - inserted}`);
const c = await client.query("select category, count(*)::int n from places where fsa_id is not null group by 1 order by 2 desc");
console.table(c.rows);
await client.end();
