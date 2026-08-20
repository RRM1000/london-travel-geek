// Adopts a chosen Commons candidate as an area guide's hero image.
//
// Downloads the full-resolution file, saves it into the guide's asset folder,
// and writes the frontmatter - including the attribution, built from the
// licence metadata Commons returned rather than typed by hand.
//
// Run find-images.mjs first to gather candidates, LOOK at them, then adopt the
// one you chose. The index is the position in the `usable` array.
//
//   node scripts/add-hero.mjs fitzrovia 0 "Alt text describing the photo"
//
import fs from "node:fs";
import path from "node:path";

const [guideArg, indexArg, altArg] = process.argv.slice(2);
if (!guideArg || indexArg === undefined) {
  console.error("usage: node scripts/add-hero.mjs <guide> <candidate-index> [alt text]");
  process.exit(1);
}

const guide = guideArg.replace(/-area-guide$/, "") + "-area-guide";
const candidates = JSON.parse(fs.readFileSync("data/image-candidates.json", "utf8"));
const entry = candidates[guide];
if (!entry) { console.error(`no candidates for ${guide} - run find-images.mjs first`); process.exit(1); }
const c = entry.usable[Number(indexArg)];
if (!c) { console.error(`no candidate ${indexArg} for ${guide} (${entry.usable.length} available)`); process.exit(1); }

const mdPath = `src/content/articles/${guide}.md`;
let md = fs.readFileSync(mdPath, "utf8");
if (/^heroImage:/m.test(md)) { console.error(`${guide} already has a hero image`); process.exit(1); }

// Filename from the Commons title, kept readable so the asset folder stays
// browsable rather than a wall of hashes.
const ext = path.extname(c.title).toLowerCase() || ".jpg";
const base = c.title.replace(/\.[^.]+$/, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const dir = `src/assets/articles/${guide}`;
const file = `${dir}/${base}${ext}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, attempt = 1) {
  const res = await fetch(url, { headers: { "user-agent": "london-travel-geek image research (contact via site)" } });
  if (res.status === 429 && attempt <= 5) {
    console.log(`   429, waiting ${5 * attempt}s`);
    await sleep(5000 * attempt);
    return get(url, attempt + 1);
  }
  return res;
}

const res = await get(c.file);
if (!res.ok) { console.error(`download failed: HTTP ${res.status}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(file, buf);
console.log(`saved ${file}  ${(buf.length / 1024 / 1024).toFixed(1)}MB  ${c.width}x${c.height}`);

// Attribution generated from the metadata, not typed. The licence URL is
// included because most CC licences require you to link to the licence.
const alt = altArg || c.description || `${entry.place}, London`;
const esc = (s) => String(s).replace(/"/g, "'");
const block = [
  `heroImage: ../../assets/articles/${guide}/${base}${ext}`,
  `heroImageAlt: "${esc(alt)}"`,
  `heroImageCredit: "${esc(c.author || "Unknown")}"`,
  `heroImageSource: ${c.page}`,
  `heroImageLicense: "${esc(c.licence)}"`,
  c.licenceUrl ? `heroImageLicenseUrl: ${c.licenceUrl}` : null,
].filter(Boolean).join("\n");

// A guide written before it had an image often already carries a placeholder
// heroImageAlt. Appending a second one produces a DUPLICATE YAML KEY, which
// parsers resolve silently and inconsistently - strip any existing image keys
// first so the block below is the only definition.
md = md.replace(/^heroImage(Alt|Credit|Source|License|LicenseUrl)?:.*\n/gm, "");

// Insert before the closing --- of the frontmatter.
const end = md.indexOf("\n---", 4);
if (end < 0) { console.error("could not find the end of the frontmatter"); process.exit(1); }
md = md.slice(0, end) + "\n" + block + md.slice(end);
fs.writeFileSync(mdPath, md);

console.log(`\n${guide} frontmatter updated:`);
console.log(block.split("\n").map((l) => "  " + l).join("\n"));
console.log(`\nCommons gives NO WARRANTY on copyright status. The licence above is what the`);
console.log(`uploader declared - if this image matters, check the file page: ${c.page}`);
