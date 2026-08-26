// Copies photos into src/assets/articles/<folder>/<name>, resizing to the
// site's 2000px ceiling so the repo does not carry camera originals.
//   node scripts/place-photos.mjs <manifest.json> <photoRoot> [--write]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [manifestPath, root] = process.argv.slice(2);
const WRITE = process.argv.includes("--write");
const DEST = "src/assets/articles";
const MAX_WIDTH = 2000;
const QUALITY = 82;

const jobs = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let done = 0;
let skipped = 0;

for (const job of jobs) {
  const from = path.join(root, job.src);
  const to = path.join(DEST, job.to);
  if (!fs.existsSync(from)) {
    console.log(`MISSING  ${job.src}`);
    continue;
  }
  if (fs.existsSync(to)) {
    console.log(`exists   ${job.to}`);
    skipped++;
    continue;
  }
  const meta = await sharp(from).metadata();
  console.log(
    `${WRITE ? "place  " : "would  "} ${job.to}  (${meta.width}x${meta.height})`,
  );
  if (!WRITE) continue;

  fs.mkdirSync(path.dirname(to), { recursive: true });
  await sharp(from)
    .rotate() // bake in EXIF orientation before stripping metadata
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(to);
  done++;
}

console.log(`\n${WRITE ? `placed ${done}` : `${jobs.length} planned`}, ${skipped} already present`);
