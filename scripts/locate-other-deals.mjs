// Locates the cinema, gym, spa and activity deals in data/other-deals/ for the deals finder, and
// writes them to the "other" half of data/deal-locations.json ({ name: [[lat, lng, label], ...] }).
//
//   node scripts/locate-other-deals.mjs            only names not already in the file
//   node scripts/locate-other-deals.mjs --refresh  every name again
//
// Chains (Odeon, PureGym) come from one OpenStreetMap Overpass query on name or brand inside
// Greater London. Single venues (branches names one place) go to Nominatim with name and area,
// one request a second. A deal with no physical place (CEA Card) is left out.
import fs from "node:fs";

const OUT = "data/deal-locations.json";
const DIR = "data/other-deals/";
const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
const REFRESH = process.argv.includes("--refresh");
const NOT_A_PLACE = new Set(["CEA Card", "BFI"]);
// OpenStreetMap's name where ours differs.
const OSM_NAME = { "The Ritzy (Picturehouse)": "Ritzy Picturehouse", "Hotel Café Royal (Akasha)": "Akasha Holistic Wellbeing Centre",
  "Better": "Better", "Places Leisure": "Places Leisure" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(.*?\)/g, "")
  .replace(/[’']/g, "").replace(/&/g, "and").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

const deals = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "pages.json")
  .flatMap((f) => JSON.parse(fs.readFileSync(DIR + f, "utf8")));
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
out.other ??= {};
const byName = new Map();
for (const d of deals) if (!NOT_A_PLACE.has(d.name)) (byName.get(d.name) ?? byName.set(d.name, []).get(d.name)).push(d);
const todo = [...byName.keys()].filter((n) => REFRESH || !out.other[n]);
// A chain: no branch named, a word like "all branches", or a list of areas ("Holborn, Brick Lane").
const isChain = (ds) => ds.some((d) => !d.branches || /^all\b|branches|sites|clubs|gyms|cinemas|across|london|,| and /i.test(d.branches));

const chains = todo.filter((n) => isChain(byName.get(n)));
const singles = todo.filter((n) => !isChain(byName.get(n)));

if (chains.length) {
  const names = chains.map((n) => OSM_NAME[n] ?? n.replace(/\(.*?\)/g, "").trim());
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, '\\"');
  const re = `^(${[...new Set(names)].map(esc).join("|")})$`;
  const query = `[out:json][timeout:180];area["boundary"="administrative"]["name"="Greater London"]["admin_level"="5"]->.a;
(nwr["name"~"${re}",i](area.a);nwr["brand"~"${re}",i](area.a););out center tags;`;
  let res;
  for (let i = 0; i < 3; i++) {
    const url = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"][i];
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: "data=" + encodeURIComponent(query) }).catch(() => null);
    if (res?.ok) break;
    console.log(`Overpass ${res?.status ?? "error"} at ${url}`);
    await sleep(5000);
  }
  if (!res?.ok) throw new Error("Overpass unavailable");
  const els = (await res.json()).elements.filter((e) => e.tags && (e.tags.amenity || e.tags.leisure || e.tags.shop || e.tags.tourism || e.tags.club));
  chains.forEach((n, i) => {
    const want = norm(names[i]);
    // "Odeon Luxe Leicester Square", "Hackney Picturehouse": the brand at either end of the name.
    const nm = (e) => norm(e.tags.name);
    const locs = els.filter((e) => norm(e.tags.brand) === want || nm(e) === want || nm(e).startsWith(want + " ") || nm(e).endsWith(" " + want))
      .map((e) => [+(e.lat ?? e.center?.lat).toFixed(5), +(e.lon ?? e.center?.lon).toFixed(5), [e.tags.name, e.tags["addr:street"]].filter(Boolean).join(", ")]);
    console.log(`${String(locs.length).padStart(3)}  ${n}`);
    if (locs.length) out.other[n] = locs;
  });
}

for (const n of singles) {
  const d = byName.get(n)[0];
  const area = (d.branches ?? d.area ?? "").replace(/\(.*?\)/g, "").trim();
  const nm = OSM_NAME[n] ?? n.replace(/\(.*?\)/g, "").trim();
  let r = [], q;
  for (q of [`${nm}, London`, `${nm}, ${area}, London`]) {
    await sleep(1100);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&viewbox=-0.52,51.70,0.34,51.28&bounded=1&q=${encodeURIComponent(q)}`;
    r = await (await fetch(url, { headers: { "user-agent": UA } })).json().catch(() => []);
    if (r[0]) break;
  }
  console.log(`${r[0] ? "  1" : "  0"}  ${n}  ${r[0] ? r[0].display_name.slice(0, 70) : `(${q})`}`);
  if (r[0]) out.other[n] = [[+(+r[0].lat).toFixed(5), +(+r[0].lon).toFixed(5), area || n]];
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`other: ${Object.keys(out.other).length} of ${byName.size} located`);
