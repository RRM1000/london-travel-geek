// Finds candidate hero images on Wikimedia Commons for articles that have none.
//
//   node scripts/find-hero-images.mjs --list                 what is missing a hero
//   node scripts/find-hero-images.mjs <slug> "search terms"  show candidates
//   node scripts/find-hero-images.mjs <slug> "terms" --take N  download candidate N
//
// Only permissively licensed files are offered. Attribution frontmatter is
// printed for whatever is taken, matching the pattern in best-pizza-london.md.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ARTICLES = "src/content/articles";
const ASSETS = "src/assets/articles";
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "london-travel-geek/1.0 (hero image sourcing; contact via repo)";

const OK_LICENCE =
  /^(cc0|cc[- ]by(?![- ]nc)|public domain|pd|no restrictions|attribution$)/i;

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

const strip = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * 2 ** i); // back off: 1.5s, 3s, 6s, 12s, 24s
      continue;
    }
    throw new Error(`Commons search failed: ${res.status}`);
  }
  throw new Error("Commons search failed: rate limited after retries");
}

async function search(terms) {
  const url =
    `${API}?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(terms)}` +
    `&gsrnamespace=6&gsrlimit=40` +
    `&prop=imageinfo&iiprop=url|size|extmetadata|mime`;
  const json = await getJson(url);
  const pages = Object.values(json?.query?.pages ?? {});

  return pages
    .map((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata ?? {};
      return {
        title: p.title.replace(/^File:/, ""),
        page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
        url: info.url,
        mime: info.mime,
        w: info.width,
        h: info.height,
        licence: strip(meta.LicenseShortName?.value),
        licenceUrl: strip(meta.LicenseUrl?.value),
        artist: strip(meta.Artist?.value),
        desc: strip(meta.ImageDescription?.value).slice(0, 160),
      };
    })
    .filter(Boolean)
    .filter((c) => /^image\/(jpeg|png|webp)$/.test(c.mime))
    .filter((c) => c.w >= 1200 && c.w / c.h >= 1.15) // landscape, print-ish width
    .filter((c) => OK_LICENCE.test(c.licence));
}

async function take(slug, cand) {
  const dir = path.join(ASSETS, slug);
  fs.mkdirSync(dir, { recursive: true });
  // Commons refuses thumb requests above a certain width for some files, so
  // take the ORIGINAL and resize locally. Strip the tracking query first.
  const src = cand.url.split("?")[0];
  let res;
  for (let i = 0; i < 6; i++) {
    res = await fetch(src, { headers: { "User-Agent": UA } });
    if (res.ok) break;
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    break;
  }
  if (!res?.ok) throw new Error(`download failed: ${res?.status} ${src}`);
  const ext = cand.mime === "image/png" ? "png" : cand.mime === "image/webp" ? "webp" : "jpg";
  const out = path.join(dir, `${slug}.${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 2000px matches the ceiling scripts/optimise-images.mjs enforces.
  await sharp(buf).rotate().resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(out.replace(/\.(png|webp)$/, ".jpg"));

  console.log(`saved ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  console.log("---frontmatter---");
  console.log(`heroImage: "../../assets/articles/${slug}/${slug}.jpg"`);
  console.log(`heroImageAlt: "TODO"`);
  console.log(`heroImageCredit: "${cand.artist || "Wikimedia Commons"}"`);
  console.log(`heroImageSource: "${cand.page}"`);
  console.log(`heroImageLicense: "${cand.licence}"`);
  if (cand.licenceUrl) console.log(`heroImageLicenseUrl: "${cand.licenceUrl}"`);
}

const args = process.argv.slice(2);

if (args[0] === "--batch") {
  const map = JSON.parse(fs.readFileSync(args[1] || "data/hero-search-terms.json", "utf8"));
  for (const [slug, terms] of Object.entries(map)) {
    let c = [];
    await sleep(700);
    try { c = await search(terms); } catch (e) { console.log(`## ${slug}  ERROR ${e.message}`); continue; }
    console.log(`## ${slug}   "${terms}"   (${c.length} ok)`);
    c.slice(0, 5).forEach((x, i) =>
      console.log(`   [${i}] ${String(x.w).padStart(5)}x${String(x.h).padEnd(5)} ${x.licence.padEnd(13)} ${x.title.slice(0,70)}`));
    if (!c.length) console.log("   -- none");
  }
} else if (args[0] === "--list") {
  const m = missingHeroes();
  console.log(m.join("\n"));
  console.log(`\n${m.length} without a hero`);
} else {
  const [slug, terms] = args;
  if (!slug || !terms) {
    console.error('usage: find-hero-images.mjs <slug> "search terms" [--take N]');
    process.exit(1);
  }
  const cands = await search(terms);
  const takeIdx = args.indexOf("--take");
  if (takeIdx !== -1) {
    const n = Number(args[takeIdx + 1]);
    const c = cands[n];
    if (!c) throw new Error(`no candidate ${n} (found ${cands.length})`);
    await take(slug, c);
  } else {
    cands.slice(0, 12).forEach((c, i) => {
      console.log(
        `[${i}] ${c.w}x${c.h}  ${c.licence.padEnd(14)}  ${c.title}\n     ${c.desc}`,
      );
    });
    if (!cands.length) console.log("no permissively licensed landscape candidates");
  }
}

// --batch: list top candidates for every slug in data/hero-search-terms.json
