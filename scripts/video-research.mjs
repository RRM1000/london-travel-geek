// Finds the evergreen London food videos that last30days cannot see, and pulls
// restaurant names + deep-link timestamps out of them.
//
// Why this exists: last30days is recency-bound, but the canonical London food
// videos are 1-4 years old and carry 100x the views. yt-dlp with no date filter
// finds them; chapters turn them into per-restaurant deep links.
//
// Chapters are the reliable source. Auto-caption transcripts are NOT - YouTube's
// speech model does not render restaurant proper nouns (verified: zero hits for
// "bancone", "lina", "popham" in a video that features all three). Descriptions
// are the fallback: they usually list the venues but carry no timestamps.
//
//   node scripts/video-research.mjs "best Italian restaurants London" [howMany]
//
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// yt-dlp emits UTF-8; without this Windows mangles "Bon Appétit" and "River Café".
process.stdout.setDefaultEncoding("utf8");
const EXEC_OPTS = { encoding: "utf8", maxBuffer: 1024 * 1024 * 32 };

const YTDLP =
  process.env.YTDLP_PATH ??
  "C:/Users/rober/AppData/Local/Programs/Python/Python312/Scripts/yt-dlp.exe";

const query = process.argv[2] ?? "best Italian restaurants London";
const count = Number(process.argv[3] ?? 8);

const FIELDS = ["id", "title", "channel", "upload_date", "view_count", "duration_string"];

async function search(q, n) {
  const { stdout } = await exec(
    YTDLP,
    [`ytsearch${n}:${q}`, "--skip-download", "--no-warnings",
     "--print", FIELDS.map((f) => `%(${f})s`).join("\t")],
    EXEC_OPTS,
  );
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const v = line.split("\t");
    return Object.fromEntries(FIELDS.map((f, i) => [f, v[i]]));
  });
}

async function description(id) {
  try {
    const { stdout } = await exec(
      YTDLP,
      [`https://www.youtube.com/watch?v=${id}`, "--skip-download", "--no-warnings",
       "--print", "%(description)s"],
      EXEC_OPTS,
    );
    return stdout;
  } catch {
    return "";
  }
}

async function chapters(id) {
  const { stdout } = await exec(
    YTDLP,
    [`https://www.youtube.com/watch?v=${id}`, "--skip-download", "--no-warnings",
     "--print", "%(chapters)s"],
    EXEC_OPTS,
  );
  const raw = stdout.trim();
  if (!raw || raw === "NA") return null;
  // yt-dlp prints Python repr; convert single quotes to JSON.
  try {
    return JSON.parse(raw.replace(/'/g, '"'));
  } catch {
    return null;
  }
}

// Chapter titles are often "Name, Neighbourhood" - but plenty of food videos
// chapter by PROCESS instead ("Breaking Down the Pig", "Menu Planning"), which
// would otherwise be written into the sheet as restaurants. Reject those.
const SKIP_EXACT =
  /^(intro|outro|conclusion|the ?verdict|verdict|ranking|results|recap|bonus|thanks|subscribe|start|welcome|final thoughts?)\b/i;

// Gerunds and process nouns: a restaurant name is a proper noun, not an activity.
const PROCESS =
  /\b(breaking|cooking|checking|planning|making|prepping|preparing|tasting|serving|research|briefing|service|development|behind the scenes|how to|q&a|recipe)\b/i;

// Food videos frequently chapter by DISH rather than by venue - a British
// query returned "Cornish pasties", "Sticky Toffee Pudding" and "Eaton Mess"
// alongside real restaurants. A dish is not a place, and these would otherwise
// be written into the sheet as venues.
const DISH =
  /^(cornish pasty|cornish pasties|pie and mash|fish and chips|fish ?& ?chips|sticky toffee|eaton mess|eton mess|shepherds? pie|cottage pie|bangers|full english|sunday roast|scotch egg|beef wellington|afternoon tea|bacon butty|the bacon butty|black pudding|toad in the hole|ploughman|welsh rarebit|jellied eels|beans on toast|crumpets?|scones?|trifle|banoffee|spotted dick|bubble and squeak|indian food|breakfast|brunch|lunch|dinner|dessert|drinks|pubs?|markets?)$/i;

// Descriptions are the fallback when a video has no chapters, and for some
// formats they are BETTER: food creators list "Places Visited" with full
// addresses, so a match arrives with a postcode already attached. Chapter-less
// taste-test videos ("we tried X") dominate some cuisines - every one of the
// top 8 London pizza videos lacked chapters while carrying 3.25m views between
// them - so without this the whole format is invisible.
//
// Two shapes are handled:
//   Breadstall - 92 Berwick St, W1F 0QB      name + address + postcode
//   Crisp - https://instagram.com/crisppizza  name only
const DESC_SKIP =
  /(subscribe|merch|discount|newsletter|autobiography|partnership|enquiries|business@|patreon|klook|amzn|linktr|^#|^https?:)/i;

// Social handles and calls to action sit in the same "Name - link" shape as a
// venue does, so they have to be rejected by name rather than by structure.
const NOT_A_VENUE =
  /^(tiktok|instagram|facebook|twitter|x|youtube|channel|watch|shop|follow|subscribe|website|newsletter|merch|links?|here|music|filmed|edited|camera|thanks|patreon|discount code|my |our |the .*map$|.*\b(map|link|here|guide)$)/i;

// "<Channel> on Facebook" is a social link wearing a proper-noun shape, so it
// passes the leading-capital test. Reject the pattern wherever it appears.
const SOCIAL_LINE = /\bon (facebook|instagram|twitter|tiktok|snapchat|youtube|x)\b/i;

// Some creators chapter by CATEGORY rather than by venue: "The Central One",
// "The Soho One", "The Best Value", "The Wildcard", "The Winner?". These read
// as names but identify nothing, so they cannot become rows.
const CATEGORY_CHAPTER =
  /^(the )?(central|soho|oldest|newest|best|worst|cheapest|priciest|winner|wildcard|favourite|favorite|runner.?up|underdog|dark horse|final|verdict|value)\b.*(one|value|pick|choice|\?)?$/i;

const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

function parseDescription(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    // yt-dlp occasionally emits a replacement char for curly apostrophes.
    const line = raw.replace(/�/g, "'").trim();
    if (!line || line.length > 160 || DESC_SKIP.test(line)) continue;

    // "Name - rest" or "Name: rest". Require a separator so prose is excluded.
    const m = /^([^-:|]{2,50}?)\s*[-:|]\s*(.+)$/.exec(line);
    if (!m) continue;

    // Strip list numbering ONLY when a real delimiter follows. A bare digit
    // prefix is often part of the name: "50 Kalo" must not become "Kalo".
    // Strip a trailing editorial label: "Molesey Fish Bar (Best Traditional)".
    const name = m[1]
      .replace(/^[#]?\d+\s*[.)]\s+/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const rest = m[2].trim();
    if (NOT_A_VENUE.test(name) || SOCIAL_LINE.test(name)) continue;
    // The right-hand side must look like an address or a link, not a sentence.
    const isAddress = POSTCODE.test(rest) || /\b(st|street|rd|road|lane|market|square|walk|arms)\b/i.test(rest);
    const isLink = /^https?:|instagram\.com|^@/i.test(rest);
    if (!isAddress && !isLink) continue;

    // A venue name is a proper noun: needs a capital and no trailing verb-y prose.
    if (!/[A-Z]/.test(name) || name.split(/\s+/).length > 5) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const pc = POSTCODE.exec(rest);
    out.push({ name, postcode: pc ? pc[0].toUpperCase() : null, detail: isAddress ? rest : "" });
  }
  return out;
}

function parseChapter(c) {
  let title = String(c.title ?? "").trim();
  if (!title) return null;

  // strip list numbering: "3. Bocca di Lupo", "#2 Padella", "1) Trullo"
  title = title.replace(/^[#\d]+\s*[.):-]\s*/, "").trim();

  if (SKIP_EXACT.test(title) || PROCESS.test(title) || DISH.test(title) || CATEGORY_CHAPTER.test(title)) return null;
  // a bare number or a single lowercase word is not a restaurant
  if (!/[A-Za-z]/.test(title) || /^[a-z\s]+$/.test(title)) return null;

  const [name, ...rest] = title.split(",");
  const clean = name.trim();
  if (clean.length < 2) return null;

  return { name: clean, hood: rest.join(",").trim(), start: c.start_time };
}

console.log(`query: "${query}"  (top ${count}, no date filter)\n`);

const videos = await search(query, count);
const found = new Map(); // restaurant -> {video, start, hood}

for (const v of videos) {
  const yr = v.upload_date?.slice(0, 4);
  const views = Number(v.view_count || 0).toLocaleString();
  console.log(`${yr}  ${views.padStart(10)} views  ${v.channel}`);
  console.log(`      ${v.title}`);

  const ch = await chapters(v.id);
  if (!ch) {
    const venues = parseDescription(await description(v.id));
    if (!venues.length) {
      console.log(`      chapters: none, description yielded nothing\n`);
      continue;
    }
    console.log(`      chapters: none -> ${venues.length} venue(s) from description`);
    for (const p of venues) {
      console.log(`        ${p.name}${p.postcode ? `  [${p.postcode}]` : ""}`);
      if (!found.has(p.name)) {
        found.set(p.name, {
          link: `https://youtu.be/${v.id}`,
          channel: v.channel, views: v.view_count,
          postcode: p.postcode, detail: p.detail, via: "description",
        });
      }
    }
    console.log("");
    continue;
  }
  const parsed = ch.map(parseChapter).filter(Boolean);
  if (!parsed.length) {
    console.log(`      chapters: ${ch.length}, none usable\n`);
    continue;
  }
  console.log(`      chapters: ${parsed.length} usable`);
  for (const p of parsed) {
    const link = `https://youtu.be/${v.id}?t=${p.start}`;
    const mm = String(Math.floor(p.start / 60)).padStart(2, "0");
    const ss = String(p.start % 60).padStart(2, "0");
    console.log(`        ${mm}:${ss}  ${p.name}${p.hood ? ` (${p.hood})` : ""}`);
    if (!found.has(p.name)) found.set(p.name, { link, channel: v.channel, views: v.view_count });
  }
  console.log("");
}

console.log(`\n=== ${found.size} venues found ===`);
for (const [name, d] of found) {
  const pc = d.postcode ? ` [${d.postcode}]` : "";
  console.log(`${name.padEnd(26)}${pc.padEnd(11)} ${d.via ?? "chapter"}  (${d.channel})`);
}

// Postcodes lift straight into the enrichment pipeline, so a description hit
// arrives already geocodable - no Places call needed to place it.
const withPc = [...found.values()].filter((d) => d.postcode).length;
if (withPc) console.log(`\n${withPc} of ${found.size} carry a postcode - geocodable for free`);
