// Reads the event feeds in data/db-feeds.json into the events table. Re-runnable:
// each event is keyed on its feed and the feed's own id, and every run refreshes
// last_checked on what it sees.
//
//   node scripts/db/read-feeds.mjs             # DATABASE_URL from env or work/.env
//   node scripts/db/read-feeds.mjs --dry-run   # print what would be written
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const config = JSON.parse(fs.readFileSync("data/db-feeds.json", "utf8"));

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b(?:,?\\s+(20\\d\\d))?`, "gi");
const BOOKING = /https?:\/\/[^"'\s<>]*(designmynight\.com|sevenrooms\.com|ticketmaster|dice\.fm|eventbrite|feverup|tickets\.)[^"'\s<>]*/i;

const text = (html) => (html ?? "")
  .replace(/<[^>]+>/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "-").replace(/&amp;/g, "&")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, " ").trim();

// Every date written in the text. A date with no year takes the first year that puts it on or after
// the post date, or 60 days ago if the post is older (sites reuse old posts for each year's run).
export function datesIn(body, publishedOn) {
  const floor = new Date(Date.now() - 60 * 86400000);
  let pub = new Date(publishedOn.slice(0, 10) + "T00:00:00Z");
  if (pub < floor) pub = new Date(floor.toISOString().slice(0, 10) + "T00:00:00Z");
  const out = new Set();
  for (const m of body.matchAll(DATE_RE)) {
    const day = Number(m[1]);
    const month = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)));
    if (day < 1 || day > 31 || month < 0) continue;
    let year = m[3] ? Number(m[3]) : pub.getUTCFullYear();
    let d = new Date(Date.UTC(year, month, day));
    if (!m[3] && d < pub) d = new Date(Date.UTC(year + 1, month, day));
    if (d.getUTCDate() !== day) continue; // 31 June and the like
    out.add(d.toISOString().slice(0, 10));
  }
  return [...out].sort();
}

const UA = { "user-agent": "Mozilla/5.0 (compatible; LondonTravelGeek/1.0)" };

// The post's own page, cut down to its main copy. Page builders often leave the API's content empty,
// and the copy region keeps sitewide widgets (an Instagram feed, a footer) out of the date search.
async function pageCopy(url, feed) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return { url, html: "" };
  const html = await res.text();
  const start = feed.copyStart ? html.indexOf(feed.copyStart) : -1;
  if (start < 0) return { url: res.url, html: "" };
  const end = feed.copyEnd ? html.indexOf(feed.copyEnd, start) : -1;
  return { url: res.url, html: html.slice(start, end > start ? end : start + 20000) };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { ...UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function readWordpress(feed) {
  const cats = feed.categories?.length ? `&categories=${feed.categories.join(",")}` : "";
  const posts = await getJson(`${feed.base}/wp-json/wp/v2/posts?per_page=100${cats}&_fields=id,date,modified,slug,link,title,content,categories`);
  const out = [];
  for (const p of posts.filter((p) => !(feed.skip ?? []).some((s) => p.slug.includes(s)))) {
      let html = p.content?.rendered ?? "";
      let url = p.link;
      if (!text(html)) ({ url, html } = await pageCopy(p.link, feed));
      const body = text(html);
      const name = text(p.title?.rendered);
      const dates = datesIn(body, p.date);
      // New Year's Eve pages often name only the year they welcome in.
      if (!dates.length && /new year'?s eve|\bnye\b/i.test(name)) dates.push(datesIn("31 December", p.date)[0]);
      // One date written as an opening ("arrives on", "from", "opens") starts a run with no end date.
      const opening = dates.length === 1 && /\b(from|arrives?|opens?|launch(es)?|starts?|begins?)\b[^.]{0,40}\d{1,2}(st|nd|rd|th)?\s+[a-z]{3}/i.test(body);
      out.push({
        venue_name: feed.venue, name, type: "event",
        starts_on: dates[0] ?? null, ends_on: opening ? null : dates.at(-1) ?? null, url, feed: feed.key,
        external_id: `${feed.key}:${p.id}`,
        attributes: JSON.stringify({ dates, booking: html.match(BOOKING)?.[0] ?? null,
          published: p.date, modified: p.modified, summary: body.slice(0, 400), evergreen: dates.length === 0, openEnded: opening }),
      });
  }
  return out;
}

const events = [];
for (const feed of config.feeds) {
  try {
    const rows = feed.type === "wordpress" ? await readWordpress(feed) : [];
    rows.forEach((r) => (r.placeSlug = feed.placeSlug));
    console.log(`${feed.key.padEnd(14)} ${rows.length} events`);
    events.push(...rows);
  } catch (e) {
    console.log(`${feed.key.padEnd(14)} FAILED ${e.message}`);
  }
}

if (DRY) {
  for (const e of events) console.log(`  ${e.starts_on ?? "(no date)"} to ${e.ends_on ?? ""}  ${e.name}  ${e.url}`);
} else {
  await write(events);
}

async function write(events) {
const client = await connect();
let written = 0;
for (const e of events) {
  await client.query(
    `insert into events (place_id, venue_name, name, type, starts_on, ends_on, url, feed, external_id, recommended, attributes, first_seen, last_checked)
     values ((select id from places where slug = $1), $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11, $11)
     on conflict (coalesce(feed, ''), external_id) where external_id is not null do update set
       name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on, url = excluded.url,
       attributes = excluded.attributes, place_id = coalesce(excluded.place_id, events.place_id), last_checked = excluded.last_checked`,
    [e.placeSlug, e.venue_name, e.name, e.type, e.starts_on, e.ends_on, e.url, e.feed, e.external_id, e.attributes, today]);
  written++;
}
console.log(`wrote ${written} events`);
await client.end();
}
