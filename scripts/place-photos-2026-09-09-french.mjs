// Place the seven French photographs supplied on 9 September 2026.
// All seven arrive at 1000px or better, so nothing here is marginal.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-french-restaurants-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Alain Ducasse.jpg": "alain-ducasse-dorchester.jpg",
  "Hélène Darroze.jpg": "helene-darroze-connaught.jpg",
  "Bouchon Racine.jpg": "bouchon-racine.jpg",
  "La Poule Au Pot.jpg": "la-poule-au-pot.jpg",
  "Brooklands.jpg": "brooklands.jpg",
  "64 Goodge Street.jpg": "64-goodge-street.jpg",
  "The French House.jpg": "the-french-house.jpg",
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
    `${src.padEnd(22)} -> ${name.padEnd(28)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
