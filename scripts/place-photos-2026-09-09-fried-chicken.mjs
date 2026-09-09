// Place the fried chicken photographs supplied on 9 September 2026.
//
// The Smoking Goat frame is the fish sauce wings. The Thai guide already
// carries a Smoking Goat picture, but that one is the corner shopfront, so
// these are two different photographs of one restaurant rather than a repeat -
// and the wings are the reason it appears in a fried chicken guide at all.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-fried-chicken-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "20foot.jpg": "20ft-fried-chicken.jpg",
  "Chick-King.jpg": "chick-king.jpg",
  "smoking goat.jpg": "smoking-goat-wings.jpg",
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
    `${src.padEnd(18)} -> ${name.padEnd(24)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
