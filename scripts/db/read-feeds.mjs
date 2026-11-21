// Reads the event feeds in data/db-feeds.json into the events table. Re-runnable:
// each event is keyed on its feed and the feed's own id, and every run refreshes
// last_checked on what it sees.
//
//   node scripts/db/read-feeds.mjs             # DATABASE_URL from env or work/.env
//   node scripts/db/read-feeds.mjs --dry-run   # print what would be written
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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

// Every date written in the text. A date with no year takes the first year that puts it on or after the post date.
export function datesIn(body, publishedOn) {
  const pub = new Date(publishedOn.slice(0, 10) + "T00:00:00Z");
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

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; LondonTravelGeek/1.0)", accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function readWordpress(feed) {
  const cats = feed.categories?.length ? `&categories=${feed.categories.join(",")}` : "";
  const posts = await getJson(`${feed.base}/wp-json/wp/v2/posts?per_page=100${cats}&_fields=id,date,modified,slug,link,title,content,categories`);
  return posts
    .filter((p) => !(feed.skip ?? []).some((s) => p.slug.includes(s)))
    .map((p) => {
      const body = text(p.content?.rendered);
      const dates = datesIn(body, p.date);
      const upcoming = dates.filter((d) => d >= today);
      return {
        venue_name: feed.venue, name: text(p.title?.rendered), type: "event",
        starts_on: upcoming[0] ?? null, ends_on: upcoming.at(-1) ?? null, url: p.link, feed: feed.key,
        external_id: `${feed.key}:${p.id}`,
        attributes: JSON.stringify({ dates, booking: p.content?.rendered?.match(BOOKING)?.[0] ?? null,
          published: p.date, modified: p.modified, summary: body.slice(0, 400), evergreen: dates.length === 0 }),
      };
    });
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
  for (const e of events) console.log(`  ${e.starts_on ?? "(no date)"} to ${e.ends_on ?? ""}  ${e.name}`);
  process.exit(0);
}

const require = createRequire(path.resolve("work", "noop.js"));
const pg = require("pg");
if (!process.env.DATABASE_URL && fs.existsSync(path.join("work", ".env"))) {
  const m = fs.readFileSync(path.join("work", ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL, or put DATABASE_URL=... in work/.env");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });
await client.connect();
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
