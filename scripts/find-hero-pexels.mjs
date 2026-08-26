// Finds candidate hero images on Pexels for articles that have none.
//
//   node scripts/find-hero-pexels.mjs --list                    what is missing a hero
//   node scripts/find-hero-pexels.mjs <slug> "search terms"     show candidates
//   node scripts/find-hero-pexels.mjs <slug> "terms" --take N   download candidate N
//   node scripts/find-hero-pexels.mjs --batch [terms.json]      candidates for every slug
//
// WHY PEXELS AS WELL AS COMMONS
// Wikimedia Commons is unbeatable for London PLACES - it has Billingsgate,
// Smithfield, Kenwood, the Ritz Palm Court. It is poor at food and interiors:
// searches for "bistro" or "sushi counter" return Louisiana and San Carlos.
// Pexels is the reverse. Use Commons for a named London building, Pexels for a
// plate of food or the inside of a bar.
//
// LICENCE
// Everything on Pexels is under the Pexels License: free for commercial use,
// no attribution legally required. We credit the photographer anyway, because
// every other hero on this site carries a credit and an uncredited one would
// look like an oversight rather than a licence difference.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ARTICLES = "src/content/articles";
const ASSETS = "src/assets/articles";
const API = "https://api.pexels.com/v1/search";

// Load .env.local so the key never has to be typed on the command line.
for (const envFile of [".env.local", ".env"]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

const KEY = process.env.PEXELS_API_KEY;

function frontmatter(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : "";
}

function missingHeroes() {
  return fs
    .readdirSync(ARTICLES)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !/^heroImage:/m.test(frontmatter(path.join(ARTICLES, f))))
    .map((f) => f.replace(/\.md$/, ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(terms) {
  if (!KEY) {
    throw new Error(
      "PEXELS_API_KEY is not set. Add it to .env.local:\n" +
        "  PEXELS_API_KEY=your-key-here\n" +
        "Get a free key at https://www.pexels.com/api/",
    );
  }
  const url =
    `${API}?query=${encodeURIComponent(terms)}` +
    `&per_page=20&orientation=landscape&size=large`;

  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { Authorization: KEY } });
    if (res.ok) {
      const json = await res.json();
      return (json.photos ?? [])
        .map((p) => ({
          id: p.id,
          page: p.url,
          url: p.src?.original,
          w: p.width,
          h: p.height,
          photographer: p.photographer,
          photographerUrl: p.photographer_url,
          alt: (p.alt ?? "").trim(),
        }))
        .filter((c) => c.url && c.w >= 1600 && c.w / c.h >= 1.3);
    }
    if (res.status === 401) throw new Error("Pexels rejected the key (401). Check PEXELS_API_KEY.");
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * 2 ** i); continue; }
    throw new Error(`Pexels search failed: ${res.status}`);
  }
  throw new Error("Pexels search failed: rate limited after retries");
}

async function take(slug, cand) {
  const dir = path.join(ASSETS, slug);
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(cand.url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const out = path.join(dir, `${slug}.jpg`);
  // 2000px matches the ceiling scripts/optimise-images.mjs enforces.
  await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out);

  console.log(`saved ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  console.log("---frontmatter---");
  console.log(`heroImage: "../../assets/articles/${slug}/${slug}.jpg"`);
  console.log(`heroImageAlt: "${cand.alt || "TODO"}"`);
  console.log(`heroImageCredit: "${cand.photographer}"`);
  console.log(`heroImageSource: "${cand.page}"`);
  console.log(`heroImageLicense: "Pexels License"`);
  console.log(`heroImageLicenseUrl: "https://www.pexels.com/license/"`);
}

const args = process.argv.slice(2);

if (args[0] === "--list") {
  const m = missingHeroes();
  console.log(m.join("\n"));
  console.log(`\n${m.length} without a hero`);
} else if (args[0] === "--batch") {
  const map = JSON.parse(fs.readFileSync(args[1] || "data/hero-search-terms.json", "utf8"));
  const missing = new Set(missingHeroes());
  for (const [slug, terms] of Object.entries(map)) {
    if (!missing.has(slug)) continue; // never re-fetch one that already has a hero
    await sleep(400);
    let c = [];
    try { c = await search(terms); } catch (e) { console.log(`## ${slug}  ERROR ${e.message}`); continue; }
    console.log(`## ${slug}   "${terms}"   (${c.length} ok)`);
    c.slice(0, 5).forEach((x, i) =>
      console.log(`   [${i}] ${String(x.w).padStart(5)}x${String(x.h).padEnd(5)} ${x.photographer.padEnd(22).slice(0,22)} ${x.alt.slice(0, 60)}`));
    if (!c.length) console.log("   -- none");
  }
} else {
  const [slug, terms] = args;
  if (!slug || !terms) {
    console.error('usage: find-hero-pexels.mjs <slug> "search terms" [--take N]');
    process.exit(1);
  }
  const cands = await search(terms);
  const takeIdx = args.indexOf("--take");
  if (takeIdx !== -1) {
    const c = cands[Number(args[takeIdx + 1])];
    if (!c) throw new Error(`no candidate ${args[takeIdx + 1]} (found ${cands.length})`);
    await take(slug, c);
  } else {
    cands.slice(0, 12).forEach((c, i) =>
      console.log(`[${i}] ${c.w}x${c.h}  ${c.photographer}\n     ${c.alt}\n     ${c.page}`));
    if (!cands.length) console.log("no landscape candidates at that size");
  }
}
