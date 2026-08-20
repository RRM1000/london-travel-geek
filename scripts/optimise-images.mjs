// Resizes and re-encodes article images in place, and reports anything still
// oversized.
//
// WHY THIS MATTERS MORE THAN IT LOOKS
// Astro optimises images at BUILD time, so what the site serves is already
// fine. Git is the problem: it stores every original forever, and every
// replacement adds another permanent copy. The repo was carrying 149 MB across
// 68 images - averaging 2.2 MB, largest 8.1 MB - none of which is visible at
// any size the site renders.
//
//   node scripts/optimise-images.mjs              # dry run, reports only
//   node scripts/optimise-images.mjs --write      # actually rewrite files
//   node scripts/optimise-images.mjs --check      # build gate, exits non-zero
//
// --check runs as a prebuild step. It FAILS the build only on images big enough
// to be a mistake rather than a judgement call - over 2 MB, or wider than
// 3000px - because a hard gate that fires on borderline cases just gets
// disabled. Anything merely untidy is reported and lets the build through.
//
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

// Rewriting happens IN PLACE, so an original that git has never seen is gone
// for good. Untracked files are exactly the case that matters: they are the
// photos just dropped in, which are the ones with no backup anywhere.
// Refuse to touch them unless the caller says so explicitly.
function gitUntracked() {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", ROOT], { encoding: "utf8" });
    return new Set(
      out.split(/\r?\n/).filter(Boolean)
        .filter((l) => l.startsWith("??") || l.startsWith(" M") || l.startsWith("AM"))
        .map((l) => l.slice(3).trim().replace(/^"|"$/g, ""))
        .map((p) => p.replace(/\//g, path.sep)),
    );
  } catch {
    return null; // not a git repo - fall through, caller is on their own
  }
}

const ROOT = "src/assets/articles";
const WRITE = process.argv.includes("--write");
// 2000px wide covers every rendering size the site uses, including 2x retina
// on a full-width hero. Anything beyond that is bytes nobody sees.
const MAX_WIDTH = 2000;
const QUALITY = 82;
const WARN_BYTES = 600 * 1024;
const INCLUDE_UNSAVED = process.argv.includes("--include-uncommitted");
const CHECK = process.argv.includes("--check");
// Thresholds for the build gate. Deliberately well above the resize target:
// these catch an unprocessed camera original, not a stubborn photo.
const FAIL_BYTES = 2 * 1024 * 1024;
const FAIL_WIDTH = 3000;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

const all = walk(ROOT).filter((f) => /\.(jpe?g|png)$/i.test(f));

// A path is unsaved if git does not have a committed copy of it, or if it sits
// under an untracked directory.
const unsavedPrefixes = gitUntracked();
const isUnsaved = (f) => {
  if (!unsavedPrefixes) return false;
  const rel = path.relative(".", f);
  for (const u of unsavedPrefixes) {
    if (rel === u || rel.startsWith(u.endsWith(path.sep) ? u : u + path.sep)) return true;
  }
  return false;
};

const unsaved = all.filter(isUnsaved);
const files = INCLUDE_UNSAVED ? all : all.filter((f) => !isUnsaved(f));

// Not relevant to --check, which only reads.
if (unsaved.length && !INCLUDE_UNSAVED && !process.argv.includes("--check")) {
  console.log(`SKIPPING ${unsaved.length} image(s) git has no committed copy of.`);
  console.log(`Rewriting is in place, so these would be unrecoverable.`);
  console.log(`Commit them first, or pass --include-uncommitted to override.
`);
}
const mb = (b) => (b / 1048576).toFixed(2) + " MB";

// --check inspects EVERY image including uncommitted ones. It only reads, so
// the unrecoverable-overwrite risk that the skip guard exists for does not
// apply - and a new photo is exactly the one most likely to be a 8 MB original.
if (CHECK) {
  const offenders = [];
  for (const f of all) {
    const size = fs.statSync(f).size;
    let width = 0;
    try { width = (await sharp(f).metadata()).width ?? 0; } catch { continue; }
    if (size > FAIL_BYTES || width > FAIL_WIDTH) offenders.push({ f, size, width });
  }
  if (!offenders.length) {
    console.log(`images: ${all.length} checked, none oversized`);
    process.exit(0);
  }
  console.error(`\n${offenders.length} oversized image(s) - build stopped:\n`);
  for (const o of offenders) {
    console.error(`  ${mb(o.size)}  ${o.width}px  ${path.relative(ROOT, o.f)}`);
  }
  console.error(`\nLimits: ${FAIL_BYTES / 1048576} MB or ${FAIL_WIDTH}px wide.`);
  console.error(`Astro resizes these for serving, but git keeps every original`);
  console.error(`forever, so they are permanent repo weight.\n`);
  console.error(`Fix:  git add src/assets/articles`);
  console.error(`      node scripts/optimise-images.mjs --write --include-uncommitted\n`);
  process.exit(1);
}

let before = 0, after = 0, changed = 0;
const stillBig = [];

for (const f of files) {
  const size = fs.statSync(f).size;
  before += size;
  let img;
  try { img = sharp(f); } catch { console.log(`  unreadable: ${f}`); after += size; continue; }
  const meta = await img.metadata();

  const needsResize = meta.width > MAX_WIDTH;
  const needsRecompress = size > WARN_BYTES;
  if (!needsResize && !needsRecompress) { after += size; continue; }

  const pipeline = sharp(f).rotate();            // honour EXIF orientation
  if (needsResize) pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  const buf = await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();

  // Never write a file that got bigger.
  if (buf.length >= size) { after += size; continue; }

  console.log(
    `  ${mb(size)} -> ${mb(buf.length)}  (${Math.round((1 - buf.length / size) * 100)}% smaller)  ` +
    `${meta.width}px${needsResize ? ` -> ${MAX_WIDTH}px` : ""}  ${path.relative(ROOT, f)}`,
  );
  if (WRITE) fs.writeFileSync(f, buf);
  after += buf.length;
  changed++;
  if (buf.length > WARN_BYTES) stillBig.push([f, buf.length]);
}

console.log(`\n${files.length} image(s)`);
console.log(`  ${WRITE ? "rewritten" : "would rewrite"}: ${changed}`);
console.log(`  total ${mb(before)} -> ${mb(after)}  (saves ${mb(before - after)})`);
if (stillBig.length) {
  console.log(`\nstill over ${Math.round(WARN_BYTES / 1024)} KB after processing:`);
  stillBig.forEach(([f, b]) => console.log(`  ${mb(b)}  ${path.relative(ROOT, f)}`));
}
if (!WRITE && changed) console.log(`\nnothing written. re-run with --write to apply.`);
