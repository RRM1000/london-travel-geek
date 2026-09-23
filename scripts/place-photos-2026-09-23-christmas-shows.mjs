// One-off: process and place Rob's photos for the Christmas shows guide.
//
// 2000px on the long edge (never enlarged), quality 82, mozjpeg. sharp strips
// metadata unless told otherwise, so no GPS ships.
//
//   node scripts/place-photos-2026-09-23-christmas-shows.mjs <source dir>
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: node place-photos-2026-09-23-christmas-shows.mjs <source dir>");
const OUT = "src/assets/articles/christmas-shows-london";
const LONG_EDGE = 2000;

// source (relative to SRC) -> placed filename
const PLAN = {
  "a-christmas-carol-old-vic/a-christmas-carol-old-vic-2.jpg": "old-vic-christmas-carol-lanterns.jpg",
  "cinderella-london-palladium/cinderella-london-palladium-3.jpg": "london-palladium-auditorium.jpg",
  "robin-hood-stratford-east/robin-hood-stratford-east-3.jpg": "stratford-east-auditorium.jpg",
  "jack-and-the-beanstalk-hackney-empire/jack-and-the-beanstalk-hackney-empire-2.jpg": "hackney-empire-auditorium.jpg",
  "alexandra-palace-theatre/alexandra-palace-theatre-1.jpg": "alexandra-palace-theatre-auditorium.jpg",
  "wiltons-music-hall/wiltons-music-hall-1.jpg": "wiltons-music-hall-auditorium.jpg",
  "nutcracker-english-national-ballet/nutcracker-english-national-ballet-3.jpg": "london-coliseum-at-night.jpg",
  "the-snowman-peacock-theatre/the-snowman-peacock-theatre-3.jpg": "peacock-theatre-entrance.jpg",
  "little-angel-theatre/little-angel-theatre-1.jpg": "little-angel-theatre-auditorium.jpg",
};

fs.mkdirSync(OUT, { recursive: true });
for (const [src, name] of Object.entries(PLAN)) {
  const from = path.join(SRC, src);
  const dest = path.join(OUT, name);
  const meta = await sharp(from).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = rotated ? meta.height : meta.width;
  const h = rotated ? meta.width : meta.height;
  await sharp(from)
    .rotate()
    .resize(h > w ? { height: LONG_EDGE, withoutEnlargement: true } : { width: LONG_EDGE, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  const out = await sharp(dest).metadata();
  const kb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`${src} -> ${name}  ${out.width}x${out.height} (${(out.width / out.height).toFixed(3)})  ${kb}KB  exif:${out.exif ? "yes" : "none"}`);
}
