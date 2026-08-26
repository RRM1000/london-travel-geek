// Adds hero frontmatter to an article that has none.
//   node scripts/set-hero.mjs <slug> <imagePathUnderAssets> "<alt>" [credit source licence licenceUrl]
// Own photography takes image + alt only; anything sourced carries the credit
// block, matching how the existing guides are written.
import fs from "node:fs";

const [slug, img, alt, credit, source, licence, licenceUrl] = process.argv.slice(2);
const file = `src/content/articles/${slug}.md`;
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
const nl = crlf ? "\r\n" : "\n";

if (/^heroImage:/m.test(raw)) {
  console.log(`skip   ${slug} already has a hero`);
  process.exit(0);
}

const lines = [
  `heroImage: "../../assets/articles/${img}"`,
  `heroImageAlt: "${alt.replace(/"/g, "'")}"`,
];
if (credit) lines.push(`heroImageCredit: "${credit}"`);
if (source) lines.push(`heroImageSource: "${source}"`);
if (licence) lines.push(`heroImageLicense: "${licence}"`);
if (licenceUrl) lines.push(`heroImageLicenseUrl: "${licenceUrl}"`);

// Slot it straight after the description, where every other guide keeps it.
const anchor = raw.match(/^description: .*$/m);
if (!anchor) throw new Error(`${slug}: no description line to anchor to`);
const at = anchor.index + anchor[0].length;
fs.writeFileSync(file, raw.slice(0, at) + nl + lines.join(nl) + raw.slice(at));
console.log(`hero   ${slug}  ->  ${img}`);
