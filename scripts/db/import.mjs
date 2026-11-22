// One-off load of the Google Sheet export and the repo's research files into Supabase.
// Empties every table first, so it can be re-run until the counts look right.
//
//   DATABASE_URL=postgres://... node scripts/db/import.mjs [dumpDir]
//
// dumpDir defaults to work/sheet-dump (written by scripts/db/dump-sheet.mjs).
// Needs the `pg` package; install it outside the repo's package.json with
//   npm install --prefix work pg
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("work", "noop.js"));
const pg = require("pg");

const dump = process.argv[2] ?? path.join("work", "sheet-dump");
const tab = (f) => JSON.parse(fs.readFileSync(path.join(dump, f + ".json"), "utf8"));
const repo = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10) : null);
const num = (v) => (s(v) !== null && !isNaN(Number(v)) ? Number(v) : null);
const status = (v) =>
  ({ open: "open", closed: "closed", "temporarily-closed": "temporarily_closed" })[s(v)?.toLowerCase()] ?? "unknown";
const key = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").replace(/^the/, "");
const slugify = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

// DATABASE_URL can also live in work/.env (gitignored) as DATABASE_URL=postgres://...
if (!process.env.DATABASE_URL && fs.existsSync(path.join("work", ".env"))) {
  const m = fs.readFileSync(path.join("work", ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL, or put DATABASE_URL=... in work/.env");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });
await client.connect();

async function insertMany(table, cols, rows, returning = "") {
  const out = [];
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params = [];
    const values = chunk.map((r) => "(" + cols.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(",") + ")");
    const sql = `insert into public.${table} (${cols.join(",")}) values ${values.join(",")} on conflict do nothing ${returning}`;
    const res = await client.query(sql, params);
    out.push(...res.rows);
  }
  console.log(`${table.padEnd(14)} +${rows.length}`);
  return out;
}

// Brings the keys in line with supabase/migrations/20261121123000_event_and_review_keys.sql.
await client.query(fs.readFileSync("supabase/migrations/20261121123000_event_and_review_keys.sql", "utf8")
  .replace(/drop index public\./g, "drop index if exists public.").replace(/create unique index (\w+)/g, "create unique index if not exists $1"));

await client.query("begin");
await client.query("truncate public.reviews, public.deals, public.events, public.sources, public.places, public.sheet_extras restart identity cascade");

// ---- places from the Sheet ----
const placeCols = ["slug","name","category","subcategory","status","recommended","address","postcode","area","borough","lat","lng","website","price_band","google_place_id","attributes","origin","first_seen","last_checked"];
const fromSheet = (rows, category, sub, origin, recommended = true) =>
  rows.filter((r) => s(r.Name)).map((r) => ({
    slug: s(r.Slug) ?? slugify(r.Name), name: s(r.Name), category,
    subcategory: s(r[sub]), status: status(r.Status),
    recommended: recommended && status(r.Status) === "open",
    address: s(r.Address), postcode: s(r.Postcode), area: s(r.Neighbourhood), borough: s(r.Borough),
    lat: num(r.Lat), lng: num(r.Lng), website: s(r.Website), price_band: s(r["Price Band"]),
    google_place_id: s(r["Place ID"]), attributes: JSON.stringify(r), origin,
    first_seen: date(r["First Seen"]), last_checked: date(r["Last Checked"]) ?? date(r["Status Checked"]),
  }));

// The Restaurants sheet also holds pubs, cafés, bars and bakeries; their Venue Format sets the category.
const FORMAT_CATEGORY = { "pub": "pub", "gastropub": "pub", "pub residency": "pub", "pub / pizzeria": "pub",
  "coffee shop": "cafe", "cafe": "cafe", "cafe / bar": "cafe", "cocktail bar": "bar", "bar": "bar", "wine bar": "bar",
  "bar residency": "bar", "bakery": "bakery", "patisserie": "bakery", "market stall": "street_food", "market": "market", "food hall": "market" };
const restaurants = fromSheet(tab("restaurants-v2"), "restaurant", "Cuisine", "sheet:Restaurants v2").map((p) => {
  const cat = FORMAT_CATEGORY[(JSON.parse(p.attributes)["Venue Format"] ?? "").trim().toLowerCase()];
  return cat ? { ...p, category: cat } : p;
});
const activities = fromSheet(tab("activities"), "activity", "Activity Type", "sheet:Activities");
const hotels = fromSheet(tab("hotels"), "hotel", "Property Type", "sheet:Hotels");
const hidden = fromSheet(tab("hidden-london"), "hidden_london", "Type", "sheet:Hidden London");
const venues = tab("listing-venues").filter((r) => s(r.Name)).map((r) => ({
  slug: "venue-" + (s(r["Venue ID"]) ?? slugify(r.Name)), name: s(r.Name),
  category: ({ "live-music pub": "pub", nightclub: "nightclub", "music venue": "music_venue", "concert hall": "music_venue" })[r.Kind] ?? slugify(r.Kind).replace(/-/g, "_"),
  subcategory: s(r.Kind), status: "open", recommended: false, postcode: s(r.Postcode), website: s(r.Website),
  attributes: JSON.stringify(r), origin: "sheet:Listing Venues",
}));

// one row per slug; the first tab wins
const seen = new Set();
const allPlaces = [...restaurants, ...activities, ...hotels, ...hidden, ...venues].filter((p) => !seen.has(p.slug) && seen.add(p.slug));
const placeIds = await insertMany("places", placeCols, allPlaces, "returning id, slug, name, category");
const bySlug = new Map(placeIds.map((p) => [p.slug, p.id]));
const byKey = new Map();
for (const p of placeIds) if (!p.slug.startsWith("venue-") && !byKey.has(key(p.name))) byKey.set(key(p.name), p.id);
const venueByName = new Map(placeIds.filter((p) => p.slug.startsWith("venue-")).map((p) => [key(p.name), p.id]));

// branches point at their brand
const branches = tab("branches").map((r) => {
  const parent = byKey.get(key(r.Restaurant));
  return {
    slug: slugify(`${r.Restaurant} ${r.Branch}`), name: `${s(r.Restaurant)} (${s(r.Branch)})`, category: "restaurant",
    status: "open", recommended: true, parent_id: parent ?? null, address: s(r.Address), area: s(r.Neighbourhood),
    borough: s(r.Borough), attributes: JSON.stringify(r), origin: "sheet:Branches",
  };
});
await insertMany("places", [...placeCols.filter((c) => !["subcategory","postcode","lat","lng","website","price_band","google_place_id","first_seen","last_checked"].includes(c)), "parent_id"], branches);

// ---- sources: the tiered domain register plus video creators ----
const reg = repo("data/sources.json");
const excluded = new Set([...(reg.excluded ?? []), ...(reg.blocked?.permanent403 ?? [])]);
const sources = Object.entries(reg.domains).map(([domain, d]) => ({
  name: d.name ?? domain, kind: "publication", tier: d.tier ?? null, domain, url: `https://${domain}`,
  excluded: excluded.has(domain), notes: d.note ?? null, attributes: JSON.stringify(d),
}));
for (const domain of excluded) if (!reg.domains[domain]) sources.push({ name: domain, kind: "publication", domain, url: `https://${domain}`, excluded: true, attributes: "{}" });
const creators = repo("data/creators.json").creators.map((c) => ({
  name: c.name, kind: Object.keys(c.platforms ?? {})[0] ?? "video", tier: "D",
  platforms: JSON.stringify(c.platforms ?? {}), topics: c.topics ?? [], attributes: JSON.stringify(c),
}));
const srcRows = await insertMany("sources", ["name","kind","tier","domain","url","excluded","notes","attributes"], sources, "returning id, name, domain");
const creRows = await insertMany("sources", ["name","kind","tier","platforms","topics","attributes"], creators, "returning id, name");
const srcByDomain = new Map(srcRows.filter((r) => r.domain).map((r) => [r.domain, r.id]));
const srcByName = new Map([...srcRows, ...creRows].map((r) => [key(r.name), r.id]));
const creatorByUrl = new Map();
for (const c of repo("data/creators.json").creators) for (const u of Object.values(c.platforms ?? {})) creatorByUrl.set(u, srcByName.get(key(c.name)));

// ---- reviews: every recorded mention in data/evidence.json ----
// A name the research recorded but the site does not recommend still gets a place row,
// marked recommended = false with status unknown, so its reviews have somewhere to hang.
const evidence = repo("data/evidence.json");
const categoryOf = (topics) => {
  const t = topics.join(" ");
  if (/hotel|hostel|pods|stay-outer/.test(t)) return "hotel";
  if (/pubs|pub-gardens/.test(t)) return "pub";
  if (/bars|speakeasy/.test(t)) return "bar";
  if (/coffee|hot-chocolate|bubble-tea/.test(t)) return "cafe";
  if (/museums|galleries|historic-houses|parks-gardens|views|autumn-leaves|markets/.test(t)) return "attraction";
  if (/activities|cinemas|karaoke|comedy|competitive|live-music|walking-tours|unusual|children|instagrammable|dinner-and-a-show/.test(t)) return "activity";
  return "restaurant";
};
const extraPlaces = [];
for (const [k, v] of Object.entries(evidence)) {
  if (byKey.get(key(v.name)) ?? byKey.get(k)) continue;
  const slug = "evidence-" + (slugify(v.name) || k);
  if (seen.has(slug)) continue;
  seen.add(slug);
  extraPlaces.push({ slug, name: v.name, category: categoryOf(v.topics ?? []), subcategory: (v.topics ?? []).join(", ") || null,
    status: "unknown", recommended: false, attributes: JSON.stringify({ topics: v.topics, sourceCount: v.sourceCount, tierSpread: v.tierSpread }),
    origin: "data/evidence.json" });
}
const extraIds = await insertMany("places", ["slug","name","category","subcategory","status","recommended","attributes","origin"], extraPlaces, "returning id, slug, name");
for (const p of extraIds) if (!byKey.has(key(p.name))) byKey.set(key(p.name), p.id);
const reviews = [];
let unmatched = 0;
for (const [k, v] of Object.entries(evidence)) {
  const placeId = byKey.get(key(v.name)) ?? byKey.get(k) ?? null;
  if (!placeId) unmatched++;
  for (const m of v.sources ?? []) {
    const name = (m.source ?? "").replace(/\s*\((YouTube|TikTok|Instagram)\)$/i, "");
    reviews.push({
      place_id: placeId, place_name: v.name, url: s(m.url),
      source_id: creatorByUrl.get(m.url) ?? srcByDomain.get(domainOf(m.url)) ?? srcByName.get(key(name)) ?? null,
      topic: v.topics?.length === 1 ? v.topics[0] : null, paid: false,
      attributes: JSON.stringify({ tier: m.tier, source: m.source }), recorded_on: null,
    });
  }
}
await insertMany("reviews", ["place_id","place_name","source_id","url","topic","paid","attributes"], reviews);
console.log(`  evidence names with no place row: ${unmatched} of ${Object.keys(evidence).length} (kept with place_id null)`);

// ---- deals ----
// A deal at a place the site does not list gets a place row too, recommended = false.
const dealRows = tab("food-deals").filter((r) => s(r.Restaurant));
const dealPlaces = [];
for (const r of dealRows) {
  if (bySlug.get(s(r.Slug)) ?? byKey.get(key(r.Restaurant))) continue;
  const slug = "deal-" + slugify(r.Restaurant);
  if (seen.has(slug)) continue;
  seen.add(slug);
  dealPlaces.push({ slug, name: s(r.Restaurant), category: "restaurant", status: "unknown", recommended: false,
    website: s(r["Source URL"]), attributes: "{}", origin: "sheet:Food Deals" });
}
for (const p of await insertMany("places", ["slug","name","category","status","recommended","website","attributes","origin"], dealPlaces, "returning id, name"))
  if (!byKey.has(key(p.name))) byKey.set(key(p.name), p.id);
const deals = dealRows.map((r) => ({
  place_id: bySlug.get(s(r.Slug)) ?? byKey.get(key(r.Restaurant)) ?? null, place_name: s(r.Restaurant),
  type: s(r.Type), offer: s(r.Offer), price: s(r.Price), days: s(r.Days), times: s(r.Times), conditions: s(r.Conditions),
  branches: s(r.Branches), ends_on: date(r["End Date"]), source_url: s(r["Source URL"]), quote: s(r.Quote),
  attributes: JSON.stringify(r), last_checked: date(r.Checked),
}));
await insertMany("deals", ["place_id","place_name","type","offer","price","days","times","conditions","branches","ends_on","source_url","quote","attributes","last_checked"], deals);

// ---- events: curated Events tab, then the What's On listings ----
const curated = tab("events").filter((r) => s(r.Name)).map((r) => ({
  place_id: byKey.get(key(r.Venue)) ?? venueByName.get(key(r.Venue)) ?? null, venue_name: s(r.Venue), name: s(r.Name),
  type: s(r["Event Type"]), starts_on: date(r["Starts On"]), ends_on: date(r["Ends On"]), url: s(r.Website) ?? s(r["Booking URL"]),
  feed: "curated", external_id: s(r.Slug), recommended: status(r.Status) === "open", attributes: JSON.stringify(r),
  first_seen: date(r["First Seen"]), last_checked: date(r["Last Checked"]) ?? date(r["Status Checked"]),
}));
const listings = tab("listings").filter((r) => s(r.Title)).map((r) => ({
  place_id: venueByName.get(key(r.Venue)) ?? byKey.get(key(r.Venue)) ?? null, venue_name: s(r.Venue), name: s(r.Title),
  type: s(r.Category), starts_on: date(r.Date), ends_on: date(r.Run?.split(" to ")[1]) ?? date(r.Date),
  price_from: num(r["Price From"]), price_to: num(r["Price To"]), url: s(r.Link), feed: s(r.Source),
  external_id: s(r["Listing ID"]), recommended: false, attributes: JSON.stringify(r), first_seen: date(r["First Seen"]),
  last_checked: date(r["First Seen"]),
}));
const evCols = ["place_id","venue_name","name","type","starts_on","ends_on","price_from","price_to","url","feed","external_id","recommended","attributes","first_seen","last_checked"];
await insertMany("events", evCols, curated);
await insertMany("events", evCols, listings);

// ---- small work-list tabs ----
const extras = [["Overrides","overrides"],["Pizza To Add","pizza-to-add"],["Long Runs","long-runs"]]
  .flatMap(([t, f]) => tab(f).map((r) => ({ tab: t, data: JSON.stringify(r) })));
await insertMany("sheet_extras", ["tab","data"], extras);

await client.query("commit");
const counts = await client.query(`select 'places' t, count(*) from places union all select 'sources', count(*) from sources
  union all select 'reviews', count(*) from reviews union all select 'deals', count(*) from deals
  union all select 'events', count(*) from events union all select 'sheet_extras', count(*) from sheet_extras`);
console.table(counts.rows);
await client.end();
