// Place the six steak photographs supplied on 9 September 2026.
//
// Five arrive at 1000px on the long edge and one at 744px. None is upscaled.
// That is within what the site already ships: of 723 article images, fifteen
// are under 900px and the smallest in use is 599px, so 744px is soft rather
// than out of place - and the Macellaio frame is the carne cruda, which is the
// exact dish its entry says explains the restaurant.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-steak-restaurants-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "cut park lane.jpg": "cut-45-park-lane.jpg",
  "guinea grill.jpg": "the-guinea-grill.jpg",
  "blacklock steak.jpg": "blacklock-steak.jpg",
  "The Quality Chop House.jpg": "quality-chop-house.jpg",
  "smith and wollensky.jpg": "smith-and-wollensky.jpg",
  "macellaio.jpg": "macellaio-carne-cruda.jpg",
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
    `${src.padEnd(28)} -> ${name}` +
      `  ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
