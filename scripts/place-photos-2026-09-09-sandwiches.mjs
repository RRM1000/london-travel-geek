// Place the sandwich photographs supplied on 9 September 2026.
//
// Four of the five go in. The Sons + Daughters frame is held back: the
// operator's site (sonsanddaughters.uk) now returns a Squarespace expiry page,
// their older domain is already recorded in data/closed.json as hijacked to
// gambling content, and the King's Cross landlord's own tenant directory no
// longer lists them at Coal Drops Yard. Putting a fresh photograph and caption
// on an entry that may need retiring would be pushing the wrong way.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-sandwiches-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Tongue & Brisket.jpg": "tongue-and-brisket.jpg",
  "salt-beef-porterford.jpg": "porterford-butchers.jpg",
  "secret sandwich.jpg": "secret-sandwich-shop.jpg",
  "Dusty Knuckle.jpg": "the-dusty-knuckle.jpg",
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
    `${src.padEnd(26)} -> ${name}` +
      `  ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed; Sons + Daughters held back pending a trading check`);
