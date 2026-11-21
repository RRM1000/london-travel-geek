// Loads every rail, Tube, Overground, Elizabeth line, DLR and tram station in Greater London from
// OpenStreetMap into stations, then sets nearest_station, station_metres and opening_hours on places.
//
//   node scripts/db/load-stations.mjs
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const query = `[out:json][timeout:300];area["boundary"="administrative"]["name"="Greater London"]["admin_level"="5"]->.a;
(nwr["railway"="station"]["name"](area.a);nwr["railway"="halt"]["name"](area.a);nwr["railway"="tram_stop"]["name"](area.a););out center tags;`;
let body;
for (let i = 1; ; i++) {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "london-travel-geek-db/1.0" },
    body: "data=" + encodeURIComponent(query) });
  if (res.ok) { body = await res.json(); break; }
  if (i >= 4) throw new Error(`Overpass ${res.status}`);
  console.log(`Overpass ${res.status}, retrying in ${60 * i}s`);
  await new Promise((r) => setTimeout(r, 60000 * i));
}
if (body.remark) throw new Error(`Overpass stopped early: ${body.remark}`);

const modesOf = (t) => {
  const m = new Set();
  const s = `${t.network ?? ""} ${t.operator ?? ""} ${t.line ?? ""} ${t.subway ?? ""} ${t.station ?? ""}`.toLowerCase();
  if (t.station === "subway" || t.subway === "yes" || /underground/.test(s)) m.add("tube");
  if (/overground/.test(s)) m.add("overground");
  if (/elizabeth/.test(s)) m.add("elizabeth");
  if (t.station === "light_rail" || /dlr|docklands/.test(s)) m.add("dlr");
  if (t.railway === "tram_stop" || /tramlink|tram/.test(s)) m.add("tram");
  if (t.train === "yes" || /national rail|network rail/.test(s) || !m.size) m.add("rail");
  return [...m];
};
// one row per name: OSM maps big stations as several objects
const byName = new Map();
for (const e of body.elements) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (!t.name || lat == null) continue;
  const name = t.name.replace(/\s+(Underground|Rail|Railway|DLR|Overground)\s+Station$/i, "").replace(/\s+Station$/i, "");
  const had = byName.get(name);
  const modes = [...new Set([...(had?.modes ?? []), ...modesOf(t)])];
  byName.set(name, { osm_id: had?.osm_id ?? `${e.type}/${e.id}`, name, modes, lat: had?.lat ?? lat, lng: had?.lng ?? lng });
}
const rows = [...byName.values()];
if (rows.length < 400) throw new Error(`Only ${rows.length} stations for Greater London; expected over 600`);
console.log(`${rows.length} stations`);

const client = await connect();
await client.query(
  `insert into stations (osm_id, name, modes, lat, lng, last_checked)
   select o, n, m::text[], la, lo, d from unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::date[]) as t(o, n, m, la, lo, d)
   on conflict (osm_id) do update set name = excluded.name, modes = excluded.modes, lat = excluded.lat, lng = excluded.lng,
     last_checked = excluded.last_checked`,
  [rows.map((r) => r.osm_id), rows.map((r) => r.name), rows.map((r) => "{" + r.modes.join(",") + "}"),
   rows.map((r) => r.lat), rows.map((r) => r.lng), rows.map(() => today)]);
const n = await client.query("select public.set_nearest_stations() n");
console.log(`nearest station set on ${n.rows[0].n} places`);
const s = await client.query(`select count(*)::int places, count(nearest_station)::int with_station,
  round(avg(station_metres))::int avg_metres, count(opening_hours)::int with_hours from places where duplicate_of is null`);
console.table(s.rows);
await client.end();
