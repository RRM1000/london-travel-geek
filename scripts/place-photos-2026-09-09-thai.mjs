// Place the five Thai photographs supplied on 9 September 2026.
//
// som-saa.jpg is overwritten deliberately. The file it replaces was a Flickr
// photograph of a cocktail credited to Bex.Walton under CC BY 2.0, sitting
// under a caption about the cooking - a picture of a drink standing in for a
// kitchen. The replacement is the food, it is ours, and the attribution line
// comes out of the article with it.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-thai-restaurants-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Esarn Kheaw.jpg": "esarn-kheaw.jpg",
  "Som Saa.jpg": "som-saa.jpg",
  "101 Thai Kitchen.jpg": "101-thai-kitchen.jpg",
  "Singburi.jpg": "singburi.jpg",
  "Kolae.jpg": "kolae.jpg",
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
    `${src.padEnd(22)} -> ${name.padEnd(22)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
