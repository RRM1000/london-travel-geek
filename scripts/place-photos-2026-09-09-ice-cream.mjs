// Place the ice cream photographs supplied on 9 September 2026. Ten, not nine:
// a Gelupo frame came with them, and Gelupo is the one entry that already had
// a picture - a Flickr tub credited to andreasivarsson under CC BY 2.0. It is
// overwritten here and the attribution line comes out of the article, the same
// swap made for Som Saa in the Thai guide earlier today.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-ice-cream-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Gelupo.jpg": "gelupo.jpg",
  "Romeo and Giulietta.jpg": "romeo-and-giulietta.jpg",
  "Nardulli.jpg": "nardulli.jpg",
  "Badiani-1377x1125.jpg": "badiani.jpg",
  "Unico Gelato.jpg": "unico-gelato.jpg",
  "Oddono\u2019s.jpg": "oddonos.jpg",
  "Ice-Cream-Union.jpg": "ice-cream-union.jpg",
  "Udderlicious.jpg": "udderlicious.jpg",
  "Mamasons Dirty Ice Cream.jpg": "mamasons-bilog.jpg",
  "Festok.jpg": "festok.jpg",
};

const dir = path.join(OUT, SLUG);
fs.mkdirSync(dir, { recursive: true });

let done = 0;
for (const [src, name] of Object.entries(PLAN)) {
  const from = path.join(SRC, src);
  const dest = path.join(dir, name);
  const existed = fs.existsSync(dest);

  const meta = await sharp(from).metadata();
  const portrait = (meta.orientation ?? 1) >= 5 ? meta.width < meta.height : meta.height > meta.width;
  await sharp(from)
    .rotate()
    .resize({ ...(portrait ? { height: LONG_EDGE } : { width: LONG_EDGE }), withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest + ".tmp");
  fs.renameSync(dest + ".tmp", dest);

  const out = await sharp(dest).metadata();
  console.log(
    `${src.padEnd(30)} -> ${name.padEnd(24)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
