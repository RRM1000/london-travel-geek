// Finds London "best of" videos on YouTube for the kinds of place our sources cover least (music venues, bars,
// cafés, pubs) and records the places each video lists, from its chapter titles and description lines, as
// reviews from that channel. Free: yt-dlp, no API key. Sponsored, AI-made and non-London videos are skipped.
//
//   node scripts/db/youtube-lists.mjs                      # every search below, 15 videos each
//   node scripts/db/youtube-lists.mjs --per 5 --dry-run
//   node scripts/db/youtube-lists.mjs --only live-music
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connect } from "./lib.mjs";
import { nameIndex, match, textLines } from "./names.mjs";
import { sponsorSignals } from "./tagging.mjs";

const exec = promisify(execFile);
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const PER = Number(arg("--per") ?? 15);
const ONLY = arg("--only");
const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
// yt-dlp through Python on Rob's laptop: Windows blocks the unsigned yt-dlp.exe. YTDLP_PATH overrides it.
const [YTDLP, ...YTARGS] = process.env.YTDLP_PATH ? [process.env.YTDLP_PATH]
  : process.platform === "win32" ? ["C:/Users/rober/AppData/Local/Programs/Python/Python312/python.exe", "-m", "yt_dlp"] : ["yt-dlp"];
const AI_MADE = /\b(ai[- ]generated|made with ai|created with ai|ai voice(over)?)\b/i;
const OPTS = { encoding: "utf8", maxBuffer: 1024 * 1024 * 64, timeout: 120000 };

const SEARCHES = {
  "live-music": ["best live music venues London", "best small gig venues London", "best jazz bars London", "London grassroots music venues"],
  "bars": ["best cocktail bars London", "best bars in London", "London speakeasy bars", "best dive bars London"],
  "coffee": ["best coffee shops London", "best specialty coffee London", "best cafes in London"],
  "pubs": ["best pubs in London", "best historic pubs London"],
  "comedy": ["best comedy clubs London"],
  "nightlife": ["best clubs in London nightlife"],
};

async function search(q) {
  const { stdout } = await exec(YTDLP, [...YTARGS, `ytsearch${PER}:${q}`, "--flat-playlist", "--no-warnings", "--print", "%(id)s"], OPTS);
  return stdout.trim().split("\n").filter(Boolean);
}
async function video(id) {
  const { stdout } = await exec(YTDLP, [...YTARGS, `https://www.youtube.com/watch?v=${id}`, "-J", "--skip-download", "--no-warnings"], OPTS);
  return JSON.parse(stdout);
}

const client = await connect();
const index = await nameIndex(client);
const seen = new Set();
let videos = 0, used = 0, reviews = 0;
for (const [topic, queries] of Object.entries(SEARCHES)) {
  if (ONLY && ONLY !== topic) continue;
  for (const q of queries) {
    const ids = await search(q).catch((e) => { console.log(`search failed: ${q}: ${e.message}`); return []; });
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const v = await video(id).catch(() => null);
      if (!v) continue;
      videos++;
      const text = `${v.title}\n${v.description ?? ""}`;
      if (!/london/i.test(text)) continue;
      if (sponsorSignals(v.title, v.description).length) continue;
      if (AI_MADE.test(text)) continue; // AI-made list videos repeat other lists rather than visiting the places
      const places = match(index, textLines(v.description, (v.chapters ?? []).map((c) => c.title)));
      if (places.length < 2) continue; // a list names several places; one hit is more likely a passing mention
      used++;
      const published = v.upload_date ? `${v.upload_date.slice(0, 4)}-${v.upload_date.slice(4, 6)}-${v.upload_date.slice(6, 8)}` : null;
      if (DRY) { console.log(`${topic}: ${v.channel}: ${v.title} -> ${places.length} places`); continue; }
      await client.query("begin");
      const src = await client.query(
        `insert into sources (name, kind, tier, url, platforms, topics, last_checked)
         values ($1, 'youtube', 'D', $2, jsonb_build_object('youtube', $2::text), array[$3::text], $4)
         on conflict (name, kind) do update set last_checked = excluded.last_checked,
           topics = (select array(select distinct unnest(sources.topics || excluded.topics)))
         returning id, sources.excluded as is_excluded`, [v.channel, v.channel_url ?? `https://www.youtube.com/channel/${v.channel_id}`, topic, today]);
      if (src.rows[0].is_excluded) { await client.query("rollback"); continue; }
      for (const pid of places) {
        const r = await client.query(
          `insert into reviews (place_id, place_name, source_id, url, title, topic, published_on, recorded_on, last_checked, attributes)
           select $1, p.name, $2, $3, $4, $5, $6, $7, $7, '{"via": "youtube-lists"}'::jsonb from places p where p.id = $1
           on conflict do nothing returning id`,
          [pid, src.rows[0].id, `https://www.youtube.com/watch?v=${id}`, v.title, topic, published, today]);
        reviews += r.rowCount;
      }
      await client.query("commit");
    }
    console.log(`${q}: ${videos} videos read so far, ${used} used, ${reviews} new reviews`);
  }
}
console.log(`done: ${videos} videos read, ${used} listed 2+ of our places, ${reviews} new reviews`);
await client.end();
