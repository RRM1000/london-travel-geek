// Fails the build when a published article's hero image is portrait or square.
//
// WHY
// Article cards crop the hero to 16:9 with object-fit: cover. A portrait hero
// comes out as a band of sky above the Radcliffe Camera or the corner of a
// glass counter instead of the wok behind it. Twelve guides shipped like that
// before Rob spotted them on 15 Sep 2026.
//
// WHY A SCRIPT AND NOT THE CONTENT SCHEMA
// The obvious home is `image().refine(img => img.width / img.height >= 1.3)`
// in src/content.config.ts, and Astro's own docs show that pattern. Under the
// glob content loader it doesn't work: refine receives an unresolved image
// reference with no width or height, so every article with a hero fails.
//
//   node scripts/check-hero-images.mjs     # runs as a prebuild step
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR = "src/content/articles";
const MIN_RATIO = 1.3; // a 4:3 landscape passes; square and portrait do not

const problems = [];
let checked = 0;
for (const f of fs.readdirSync(DIR).filter((x) => /\.mdx?$/.test(x))) {
  const text = fs.readFileSync(path.join(DIR, f), "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  if (/^draft:\s*true\s*$/m.test(fm)) continue;
  const hero = fm.match(/^heroImage:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];
  if (!hero) continue;
  const file = path.resolve(DIR, hero);
  if (!fs.existsSync(file)) { problems.push(`${f}: hero file not found (${hero})`); continue; }
  const m = await sharp(file).metadata();
  // EXIF orientations 5-8 store the pixels on their side; the browser turns them.
  const turned = [5, 6, 7, 8].includes(m.orientation ?? 1);
  const w = turned ? m.height : m.width;
  const h = turned ? m.width : m.height;
  checked++;
  if (w / h < MIN_RATIO) problems.push(`${f}: hero ${path.basename(hero)} is ${w}x${h} (${(w / h).toFixed(2)}:1), needs ${MIN_RATIO}:1 or wider`);
}

if (problems.length) {
  console.error(`\nhero images: ${problems.length} problem(s). Article cards crop heroes to 16:9, so use a landscape photo.`);
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log(`hero images: ${checked} checked, all landscape`);
