// Finds candidate hero images on Wikimedia Commons for area guides that have none.
//
// WHY COMMONS AND NOT UNSPLASH OR PEXELS
// Checked against all three sets of terms on 2026-08-18:
//   Commons  - DOWNLOAD is the documented route, hotlinking "not recommended".
//              Free, no key. Attribution per each file's own licence.
//   Unsplash - API guidelines require attribution AND a download-tracking ping
//              AND hotlinking their CDN for view tracking. That last one is
//              incompatible with this build, which optimises heroes locally.
//              Production is 1,000 req/hour, not 5,000.
//   Pexels   - attribution mandatory (a Pexels link AND a photographer credit),
//              and the docs are SILENT on downloading and self-hosting, so the
//              thing we need to do is not written down as permitted.
// All three require attribution, so Commons' one advantage - self-hosting -
// decides it.
//
// THIS SCRIPT DOES NOT CHOOSE. It gathers candidates and their licence data and
// writes a shortlist for a human to pick from. Auto-selecting the top hit gets
// you a photo of the wrong Greenwich, or a picture captioned "London" that is
// actually Westminster. The machine fetches; the person decides.
//
//   node scripts/find-images.mjs                 # every guide with no hero
//   node scripts/find-images.mjs soho fitzrovia  # named guides only
//   node scripts/find-images.mjs chelsea --term "Royal Hospital Chelsea"
//                                                # search a landmark instead
//
import fs from "node:fs";

const API = "https://commons.wikimedia.org/w/api.php";
const OUT = "data/image-candidates.json";
const DIR = "src/content/articles";
const UA = { "user-agent": "london-travel-geek image research (contact via site)" };

// Commons asks for a descriptive user agent and reasonable pacing. There is no
// hard rate limit but hammering it is both rude and a good way to get blocked.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Licences we can actually use. Anything else - non-commercial, no-derivatives,
// or unclear - is reported but never shortlisted.
const USABLE = /^(CC BY|CC BY-SA|CC0|Public domain|PD)/i;
// Files that are not photographs of a place.
const NOT_A_PHOTO = /\.(svg|ogg|ogv|webm|pdf|tif|tiff)$/i;
const JUNK_TITLE = /\b(map|diagram|logo|coat of arms|flag|chart|plan of|blue plaque|sign|graph|seal)\b/i;

// Commons returns 429 readily. A 300ms gap was enough to get blocked after five
// guides on the first run, so pace properly and back off rather than losing the
// rest of the batch - 429 is retryable, unlike a 403.
async function search(term, limit = 12, attempt = 1) {
  const url = `${API}?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=${limit}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 429 && attempt <= 4) {
    const wait = 2000 * attempt;
    console.log(`   rate limited, waiting ${wait / 1000}s (attempt ${attempt})`);
    await sleep(wait);
    return search(term, limit, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Object.values(json?.query?.pages ?? {});
}

const text = (v) => String(v?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function candidate(page) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const licence = text(meta.LicenseShortName);
  const author = text(meta.Artist);
  const title = page.title.replace(/^File:/, "");

  return {
    title,
    licence,
    licenceUrl: text(meta.LicenseUrl),
    author,
    description: text(meta.ImageDescription).slice(0, 180),
    width: info.width,
    height: info.height,
    file: info.url,
    preview: info.thumburl,
    page: info.descriptionurl,
    // Everything the article frontmatter needs, pre-built.
    frontmatter: {
      heroImageCredit: author || "Unknown",
      heroImageSource: info.descriptionurl,
      heroImageLicense: licence,
      heroImageLicenseUrl: text(meta.LicenseUrl),
    },
    usable:
      USABLE.test(licence) &&
      !NOT_A_PHOTO.test(title) &&
      !JUNK_TITLE.test(title) &&
      info.width >= 1200 &&
      info.width > info.height,          // heroes are landscape
  };
}

// --------------------------------------------------------------------------
// --term lets you search by LANDMARK rather than by area name. Needed whenever
// the area's own name does not reach the area on Commons: "Chelsea London"
// returns residential side streets and, via the High Street term, KENSINGTON
// High Street - a neighbouring area that would have been adopted as Chelsea's
// hero if nobody had looked. Searching "Royal Hospital Chelsea" instead asks
// for a thing that only exists in Chelsea.
const argv = process.argv.slice(2);
const termFlags = [];
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--term") termFlags.push(argv[++i]);
  else rest.push(argv[i]);
}
const wanted = rest.map((s) => s.replace(/-area-guide$/, ""));
const guides = fs.readdirSync(DIR)
  .filter((f) => f.endsWith("-area-guide.md"))
  .map((f) => f.replace(/\.md$/, ""))
  .filter((g) => {
    const body = fs.readFileSync(`${DIR}/${g}.md`, "utf8");
    if (/^heroImage:/m.test(body)) return false;
    return wanted.length === 0 || wanted.includes(g.replace(/-area-guide$/, ""));
  });

if (!guides.length) { console.log("every requested guide already has a hero image"); process.exit(0); }
console.log(`${guides.length} guide(s) with no hero image\n`);

// MERGE, do not overwrite. Running for a subset of guides used to wipe the
// candidates gathered for all the others, which is exactly what happened when
// the first batch hit a 429 and had to be re-run in two halves.
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
for (const guide of guides) {
  const place = guide.replace(/-area-guide$/, "").replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Three queries per guide.
  //
  // The third exists because "Marylebone London" returned EIGHTEEN photographs
  // of Marylebone railway station and nothing else - the station carries the
  // district's name and dominates Commons, so the bare place name never reaches
  // the district itself. Any area sharing its name with a station has the same
  // problem: Victoria, Paddington, Angel, Richmond, Greenwich.
  const terms = termFlags.length ? termFlags : [
    `${place} London`,
    `${place} London street`,
    `${place} High Street London -station`,
  ];
  const seen = new Set();
  const found = [];
  for (const term of terms) {
    try {
      for (const page of await search(term)) {
        const c = candidate(page);
        if (!c || seen.has(c.title)) continue;
        seen.add(c.title);
        found.push({ ...c, foundBy: term });
      }
    } catch (e) {
      console.log(`  ${place}: search failed - ${e.message}`);
    }
    await sleep(1500);
  }

  const usable = found.filter((c) => c.usable);
  const rejected = found.filter((c) => !c.usable);
  out[guide] = { place, usable, rejectedCount: rejected.length };

  console.log(`${place.padEnd(18)} ${String(usable.length).padStart(2)} usable / ${found.length} found`);
  for (const c of usable.slice(0, 4))
    console.log(`   ${c.licence.padEnd(12)} ${c.title.slice(0, 62)}`);
  if (!usable.length && found.length)
    console.log(`   nothing usable - all ${found.length} were the wrong shape, too small, or a non-commercial licence`);
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\ncandidates written to ${OUT}`);
console.log("PICK BY HAND. Commons gives no warranty on copyright status, and a");
console.log("plausible-looking file can still be mislabelled or the wrong place.");
