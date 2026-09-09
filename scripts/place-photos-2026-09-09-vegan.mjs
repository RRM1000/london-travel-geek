// Place the six vegetarian/vegan photographs supplied on 9 September 2026.
//
// The Gauthier Soho frame is checked and clean: canapes on the house china
// with no animal product visible. Worth saying because an earlier Gauthier
// photograph was rejected for showing meat at a restaurant that has been
// entirely vegan since 2021. This is not that photograph.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-vegetarian-vegan-restaurants-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Gauthier Soho.jpg": "gauthier-soho.jpg",
  "Mildreds.jpg": "mildreds.jpg",
  "Mallow.jpg": "mallow.jpg",
  "The Gate.jpg": "the-gate.jpg",
  "Diwana.jpg": "diwana-thali.jpg",
  "Temple of Seitan.jpg": "temple-of-seitan.jpg",
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
