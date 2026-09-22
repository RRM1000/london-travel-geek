// Builds the venue list the event listings are collected from.
//
// Scope is zones 1 and 2, decided by the TfL fare zone of each venue's nearest
// station, plus a short hand-kept list of big venues further out (stadiums,
// arenas, the large clubs) in data/listings/big-venues-outside.json.
//
// Sources:
//   TfL Unified API     every rail, Tube, DLR, Overground and Elizabeth line
//                       station with its fare zone
//   OpenStreetMap       every theatre, arts centre, club, music venue, concert
//                       hall, events venue, museum, gallery, stadium and
//                       live-music pub in Greater London, via Overpass
//
// Raw downloads are cached in work/listings/ (gitignored); pass --refresh to
// fetch them again.
//
//   node scripts/listings/build-venues.mjs [--refresh]
//
import fs from "node:fs";
import path from "node:path";

const WORK = "work/listings";
const OUT = "data/listings/venues.json";
const BIG = "data/listings/big-venues-outside.json";
const REFRESH = process.argv.includes("--refresh");
const UA = "Mozilla/5.0 (compatible; LondonTravelGeek-listings/0.1; +https://www.londontravelgeek.co.uk)";

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

async function cached(file, fetcher) {
  const p = path.join(WORK, file);
  if (!REFRESH && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  const data = await fetcher();
  fs.writeFileSync(p, JSON.stringify(data));
  return data;
}

// --- stations -------------------------------------------------------------
const tfl = await cached("tfl-stops.json", async () => {
  const r = await fetch(
    "https://api.tfl.gov.uk/StopPoint/Mode/tube,dlr,overground,elizabeth-line,national-rail",
    { headers: { "User-Agent": UA } },
  );
  if (!r.ok) throw new Error(`TfL ${r.status}`);
  return r.json();
});

// A zone like "2+3" or "2/3" belongs to both; "NA" is a station outside the
// zonal system (Heathrow's rail stations, some National Rail stops).
const zonesOf = (z) => String(z).split(/[+/]/).map(Number).filter(Boolean);
const stations = tfl.stopPoints
  .filter((s) => /Station$/.test(s.stopType))
  .map((s) => ({
    name: s.commonName.replace(/ (Underground|Rail|DLR) Station$/, "").replace(/ Station$/, ""),
    lat: s.lat,
    lng: s.lon,
    zone: s.additionalProperties.find((p) => p.key === "Zone")?.value,
  }))
  .filter((s) => s.zone && s.zone !== "NA");

// The same station appears once per mode (Underground and Rail); keep one.
const seen = new Set();
const uniqueStations = stations.filter((s) => {
  const k = `${s.name}|${s.lat.toFixed(3)}|${s.lng.toFixed(3)}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestStation(p) {
  let best, bestD = Infinity;
  for (const s of uniqueStations) {
    const d = distanceM(p, s);
    if (d < bestD) { best = s; bestD = d; }
  }
  return { ...best, walkM: Math.round(bestD) };
}

// --- venues ---------------------------------------------------------------
const QUERY = `[out:json][timeout:180];
area["name"="Greater London"]["boundary"="administrative"]->.ldn;
(
  nwr["amenity"~"^(theatre|arts_centre|nightclub|music_venue|concert_hall|events_venue|exhibition_centre|conference_centre)$"](area.ldn);
  nwr["theatre"="concert_hall"](area.ldn);
  nwr["tourism"~"^(museum|gallery)$"](area.ldn);
  nwr["leisure"="stadium"](area.ldn);
  nwr["amenity"~"^(pub|bar)$"]["live_music"="yes"](area.ldn);
);
out center tags;`;

const osm = await cached("osm-venues.json", async () => {
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  return r.json();
});

function kindOf(t) {
  if (t.theatre === "concert_hall" || t.amenity === "concert_hall") return "concert hall";
  if (t.amenity === "music_venue") return "music venue";
  if (t.amenity === "pub" || t.amenity === "bar") return "live-music pub";
  if (t.amenity === "arts_centre") return "arts centre";
  if (t.amenity === "events_venue") return "events venue";
  if (t.amenity === "exhibition_centre" || t.amenity === "conference_centre") return "exhibition centre";
  if (t.leisure === "stadium") return "stadium";
  if (t.tourism === "museum") return "museum";
  if (t.tourism === "gallery" || t.amenity === "art_gallery") return "gallery";
  if (t.amenity === "nightclub") return "nightclub";
  if (t.amenity === "theatre") return "theatre";
  return t.amenity ?? t.tourism ?? t.leisure ?? "venue";
}

const cleanUrl = (u) => {
  if (!u) return "";
  u = u.split(";")[0].trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

const big = JSON.parse(fs.readFileSync(BIG, "utf8"));
const bigNames = new Map(big.venues.filter((v) => v.osmName).map((v) => [v.osmName.toLowerCase(), v]));

const all = [];
for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (!t.name) continue;
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const st = nearestStation({ lat, lng });
  const central = zonesOf(st.zone).some((z) => z <= 2);
  const bigEntry = bigNames.get(t.name.toLowerCase());
  all.push({
    id: `osm-${e.type[0]}${e.id}`,
    name: t.name,
    kind: kindOf(t),
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    postcode: t["addr:postcode"] ?? "",
    website: cleanUrl(t.website ?? t["contact:website"] ?? t.url),
    station: st.name,
    zone: st.zone,
    walkM: st.walkM,
    scope: central ? "zone 1-2" : bigEntry ? "big venue outside" : "outside",
    closed: Boolean(t["disused:amenity"] || t["was:amenity"] || /^(yes|closed)$/.test(t.disused ?? "")),
  });
}

for (const m of big.venues.filter((v) => !v.osmName)) {
  const st = nearestStation(m);
  all.push({
    id: `manual-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: m.name, kind: m.kind, lat: m.lat, lng: m.lng, postcode: m.postcode ?? "",
    website: m.website ?? "", station: st.name, zone: st.zone, walkM: st.walkM,
    scope: "big venue outside", closed: false,
  });
}

// Big venues are matched by their OSM name; one the map lacks is reported, not
// silently dropped.
const matched = new Set(all.filter((v) => v.scope === "big venue outside").map((v) => v.name.toLowerCase()));
const missing = big.venues.filter((v) => v.osmName && !matched.has(v.osmName.toLowerCase()));

const venues = all
  .filter((v) => v.scope !== "outside" && !v.closed)
  .sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), venues }, null, 1) + "\n");

const byKind = {};
for (const v of venues) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
console.log(`${venues.length} venues in scope (${venues.filter((v) => v.website).length} with a website)`);
console.log(byKind);
if (missing.length) console.log(`big venues not found on the map: ${missing.map((v) => v.osmName).join(", ")}`);
if (process.argv.includes("--outside")) {
  for (const v of all.filter((v) => v.scope === "outside" && /stadium|nightclub|exhibition|concert|music|events/.test(v.kind)))
    console.log(`  ${v.kind.padEnd(18)} ${v.name}  (${v.station}, zone ${v.zone})`);
}
