// Watches the YouTube creators in the sources table for new videos and puts them in video_queue,
// flagged for London, sponsorship, topic tags and the places they mention. Shorts are included. Then, for reviews that link only to
// a creator's channel, finds the video that names the place and links that instead.
//
//   node scripts/db/watch-creators.mjs           # recent uploads (RSS: the last 15 per channel, no key)
//   YOUTUBE_API_KEY=... node scripts/db/watch-creators.mjs --backfill
//                                                # full upload lists through the YouTube Data API
//                                                # (about 1 quota unit per 50 videos; the free quota is 10,000 a day)
//
// TikTok and Instagram are not watched: neither offers a feed or API that works without an account
// review, and both block automated reading.
import { connect } from "./lib.mjs";
import { decode, norm, loadMatchers, queueRow, upsertQueue } from "./tagging.mjs";

const BACKFILL = process.argv.includes("--backfill");
const KEY = process.env.YOUTUBE_API_KEY;
if (BACKFILL && !KEY) throw new Error("--backfill needs YOUTUBE_API_KEY");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (compatible; LondonTravelGeek/1.0)", "accept-language": "en-GB" };


async function text(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url.replace(/key=[^&]+/, "key=…")}`);
  return r.json();
}

async function channelId(src) {
  if (src.attributes?.youtubeChannelId) return src.attributes.youtubeChannelId;
  const url = src.platforms.youtube;
  const m = url.match(/channel\/(UC[\w-]{22})/) ?? (await text(url)).match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/);
  return m?.[1] ?? null;
}

async function recentVideos(id) {
  const xml = await text(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([^<]+)/)?.[1], title: decode(e.match(/<title>([^<]*)/)?.[1]),
    short: /\/shorts\//.test(e.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? ""),
    published: e.match(/<published>([^<]+)/)?.[1]?.slice(0, 10), description: decode(e.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]),
  })).filter((v) => v.id);
}

async function allVideos(id, cap = 1000) {
  const out = [];
  let page = "";
  do {
    const r = await json(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=UU${id.slice(2)}&key=${KEY}${page ? `&pageToken=${page}` : ""}`);
    for (const it of r.items ?? []) out.push({ id: it.snippet.resourceId.videoId, title: it.snippet.title,
      published: it.snippet.publishedAt?.slice(0, 10), description: it.snippet.description });
    page = r.nextPageToken ?? "";
  } while (page && out.length < cap);
  return out;
}

const client = await connect();
const { rows: creators } = await client.query("select id, name, platforms, attributes from sources where platforms ? 'youtube'");
const m = await loadMatchers(client);
console.log(`${creators.length} YouTube creators`);
let queued = 0, relinked = 0, failed = 0;
for (const c of creators) {
  let videos;
  try {
    const id = await channelId(c);
    if (!id) throw new Error("no channel id");
    if (!c.attributes?.youtubeChannelId)
      await client.query("update sources set attributes = attributes || jsonb_build_object('youtubeChannelId', $2::text) where id = $1", [c.id, id]);
    videos = BACKFILL ? await allVideos(id) : await recentVideos(id);
  } catch (e) {
    failed++;
    console.log(`  ${c.name}: ${e.message}`);
    continue;
  }

  const rows = videos.map((v) => {
    const row = queueRow({ platform: "youtube", medium: v.short ? "short" : "video", source_id: c.id, creator: c.name, item_id: v.id,
      url: v.short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title, published: v.published, body: v.description ?? "" }, m, today);
    return { ...v, row, t: row._t, sig: row.sponsor_signals };
  });

  // Recent videos go to the queue. A backfill only queues the last 60 days, so old uploads
  // do not bury the new ones.
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  for (const v of rows.filter((v) => !BACKFILL || (v.published ?? "") >= since)) if (await upsertQueue(client, v.row)) queued++;

  // Reviews that link to this creator's channel: point each at the newest unsponsored video naming the place.
  const { rows: revs } = await client.query(
    "select id, place_name, url from reviews where source_id = $1 and url !~ '(watch\\?v=|/shorts/|youtu\\.be/)'", [c.id]);
  for (const rv of revs) {
    const n = norm(rv.place_name);
    if (n.trim().length < 4) continue;
    const hit = rows.filter((v) => v.t.includes(n)).sort((a, b) => (a.sig.length - b.sig.length) || (b.published ?? "").localeCompare(a.published ?? ""))[0];
    if (!hit) continue;
    await client.query(
      `update reviews set url = $2, title = $3, published_on = $4, paid = $5,
         attributes = attributes || jsonb_build_object('channelUrl', $6::text, 'sponsorSignals', $7::jsonb)
       where id = $1 and not exists (select 1 from reviews x where x.place_name = reviews.place_name and x.source_id = reviews.source_id and x.url = $2)`,
      [rv.id, hit.row.url, hit.title, hit.published, hit.sig.length > 0, rv.url, JSON.stringify(hit.sig)]);
    relinked++;
  }
}
console.log(`queued ${queued} new videos, linked ${relinked} reviews to a specific video, ${failed} channels failed`);
const q = await client.query("select count(*)::int n from content_queue_new where platform = 'youtube'");
console.log(`YouTube items waiting in content_queue_new: ${q.rows[0].n}`);
await client.end();
