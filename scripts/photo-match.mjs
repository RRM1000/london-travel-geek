// Matches photographs to venues by GPS, so a folder of pictures can be placed.
//
//   node scripts/photo-match.mjs <dir> [--radius=60]
//
// Reads EXIF GPS with the same parser as photo-gps.mjs, then finds every venue
// in the sheet export within `radius` metres and reports which guides each one
// appears in and whether that guide already has a photo of it.
//
// GPS ON A PHONE IS ACCURATE TO ROUGHLY 10-30 METRES in a street with tall
// buildings, and a Brick Lane frontage can have four restaurants within that.
// So this RANKS candidates and never picks one - the last step is a human
// looking at the picture.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dir = process.argv[2];
const RADIUS = Number((process.argv.find((a) => a.startsWith("--radius=")) || "").slice(9) || 60);
if (!dir) { console.error("usage: photo-match.mjs <dir> [--radius=60]"); process.exit(1); }

// venue coordinates from the owner script
const src = fs.readFileSync("scripts/write-restaurants-v2.mjs", "utf8");
const venues = [];
{
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "{") continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "},") j++;
    const block = lines.slice(i, j + 1).join("\n");
    const f = (k) => (block.match(new RegExp(`${k}: "((?:[^"\\\\]|\\\\.)*)"`)) || [])[1];
    // Coordinates are almost never in the row literal - only six rows carry
    // one. They live in data/enrichment.json, keyed by slug, and are merged in
    // below. Push the row regardless so the merge has something to attach to.
    if (f("name") && f("slug")) {
      venues.push({ name: f("name"), slug: f("slug"), lat: Number(f("lat")) || 0,
        lng: Number(f("lng")) || 0, lists: f("lists") || "", hood: f("hood") || "" });
    }
    i = j;
  }
}

// enrichment carries coordinates the row literals do not
try {
  const e = JSON.parse(fs.readFileSync("data/enrichment.json", "utf8"));
  const bySlug = new Map(venues.map((v) => [v.slug, v]));
  for (const [slug, v] of Object.entries(e)) {
    if (!v.lat || !v.lng) continue;
    const row = bySlug.get(slug);
    // MERGE, do not skip. The first version only added enrichment rows whose
    // slug was missing, so all 795 sets of coordinates were discarded and one
    // photo in seventy-four matched anything.
    if (row) { if (!row.lat) { row.lat = +v.lat; row.lng = +v.lng; } }
    else venues.push({ name: v.placesName || slug, slug, lat: +v.lat, lng: +v.lng, lists: "", hood: "" });
  }
} catch { /* no enrichment cache */ }

// which guides mention a venue, and whether they already show a photo of it
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const articles = {};
for (const f of fs.readdirSync("src/content/articles").filter((x) => x.endsWith(".md"))) {
  articles[f.replace(/\.md$/, "")] = fs.readFileSync(`src/content/articles/${f}`, "utf8");
}
const guidesFor = (v) => {
  const n = norm(v.name);
  const out = [];
  for (const [slug, text] of Object.entries(articles)) {
    const heads = [...text.matchAll(/^#{3,4} (.+)$/gm)].map((m) => norm(m[1].split(",")[0].split(/\s+—\s+/)[0]));
    const bolds = [...text.matchAll(/\*\*\[?([^\]*]{2,60}?)\]?\*\*/g)].map((m) => norm(m[1]));
    if (!heads.includes(n) && !bolds.includes(n)) continue;
    const imgs = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    const hasPhoto = imgs.some((p) => norm(p).includes(n) || (v.slug && p.includes(v.slug)));
    out.push(`${slug}${hasPhoto ? " [HAS PHOTO]" : ""}`);
  }
  return out;
};

const R = 6371000;
const metres = (a, b, c, d) => {
  const p = Math.PI / 180;
  const x = (c - a) * p, y = (d - b) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const located = venues.filter((v) => v.lat && v.lng);
console.log(`${located.length} venues with coordinates`);

const gps = execFileSync("node", ["scripts/photo-gps.mjs", dir], { encoding: "utf8", maxBuffer: 32e6 });
let placed = 0, unplaced = 0;
for (const line of gps.split("\n")) {
  const m = line.match(/^(\S+)\s+(-?\d+\.\d+),(-?\d+\.\d+)\s+(\S+ \S+)/);
  if (!m) continue;
  const [, file, lat, lng, when] = m;
  const near = located
    .map((v) => ({ ...v, d: Math.round(metres(+lat, +lng, v.lat, v.lng)) }))
    .filter((v) => v.d <= RADIUS)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  if (!near.length) { unplaced++; continue; }
  placed++;
  console.log(`\n${file}  ${when.slice(11)}`);
  for (const v of near) {
    const g = guidesFor(v);
    console.log(`   ${String(v.d).padStart(3)}m  ${v.name.padEnd(30)} ${g.length ? g.join(", ") : "(in no guide)"}`);
  }
}
console.log(`\n${placed} photo(s) near a known venue, ${unplaced} with nothing within ${RADIUS}m`);
