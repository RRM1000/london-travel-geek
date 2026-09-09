// Place the three pizza photographs supplied on 9 September 2026.
//
// Unlike the walk scripts, these are three named files rather than a numbered
// roll, so the plan maps filename -> [slug, destination name] directly.
//
// Two of the three arrive at roughly 1000px on the long edge, under the 1200px
// floor the site normally holds to. Nothing here upscales: the resize only ever
// shrinks, so a small original stays its own size and is simply re-encoded to
// the house settings rather than being stretched to 2000px and looking soft.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/rober/Downloads";
const OUT = "src/assets/articles";
const LONG_EDGE = 2000;

// source filename -> [article slug, destination filename]
const PLAN = {
  // The guide's number one, and until now the only one of the three winners
  // with no photograph of its own.
  "short road pizza.jpg": ["best-pizza-london", "short-road-pizza.jpg"],

  // Alley Cats. The frame is the Portobello Road site, which is the branch
  // that runs a slice counter.
  "alleycatsnotting.jpg": ["best-pizza-london", "alley-cats-portobello-road.jpg"],

  // Vincenzo's - a wide New York pie, which is what the kitchen actually
  // cooks, whatever the entry currently says.
  "Vincenzo.jpg": ["best-pizza-london", "vincenzos.jpg"],
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
  await sharp(from)
    .rotate()
    .resize({
      ...(portrait ? { height: LONG_EDGE } : { width: LONG_EDGE }),
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest + ".tmp");
  fs.renameSync(dest + ".tmp", dest);

  const out = await sharp(dest).metadata();
  console.log(
    `${src.padEnd(24)} -> ${slug}/${name}` +
      `  ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed`);
