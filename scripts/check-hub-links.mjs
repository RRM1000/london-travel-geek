// Every page in a family must be linked from the hub that family belongs to.
//
// audit-links.mjs catches orphans - a page nothing links to - but a page linked
// from ONE place passes it. That is how twelve new stay guides went live while
// best-areas-to-stay-in-london was missing five of them and each area guide's
// "where to stay" section still pointed nowhere (Rob, 26 Sep 2026: "you are
// missing very obvious links"). This checks the links a reader expects:
//
//   where-to-stay-<area>  <-  best-areas-to-stay-in-london
//   where-to-stay-<area>  <-> <area>-area-guide (both directions)
//   every Food and drink guide  <-  eat-in-london-guide
//   every Day trips guide       <-  day-trips-from-london
//
// /stay/'s area table computes its hotel-guide links (see src/pages/stay.astro),
// so it needs no rule here.
//
//   node scripts/check-hub-links.mjs
import fs from "node:fs";

const D = "src/content/articles/";
const read = (slug) => (fs.existsSync(`${D}${slug}.md`) ? fs.readFileSync(`${D}${slug}.md`, "utf8") : null);
const links = (text, slug) => text != null && text.includes(`/articles/${slug}/`);

const pages = fs.readdirSync(D).filter((f) => f.endsWith(".md")).map((f) => {
  const slug = f.replace(/\.md$/, "");
  const text = fs.readFileSync(D + f, "utf8");
  return {
    slug,
    text,
    draft: /^draft: true/m.test(text),
    london: /^sites: \[[^\]]*london/m.test(text),
    category: (text.match(/^category: "([^"]*)"/m) || [])[1],
  };
}).filter((p) => !p.draft && p.london);

// A stay guide's area guide, where the names differ.
const AREA_FOR = { "where-to-stay-soho-west-end": "soho-area-guide" };

const errors = [];
const hub = (hubSlug, members) => {
  const text = read(hubSlug);
  if (text == null) return errors.push(`hub ${hubSlug} does not exist`);
  for (const p of members) if (p.slug !== hubSlug && !links(text, p.slug)) errors.push(`${hubSlug} does not link ${p.slug}`);
};

const stay = pages.filter((p) => /^where-to-stay-/.test(p.slug));
hub("best-areas-to-stay-in-london", stay);
for (const p of stay) {
  const area = AREA_FOR[p.slug] ?? `${p.slug.replace(/^where-to-stay-/, "")}-area-guide`;
  const areaText = read(area);
  if (areaText == null) continue; // venue guides (near-the-o2, near-wembley-stadium) have no area guide
  if (!links(areaText, p.slug)) errors.push(`${area} does not link ${p.slug}`);
  if (!links(p.text, area)) errors.push(`${p.slug} does not link ${area}`);
}
hub("eat-in-london-guide", pages.filter((p) => p.category === "Food and drink"));
hub("day-trips-from-london", pages.filter((p) => p.category === "Day trips"));

if (errors.length) {
  console.error(`check-hub-links: ${errors.length} missing link(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("check-hub-links: clean");
