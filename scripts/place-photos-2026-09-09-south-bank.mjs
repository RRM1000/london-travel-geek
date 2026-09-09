// South Bank walk photographs, shot 31 August 2026 and supplied 9 September.
//
// The roll was walked east to west - Tower Bridge back to the London Eye - so
// capture order is the REVERSE of the article's walking order. GPS assigned
// each frame rather than the filenames: 51.5056/-0.0803 at HMS Belfast,
// 51.5057/-0.0894 in Borough Market, 51.5053/-0.1184 at Between the Bridges.
// EXIF is stripped on re-encode.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "scratchpad/sbphotos";
const OUT = "src/assets/articles/south-bank-walk";
const LONG_EDGE = 2000;

// source -> destination, in the article's walking order (west to east)
const PLAN = {
  "PXL_20260831_153726417.jpg": "between-the-bridges.jpg",
  "PXL_20260831_153248659.MP.jpg": "national-theatre-kerb.jpg",
  "PXL_20260831_152551056.jpg": "oxo-tower-wharf.jpg",
  "PXL_20260831_151908433.MP.jpg": "tate-modern.jpg",
  "PXL_20260831_151720457.MP.jpg": "shakespeares-globe.jpg",
  "PXL_20260831_150634088.MP.jpg": "borough-market.jpg",
  "PXL_20260831_145636136.MP.jpg": "hms-belfast.jpg",
};

fs.mkdirSync(OUT, { recursive: true });

let done = 0;
for (const [src, name] of Object.entries(PLAN)) {
  const from = path.join(SRC, src);
  const dest = path.join(OUT, name);

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
    `${name.padEnd(28)} ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB`,
  );
  done++;
}
console.log(`\n${done} placed`);
