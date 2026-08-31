// Fails when the Eat in London hub has fallen behind the rest of the site.
//
//   node scripts/audit-food-hub.mjs
//
// WHY THIS EXISTS
// The hub was written in July with five cuisines marked "(Coming Soon)". All
// five shipped within the month and nothing told anyone. By the end of August
// it linked one of thirty-one food guides and still advertised the other
// thirty as unwritten - the single worst internal-linking hole on the site,
// and invisible because no script read it.
//
// A hub is only a hub while it links everything. This makes that checkable.
import fs from "node:fs";
import path from "node:path";

const DIR = "src/content/articles";
const HUB = "eat-in-london-guide";

// A guide counts as a food guide if its front matter files it under food and
// drink. Deriving it from the category rather than from a hand-kept list is
// the whole point: a new guide joins the check by existing.
const FOOD_CATEGORY = /^category:\s*"?Food and drink"?\s*$/m;

// Guides that deliberately do not belong on an eating hub.
const EXEMPT = new Set([HUB]);

const slugs = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));

const hubPath = path.join(DIR, `${HUB}.md`);
if (!fs.existsSync(hubPath)) {
  console.error(`no hub at ${hubPath}`);
  process.exit(1);
}
const hub = fs.readFileSync(hubPath, "utf8");

const food = [];
for (const slug of slugs) {
  if (EXEMPT.has(slug)) continue;
  const text = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
  if (!FOOD_CATEGORY.test(text)) continue;
  if (/^draft:\s*true\s*$/m.test(text)) continue;
  food.push(slug);
}

const missing = food.filter((s) => !hub.includes(`/articles/${s}/`));

// The other half: the hub must not promise pages that do not exist, and must
// not still be calling shipped guides "coming soon".
const promised = [...hub.matchAll(/\(Coming Soon\)|\bComing soon\b/gi)].length;
const broken = [...hub.matchAll(/\]\(\/articles\/([a-z0-9-]+)\/\)/g)]
  .map((m) => m[1])
  .filter((s, i, a) => a.indexOf(s) === i)
  .filter((s) => !slugs.includes(s));

let bad = 0;
if (missing.length) {
  bad += missing.length;
  console.log(`${missing.length} food guide(s) NOT linked from the hub:`);
  for (const s of missing) console.log(`   /articles/${s}/`);
}
if (broken.length) {
  bad += broken.length;
  console.log(`\n${broken.length} link(s) in the hub point at no article:`);
  for (const s of broken) console.log(`   /articles/${s}/`);
}
if (promised) {
  bad += promised;
  console.log(`\n${promised} "coming soon" marker(s) left in the hub.`);
  console.log('   Either the page shipped, or say plainly what is still to write.');
}

if (!bad) console.log(`hub links all ${food.length} food guides, no dead links, nothing promised`);
process.exit(bad ? 1 : 0);
