// Finds the website of each recommended place that has none, with Google's Places API (New) Text
// Search, and records it with the Google place id. Also flags places Google lists as closed.
//
//   node scripts/db/fill-websites-google.mjs              # GOOGLE_PLACES_KEY from env or work/.env
//   node scripts/db/fill-websites-google.mjs --max 50     # at most 50 searches (default 900)
//   node scripts/db/fill-websites-google.mjs --dry-run    # search and print, write nothing
//
// Cost: asking for websiteUri bills the "Text Search Enterprise" SKU, which has 1,000 free calls a
// month and then costs $35 per 1,000. The default cap of 900 keeps one run inside the free calls.
// A result is used only when its name matches and it is within 300 m of the place (or, with no
// coordinates, its address has the place's postcode).
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const MAX = Number(arg("--max") ?? 900);
const DRY = process.argv.includes("--dry-run");
let KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY && fs.existsSync(path.join("work", ".env")))
  KEY = fs.readFileSync(path.join("work", ".env"), "utf8").match(/^GOOGLE_PLACES_KEY=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!KEY) throw new Error("Put GOOGLE_PLACES_KEY=... in work/.env");

const today = new Date().toISOString().slice(0, 10);
const core = (t) => (t ?? "").toLowerCase().normalize("NFKD").replace(/\s*\(.*\)/g, "")
  .replace(/\b(the|ltd|limited|restaurant|cafe|café|bar|kitchen|and|london|hotel|pub|house|grill|co|uk)\b/g, "").replace(/[^a-z0-9]/g, "");
const sameName = (a, b) => {
  const [x, y] = [core(a), core(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 4 && s.length / l.length >= 0.4 && l.includes(s);
};
const metres = (a, b) => 111000 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.6225);
const pc = (v) => (v ?? "").toUpperCase().replace(/\s+/g, "");

const client = await connect();
const { rows: todo } = await client.query(`
  select id, name, address, postcode, area, lat, lng, category from places
  where recommended and duplicate_of is null and (website is null or website = '')
    and coalesce(attributes->'google'->>'searchedOn', '') = ''
  order by parent_id nulls first, id limit $1`, [MAX]);
console.log(`${todo.length} recommended places without a website to look up`);

let found = 0, closed = 0, calls = 0;
for (const p of todo) {
  const body = { textQuery: [p.name, p.address, p.postcode, p.area, "London"].filter(Boolean).join(", "), pageSize: 3, regionCode: "GB" };
  if (p.lat) body.locationBias = { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 500 } };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.businessStatus" } });
  calls++;
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const hit = ((await res.json()).places ?? []).find((g) => sameName(p.name, g.displayName?.text) && (p.lat
    ? metres(p, { lat: g.location?.latitude, lng: g.location?.longitude }) <= 300
    : p.postcode && pc(g.formattedAddress).includes(pc(p.postcode))));
  const g = { searchedOn: today, ...(hit ? { placeName: hit.displayName?.text, businessStatus: hit.businessStatus } : { noMatch: true }) };
  if (hit?.websiteUri) found++;
  if (hit?.businessStatus === "CLOSED_PERMANENTLY") closed++;
  if (DRY) { console.log(`${p.name} -> ${hit ? `${hit.displayName?.text} ${hit.websiteUri ?? "(no website)"} ${hit.businessStatus}` : "no match"}`); continue; }
  await client.query(
    `update places set website = coalesce(website, $2), google_place_id = coalesce($3, google_place_id),
       attributes = attributes || jsonb_build_object('google', $4::jsonb)
         || case when $5 then jsonb_build_object('alert', 'Google lists it as permanently closed (' || $6 || '); check it is still trading.') else '{}'::jsonb end
     where id = $1`,
    [p.id, hit?.websiteUri ?? null, hit?.id ?? null, JSON.stringify(g), hit?.businessStatus === "CLOSED_PERMANENTLY", today]);
}
console.log(`${calls} searches, ${found} websites found, ${closed} listed as permanently closed`);
const s = await client.query(`select count(*)::int recommended, count(website)::int with_website from places where recommended and duplicate_of is null`);
console.table(s.rows);
await client.end();
