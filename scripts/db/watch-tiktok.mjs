// Reads recent posts from the TikTok creators in the sources table through Apify's TikTok scraper
// and puts them in content_queue, tagged like the other watchers. Skips quietly without a token.
//
//   APIFY_TOKEN=... node scripts/db/watch-tiktok.mjs [--per-profile 10]
//
// Cost: Apify bills per post returned (check the actor's current price on its Apify page).
// 73 creators x 10 posts is 730 posts a run.
import { connect } from "./lib.mjs";
import { loadMatchers, queueRow, upsertQueue } from "./tagging.mjs";

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) { console.log("No APIFY_TOKEN; skipping TikTok."); process.exit(0); }
const per = Number(process.argv[process.argv.indexOf("--per-profile") + 1]) || 10;
const ACTOR = process.env.APIFY_TIKTOK_ACTOR ?? "clockworks~tiktok-scraper";
const today = new Date().toISOString().slice(0, 10);

const client = await connect();
const m = await loadMatchers(client);
const { rows: creators } = await client.query("select id, name, platforms->>'tiktok' url from sources where platforms ? 'tiktok'");
const handles = new Map();
for (const c of creators) {
  const h = c.url?.match(/tiktok\.com\/@([\w.\-]+)/i)?.[1];
  if (h) handles.set(h.toLowerCase(), c);
}
console.log(`${handles.size} TikTok creators`);

const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}&timeout=600`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ profiles: [...handles.keys()], resultsPerPage: per, shouldDownloadVideos: false,
    shouldDownloadCovers: false, shouldDownloadSubtitles: false, profileScrapeSections: ["videos"] }),
});
if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
const posts = await res.json();
console.log(`Apify returned ${posts.length} posts`);

let queued = 0;
for (const p of posts) {
  const handle = (p.authorMeta?.name ?? p["authorMeta.name"] ?? "").toLowerCase();
  const c = handles.get(handle);
  const text = p.text ?? "";
  const tagsText = (p.hashtags ?? []).map((h) => `#${h.name ?? h}`).join(" ");
  const row = queueRow({ platform: "tiktok", medium: "short", source_id: c?.id, creator: c?.name ?? handle, item_id: String(p.id),
    url: p.webVideoUrl ?? `https://www.tiktok.com/@${handle}/video/${p.id}`, title: text.slice(0, 200),
    published: (p.createTimeISO ?? "").slice(0, 10) || null, body: `${text} ${tagsText} ${p.locationMeta?.locationName ?? ""}` }, m, today);
  // TikTok marks paid partnerships itself; trust that over the text rules when present.
  if (p.isAd || p.isSponsored) { row.sponsored = true; row.sponsor_signals = [...row.sponsor_signals, "TikTok ad label"]; }
  if (await upsertQueue(client, row)) queued++;
}
console.log(`queued ${queued} new TikTok posts`);
await client.end();
