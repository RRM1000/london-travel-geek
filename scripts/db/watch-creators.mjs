// Watches the YouTube creators in the sources table for new videos and puts them in video_queue,
// flagged for London, sponsorship and the places they mention. Then, for reviews that link only to
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

const BACKFILL = process.argv.includes("--backfill");
const KEY = process.env.YOUTUBE_API_KEY;
if (BACKFILL && !KEY) throw new Error("--backfill needs YOUTUBE_API_KEY");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (compatible; LondonTravelGeek/1.0)", "accept-language": "en-GB" };

const norm = (t) => " " + (t ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim() + " ";
const SPONSOR = /\b(sponsored|paid partnership|paid promotion|includes paid|gifted|complimentary|invited (me|us)|hosted (me|us)|in (partnership|collaboration) with|thanks to [^.\n]{0,40} for (sponsoring|hosting|inviting|having)|use (my )?code|discount code|promo code|affiliate links?|press trip|pr trip)\b|#ad\b|\(ad\)|^ad\b|\[ad\]/gi;
const signals = (title, desc) => {
  const found = new Set([...`${title}\n${desc}`.matchAll(SPONSOR)].map((m) => m[0].toLowerCase().trim()));
  if (/\bAD\b/.test(title)) found.add("AD in title");
  return [...found];
};

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
const decode = (s) => (s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

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
const { rows: names } = await client.query("select id, name, recommended from watch_names");
const watch = names.map((n) => ({ ...n, n: norm(n.name) })).filter((n) => n.n.trim().length >= 4);
const { rows: areaRows } = await client.query("select distinct lower(x) a from (select area x from places where recommended union select borough from places where recommended) s where length(x) >= 5");
const LONDON = [" london ", ...areaRows.map((r) => norm(r.a))];

console.log(`${creators.length} YouTube creators, ${watch.length} place names to look for`);
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
    const t = norm(`${v.title} ${v.description}`);
    const mentioned = watch.filter((w) => t.includes(w.n)).map((w) => ({ id: w.id, name: w.name, recommended: w.recommended }));
    const sig = signals(v.title, v.description ?? "");
    return { ...v, t, mentioned, sig, london: LONDON.some((a) => t.includes(a)) || mentioned.some((m) => m.recommended) };
  });

  // Recent videos go to the queue. A backfill only queues the last 60 days, so old uploads
  // do not bury the new ones.
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  for (const v of rows.filter((v) => !BACKFILL || (v.published ?? "") >= since)) {
    const r = await client.query(
      `insert into video_queue (source_id, creator, platform, video_id, url, title, published_on, description, is_london, sponsored, sponsor_signals, places_mentioned, last_checked)
       values ($1, $2, 'youtube', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (platform, video_id) do update set title = excluded.title, description = excluded.description,
         is_london = excluded.is_london, sponsored = excluded.sponsored, sponsor_signals = excluded.sponsor_signals,
         places_mentioned = excluded.places_mentioned, last_checked = excluded.last_checked
       returning (xmax = 0) as inserted`,
      [c.id, c.name, v.id, `https://www.youtube.com/watch?v=${v.id}`, v.title, v.published, (v.description ?? "").slice(0, 2000),
       v.london, v.sig.length > 0, v.sig, JSON.stringify(v.mentioned), today]);
    if (r.rows[0].inserted) queued++;
  }

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
      [rv.id, `https://www.youtube.com/watch?v=${hit.id}`, hit.title, hit.published, hit.sig.length > 0, rv.url, JSON.stringify(hit.sig)]);
    relinked++;
  }
}
console.log(`queued ${queued} new videos, linked ${relinked} reviews to a specific video, ${failed} channels failed`);
const q = await client.query("select count(*)::int n from video_queue_new");
console.log(`waiting in video_queue_new: ${q.rows[0].n}`);
await client.end();
