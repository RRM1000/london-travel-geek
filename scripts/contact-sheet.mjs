// Tiles a folder of photos into numbered contact sheets for quick review.
//   node scripts/contact-sheet.mjs <srcDir> <outDir> [perSheet]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [src, out, perArg] = process.argv.slice(2);
const PER = Number(perArg) || 6;
const COLS = 3;
const TILE_W = 640;
const TILE_H = 480;
const PAD = 8;

fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(src).filter((f) => /\.jpe?g$/i.test(f)).sort();

// A caption strip under each tile carries the index, so a pick can be named.
function label(text) {
  const safe = text.replace(/[<>&]/g, "");
  return Buffer.from(
    `<svg width="${TILE_W}" height="34">
       <rect width="100%" height="100%" fill="#0E1B2C"/>
       <text x="10" y="23" font-family="monospace" font-size="18" fill="#F2A93B">${safe}</text>
     </svg>`,
  );
}

for (let s = 0; s * PER < files.length; s++) {
  const batch = files.slice(s * PER, s * PER + PER);
  const rows = Math.ceil(batch.length / COLS);
  const cellH = TILE_H + 34;
  const canvas = sharp({
    create: {
      width: COLS * TILE_W + PAD * (COLS + 1),
      height: rows * cellH + PAD * (rows + 1),
      channels: 3,
      background: "#111",
    },
  });

  const composites = [];
  for (let i = 0; i < batch.length; i++) {
    const idx = s * PER + i;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const left = PAD + col * (TILE_W + PAD);
    const top = PAD + row * (cellH + PAD);
    const img = await sharp(path.join(src, batch[i]))
      .rotate() // honour EXIF orientation
      .resize(TILE_W, TILE_H, { fit: "cover" })
      .toBuffer();
    composites.push({ input: img, left, top });
    composites.push({ input: label(`[${idx}] ${batch[i]}`), left, top: top + TILE_H });
  }

  const file = path.join(out, `sheet-${s}.jpg`);
  await canvas.composite(composites).jpeg({ quality: 78 }).toFile(file);
  console.log(`${file}  ${batch.map((b, i) => `[${s * PER + i}] ${b}`).join("  ")}`);
}
