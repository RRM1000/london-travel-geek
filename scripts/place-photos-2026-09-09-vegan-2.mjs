// Second vegan batch, 9 September 2026.
//
// Two of the three go in. "Jam Delish vegan.jpg" is held back: it is the same
// plate, from the same sitting, as jam-delish-curry.jpg already published in
// the Caribbean guide - same white plate, same plantain, same carrot round in
// the same black bowl, same spoon and glass. Only the framing differs. Running
// it here would put a near-identical photograph in two guides.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-vegetarian-vegan-restaurants-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Purezza.jpg": "purezza.jpg",
  "Holy Carrot.jpg": "holy-carrot.jpg",
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
    `${src.padEnd(18)} -> ${name.padEnd(18)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed; Jam Delish held back as a duplicate of the Caribbean guide's frame`);
