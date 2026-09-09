// Place the burger photographs supplied on 9 September 2026.
//
// Four of the five go in. Jupiter-Burger.png is 337x270 - a search thumbnail,
// smaller than the 396x505 that was rejected for the Virgin Hotels rooftop -
// and nothing here upscales, so it is left out and asked for again rather than
// stretched to four times its size.
//
// The Plimsoll frame stays webp. src/assets/articles already carries webp
// (the hot chocolate and Shoreditch hotel guides use it) and re-encoding it to
// jpeg would add a generation of loss to buy nothing. Everything still passes
// through sharp so the metadata is stripped.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const LONG_EDGE = 2000;

// source filename -> [article slug, destination filename]
const PLAN = {
  "Plimsoll.webp": ["best-burgers-london", "the-plimsoll.webp"],
  "supernova.jpg": ["best-burgers-london", "supernova.jpg"],
  "Banner_Image.jpg": ["best-burgers-london", "manna.jpg"],
  "dumbo.jpg": ["best-burgers-london", "dumbo.jpg"],
};

let done = 0;
for (const [src, [slug, name]] of Object.entries(PLAN)) {
  const from = path.join(SRC, src);
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
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
    `${src.padEnd(18)} -> ${slug}/${name}` +
      `  ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed; Jupiter-Burger.png held back at 337x270`);
