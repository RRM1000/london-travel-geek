// Place the afternoon tea photographs supplied on 9 September 2026.
//
// Ten of eleven. Sketch.jpg is held back: it is the pink Gallery, and the
// entry's own copy says in bold that the room has not been pink since 2022.
// Placing it would deepen an error rather than fix one - and the picture
// already there has the same problem, which is raised separately.
//
// The Rosebery frame REPLACES the subject of the Mandarin Oriental entry
// rather than joining it. What was there is a Flickr photograph of the
// hotel's brick facade credited to ell brown, sitting under a caption that
// reads "the tea room looks over Hyde Park" - a picture of the outside of
// the building standing in for the room. This one is the tea.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const SLUG = "best-afternoon-tea-london";
const LONG_EDGE = 2000;

// source filename -> destination filename
const PLAN = {
  "Fortnum & Mason.webp": "fortnum-and-mason.webp",
  "dorchester.jpg": "the-dorchester.jpg",
  "the-savoy-london.jpg": "the-savoy.jpg",
  "the-lanesborough.jpg": "the-lanesborough.jpg",
  "Corinthia London.jpg": "corinthia-london.jpg",
  "Rosebery.jpg": "rosebery-lounge.jpg",
  "Rosewood London.jpg": "rosewood-london.jpg",
  "The Wolseley.jpg": "the-wolseley.jpg",
  "Connaught.jpg": "the-connaught.jpg",
  "Goring.jpg": "the-goring.jpg",
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
  const pipeline = sharp(from)
    .rotate()
    .resize({ ...(portrait ? { height: LONG_EDGE } : { width: LONG_EDGE }), withoutEnlargement: true });

  await (name.endsWith(".webp")
    ? pipeline.webp({ quality: 82 })
    : pipeline.jpeg({ quality: 82, mozjpeg: true })
  ).toFile(dest + ".tmp");
  fs.renameSync(dest + ".tmp", dest);

  const out = await sharp(dest).metadata();
  console.log(
    `${src.padEnd(24)} -> ${name.padEnd(26)}` +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed; Sketch held back - it is the pre-2022 pink room`);
