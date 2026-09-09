// Place the City walk photographs, shot 31 August 2026 and supplied 9 September.
//
// The assignment is not guesswork: every frame carries GPS, and running
// scripts/photo-gps.mjs over the folder traced the walk stop by stop - 51.5133
// at the Bank junction, 51.5097 at St Dunstan, 51.5068 at St Katharine Docks.
// The order below is capture order, which is also walking order.
//
// sharp strips EXIF on re-encode, which is what we want here: these are a
// person's afternoon with their movements timestamped through it, and none of
// that needs to ship with a travel guide.
//
// These replace the three images borrowed from the City area guide, which are
// deleted in the same commit.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "scratchpad/citywalk";
const OUT = "src/assets/articles/city-of-london-walk";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "PXL_20260831_130742948.MP.jpg": "city-alley-tower-above.jpg",
  "PXL_20260831_131449033.MP.jpg": "leadenhall-market-arcade.jpg",
  "PXL_20260831_131935408.MP.jpg": "walkie-talkie-from-below.jpg",
  "PXL_20260831_133034213.MP.jpg": "bank-junction-royal-exchange.jpg",
  "PXL_20260831_134637170.MP.jpg": "st-dunstan-in-the-east.jpg",
  "PXL_20260831_141248250.jpg": "tower-of-london-entrance.jpg",
  "PXL_20260831_141544232.MP.jpg": "tower-bridge-from-the-wharf.jpg",
  "PXL_20260831_142049784.jpg": "st-katharine-docks-terrace.jpg",
  "PXL_20260831_142239858.MP.jpg": "dickens-inn-st-katharine-docks.jpg",
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
    `${name.padEnd(34)} ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB  gps=${out.exif ? "PRESENT" : "stripped"}`,
  );
  done++;
}
console.log(`\n${done} placed`);
