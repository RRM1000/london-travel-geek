// Standalone preview of one article, for when Astro cannot build.
//
// Application Control on this machine intermittently blocks astro's native
// compiler binding, which takes the whole site build down with it. That is a
// bad reason to be unable to look at a draft, so this renders a single markdown
// article to a self-contained HTML file using micromark (already a dependency)
// and inlines the images as data URIs so the file opens from anywhere.
//
// It is a PROOF, not a preview of the real page: no site header, no layout, no
// fonts. It exists to answer "does the copy read right and are the photographs
// in the right order", which is the question a draft actually raises.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

const slug = process.argv[2];
const src = `src/content/articles/${slug}.md`;
const raw = fs.readFileSync(src, "utf8");

const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
const front = fm[1];
const body = fm[2];
const field = (k) => (front.match(new RegExp(`^${k}: *"?(.*?)"?$`, "m")) || [])[1] ?? "";

// Images are shrunk hard for the preview - this file is for reading, and a
// 30MB page of full-size photographs defeats the point of being able to open it.
const inline = async (rel) => {
  const file = path.join("src/assets", rel.replace(/^\.\.\/\.\.\/assets\//, ""));
  const buf = await sharp(file).resize({ width: 900 }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
};

let html = micromark(body, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });

for (const m of [...html.matchAll(/src="(\.\.\/\.\.\/assets\/[^"]+)"/g)]) {
  html = html.replace(m[1], await inline(m[1]));
}

const hero = field("heroImage") ? await inline(field("heroImage")) : "";

// The route map, read straight out of the component so the preview cannot drift
// from what the page will actually render.
const comp = fs.readFileSync("src/components/ColourfulStreetsMap.astro", "utf8");
const stops = [...comp.matchAll(
  /\{ n: (\d+), name: "([^"]+)", lat: ([\d.-]+), lng: ([\d.-]+),\s*note: "([^"]+)" \}/g,
)].map((m) => ({ n: +m[1], name: m[2], lat: +m[3], lng: +m[4], note: m[5] }));

const out = `<!doctype html><html><head><meta charset="utf-8">
<title>PREVIEW: ${field("title")}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
 body{font:17px/1.65 Georgia,serif;max-width:44rem;margin:0 auto;padding:2rem 1.2rem 5rem;color:#1a1a1a}
 h1{font-size:2.1rem;line-height:1.15}h2{margin-top:2.4rem;border-top:2px solid #111;padding-top:.6rem}
 h3{margin-top:1.8rem;color:#333}
 img{width:100%;border-radius:6px;margin:1.2rem 0}
 blockquote{border-left:4px solid #6941c6;margin:1.4rem 0;padding:.6rem 1rem;background:#f6f4fb}
 table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.45rem;text-align:left}
 .banner{background:#fff4e5;border:1px solid #e8c9a0;padding:.7rem 1rem;border-radius:6px;font:14px/1.5 system-ui;margin-bottom:1.5rem}
 #map{height:460px;border-radius:8px;margin:1rem 0}
 .desc{color:#555;font-style:italic}
 ol.stops{font:15px/1.5 system-ui;padding-left:1.2rem}
</style></head><body>
<p class="banner"><strong>Local preview</strong> — content and photo order only. No site header, layout, fonts or styling; the real page will look different. Generated because Astro could not build.</p>
<h1>${field("title")}</h1>
<p class="desc">${field("description")}</p>
${hero ? `<img src="${hero}" alt="">` : ""}
<h2>Map of the route</h2>
<div id="map"></div>
<ol class="stops">${stops.map((s) => `<li><strong>${s.name}</strong> — ${s.note}</li>`).join("")}</ol>
${html}
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
 const stops=${JSON.stringify(stops)};
 const map=L.map('map',{scrollWheelZoom:false});
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
 const pts=stops.map(s=>[s.lat,s.lng]);
 L.polyline(pts,{color:'#6941c6',weight:3,opacity:.75,dashArray:'6 8'}).addTo(map);
 stops.forEach(s=>L.marker([s.lat,s.lng],{icon:L.divIcon({className:'',html:'<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#6941c6;color:#fff;font:700 12px system-ui">'+s.n+'</span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map).bindPopup('<strong>'+s.n+'. '+s.name+'</strong><br>'+s.note));
 map.fitBounds(L.latLngBounds(pts),{padding:[30,30]});
</script></body></html>`;

const dest = process.argv[3] || `${slug}-preview.html`;
fs.writeFileSync(dest, out);
console.log(`${dest}  ${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)}MB  ${stops.length} stops`);
