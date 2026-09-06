// Write the looked-up Hotels.com urls into scripts/write-hotels.mjs.
//
// SKIPS ANYTHING MARKED needsCheck. Those have two candidate listings, a
// rebrand, or a name that may not be the hotel we mean - and a link that works
// but lands on the wrong property is the exact failure this whole column was
// added to avoid: it looks fine from our side forever.
//
//   node scripts/apply-hotels-com-urls.mjs            # report only
//   node scripts/apply-hotels-com-urls.mjs --write
import fs from "node:fs";

const P = "scripts/write-hotels.mjs";
const src = fs.readFileSync(P, "utf8");
const found = JSON.parse(fs.readFileSync("data/hotels-com-urls.json", "utf8"));

const sheetSlugs = new Set([...src.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));

const ready = [];
const held = [];
const unknown = [];
for (const [slug, v] of Object.entries(found)) {
  if (slug.startsWith("_")) continue;
  if (!sheetSlugs.has(slug)) { unknown.push(slug); continue; }
  (v.needsCheck ? held : ready).push([slug, v.url]);
}

console.log(`${ready.length} ready, ${held.length} held for checking, ${unknown.length} slug(s) not on the sheet`);
if (unknown.length) console.log("\nNOT ON THE SHEET (our slug is different - fix the key, not the sheet):\n  " + unknown.join("\n  "));
if (held.length) console.log("\nHELD:\n  " + held.map(([s]) => `${s} - ${found[s].needsCheck.slice(0, 90)}`).join("\n  "));

if (!process.argv.includes("--write")) {
  console.log("\nreport only - pass --write to apply");
  process.exit(0);
}

let out = src;
let done = 0;
for (const [slug, url] of ready) {
  // Anchor on the row's own slug and insert after its website line, so the
  // column lands inside the right object however the rows are ordered.
  const re = new RegExp(`(slug: "${slug}"[\\s\\S]{0,2000}?website: "[^"]*",)`);
  if (!re.test(out)) { console.log(`  no website anchor for ${slug} - skipped`); continue; }
  if (new RegExp(`slug: "${slug}"[\\s\\S]{0,2000}?hotelsUrl:`).test(out)) continue;
  out = out.replace(re, `$1\n    hotelsUrl: "${url}",`);
  done++;
}
fs.writeFileSync(P, out);
console.log(`\nwrote ${done} url(s) into ${P}`);
