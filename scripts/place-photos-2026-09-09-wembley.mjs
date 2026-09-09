// Two Wembley Park photographs, both shot 9 September 2026, one for each guide.
//
// GPS put them 400m apart at Wembley Park - 51.5563 at the London Designer
// Outlet, 51.5605 at Boxpark - which is how they were assigned rather than by
// filename. EXIF is stripped on re-encode as usual.
//
// The Boxpark frame JOINS the container-yards section rather than replacing
// what is there: the existing picture is Boxpark Shoreditch, a different site,
// and the section covers all four Boxparks.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "scratchpad/new2";
const LONG_EDGE = 2000;

// source -> [article slug, destination filename]
const PLAN = {
  "PXL_20260909_121827783.MP.jpg": ["shopping-in-london", "london-designer-outlet.jpg"],
  "PXL_20260909_122406103.jpg": ["best-street-food-london", "boxpark-wembley.jpg"],
};

let done = 0;
for (const [src, [slug, name]] of Object.entries(PLAN)) {
  const from = path.join(SRC, src);
  const dir = path.join("src/assets/articles", slug);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);

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
    `${slug}/${name}`.padEnd(48) +
      ` ${meta.width}x${meta.height} -> ${out.width}x${out.height}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB`,
  );
  done++;
}
console.log(`\n${done} placed`);
