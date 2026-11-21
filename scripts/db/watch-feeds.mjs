// Watches the publications and blogs in the sources table through their RSS or Atom feeds and puts
// new London articles in content_queue, tagged (opening, event, closing, deal, award, review),
// with sponsorship signals and the places they name. A feed URL found once is kept on the source.
//
//   node scripts/db/watch-feeds.mjs              # every source with a domain, not excluded
//   node scripts/db/watch-feeds.mjs --days 14    # only queue articles from the last 14 days (default 30)
import { connect } from "./lib.mjs";
import { decode, loadMatchers, queueRow, upsertQueue } from "./tagging.mjs";

const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 30;
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (compatible; LondonTravelGeek/1.0; +https://londontravelgeek.com)", accept: "text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8" };
const LONDON_SITE = /london|ldn|soho|hackney|shoreditch|peckham|islington|camden|brixton|hotdinners|timeout|standard\.co\.uk|thenudge|secretldn/i;

async function get(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: "follow" });
    return r.ok ? { url: r.url, text: await r.text(), type: r.headers.get("content-type") ?? "" } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
const isFeed = (r) => r && /<(rss|feed)[\s>]/i.test(r.text.slice(0, 3000));

async function findFeed(domain) {
  const home = await get(`https://${domain}/`);
  if (home) {
    const links = [...home.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
      .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean)
      .filter((h) => !/comments/i.test(h));
    for (const h of links) {
      const u = new URL(h, home.url).href;
      if (isFeed(await get(u))) return u;
    }
  }
  for (const p of ["/feed/", "/rss", "/feed.xml", "/rss.xml", "/atom.xml"]) {
    const u = `https://${domain}${p}`;
    if (isFeed(await get(u))) return u;
  }
  return null;
}

function items(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return blocks.map((b) => {
    const tag = (n) => b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`, "i"))?.[1];
    const link = tag("link")?.trim() || b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    const date = tag("pubDate") ?? tag("published") ?? tag("updated") ?? tag("dc:date");
    const d = date ? new Date(decode(date)) : null;
    return {
      title: decode(tag("title")), url: decode(link), id: decode(tag("guid") ?? tag("id") ?? link),
      published: d && !isNaN(d) ? d.toISOString().slice(0, 10) : null,
      body: decode(tag("description") ?? tag("summary") ?? tag("content:encoded") ?? tag("content")).slice(0, 3000),
    };
  }).filter((i) => i.url && i.title);
}

const client = await connect();
const m = await loadMatchers(client);
const { rows: sources } = await client.query(
  `select id, name, domain, attributes from sources where domain is not null and not excluded and kind in ('publication','blog')
   and not (coalesce(attributes->>'feedMissing', '') > to_char(current_date - 30, 'YYYY-MM-DD'))`);
console.log(`${sources.length} sites to check`);

let queued = 0, noFeed = 0, read = 0;
const queue = [...sources];
async function worker() {
  for (let s; (s = queue.shift()); ) {
    let feed = s.attributes?.feedUrl ?? (await findFeed(s.domain));
    if (!feed) {
      noFeed++;
      await client.query("update sources set attributes = attributes || jsonb_build_object('feedMissing', $2::text) where id = $1", [s.id, today]);
      continue;
    }
    if (!s.attributes?.feedUrl)
      await client.query("update sources set attributes = attributes || jsonb_build_object('feedUrl', $2::text) where id = $1", [s.id, feed]);
    const r = await get(feed);
    if (!isFeed(r)) continue;
    read++;
    await client.query("update sources set last_checked = $2 where id = $1", [s.id, today]);
    // Leave out auto-generated listing posts: anything dated after today (scheduled pages that
    // redirect until their day comes) and titles that repeat with only a date changed, such as
    // "Thursday Night in London: Thursday, 17 Dec 2026".
    const all = items(r.text);
    const pattern = (t) => (t ?? "").toLowerCase().replace(/\d+(st|nd|rd|th)?|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, "#").replace(/[^a-z#]+/g, " ").trim();
    const seen = new Map();
    for (const it of all) seen.set(pattern(it.title), (seen.get(pattern(it.title)) ?? 0) + 1);
    const templated = (it) => /#/.test(pattern(it.title)) && seen.get(pattern(it.title)) >= 3;
    for (const it of all.filter((i) => (i.published ?? today) >= since && (i.published ?? today) <= today && !templated(i))) {
      const row = queueRow({ platform: "rss", medium: "article", source_id: s.id, creator: s.name, item_id: it.id.slice(0, 500),
        url: it.url, title: it.title, published: it.published, body: it.body, londonSite: LONDON_SITE.test(`${s.domain} ${s.name}`) }, m, today);
      if (await upsertQueue(client, row)) queued++;
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`read ${read} feeds, ${noFeed} sites have no feed, queued ${queued} new articles`);
const q = await client.query("select tag, count(*)::int n from content_queue_new, unnest(tags) tag group by 1 order by 2 desc");
console.table(q.rows);
await client.end();
