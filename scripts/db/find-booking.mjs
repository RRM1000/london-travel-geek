// Finds booking links and price bands for restaurants, pubs, bars and cafés from their own websites, for free.
//
//   node scripts/db/find-booking.mjs                 # recommended and reviewed places with a website
//   node scripts/db/find-booking.mjs --max 20 --dry-run
//
// For each place it reads the homepage and up to two of its own pages whose link says book or reserve, and takes
//   * the first link to a booking platform (OpenTable, SevenRooms, Resy, Tock, ResDiary, DesignMyNight,
//     TheFork, Quandoo, Tablein, Dojo, Eat App) as booking_url, with any date, time or party size stripped;
//     otherwise the venue's own booking page when the page has a booking form;
//   * schema.org priceRange as price_band when it is written in £ signs, or as a spend per head
//     (under £25 £, under £50 ££, under £90 £££, else ££££).
// It never overwrites a booking link or price that is already set (the Sheet's own come first).
// Each find is recorded in attributes.bookingFrom / priceFrom = 'website'; tried places are skipped for 30 days.
import { connect } from "./lib.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const MAX = Number(arg("--max") ?? 3000);
const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

const PLATFORMS = [
  ["opentable", /opentable\.(co\.uk|com|ie)/i],
  ["sevenrooms", /sevenrooms\.com/i],
  ["resy", /resy\.com/i],
  ["tock", /exploretock\.com/i],
  ["resdiary", /resdiary\.com/i],
  ["designmynight", /designmynight\.com/i],
  ["thefork", /thefork\.co\.uk|lafourchette/i],
  ["quandoo", /quandoo\.co\.uk/i],
  ["tablein", /tablein\.com/i],
  ["dojo", /(bookings\.)?dojo\.(tech|app)|collinsbookings\.com/i],
  ["eat app", /eatapp\.co/i],
];
const STRIP = /^(date|time|covers|party_?size|partysize|seats|datetime|day|start_?date|dateTime)$/i;

function cleanBooking(href) {
  try {
    const u = new URL(href);
    for (const k of [...u.searchParams.keys()]) if (STRIP.test(k) || /^utm_/i.test(k)) u.searchParams.delete(k);
    return u.href;
  } catch { return null; }
}

function band(range) {
  if (!range) return null;
  const s = String(range).trim();
  const signs = s.match(/^(£{1,4})$/);
  if (signs) return signs[1];
  const nums = [...s.matchAll(/£\s?(\d{1,3})/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  const mid = nums.length > 1 ? (nums[0] + nums[nums.length - 1]) / 2 : nums[0];
  return mid < 25 ? "£" : mid < 50 ? "££" : mid < 90 ? "£££" : "££££";
}

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(String(res.status));
  return { html: (await res.text()).slice(0, 2_000_000), url: res.url };
}

function read(html, base) {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => { try { return { href: new URL(m[1].replace(/&amp;/g, "&"), base).href, text: m[2].replace(/<[^>]+>/g, " ").trim() }; } catch { return null; } })
    .filter(Boolean);
  // platform widgets are often iframes or scripts rather than links
  const embeds = [...html.matchAll(/<(?:iframe|script)\b[^>]*src=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { return null; } }).filter(Boolean);
  let booking = null;
  for (const href of [...links.map((l) => l.href), ...embeds]) {
    const p = PLATFORMS.find(([, re]) => re.test(href));
    // a widget script alone is not a booking page; keep it only when it names the venue
    if (p && !/\.js(\?|$)/i.test(href)) { booking = { platform: p[0], url: cleanBooking(href) }; break; }
  }
  let price = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack = [JSON.parse(m[1].trim())];
      while (stack.length && !price) {
        const o = stack.pop();
        if (Array.isArray(o)) stack.push(...o);
        else if (o && typeof o === "object") {
          if (o.priceRange) price = band(o.priceRange);
          if (!booking && o.potentialAction?.target) {
            const t = [].concat(o.potentialAction.target)[0];
            const url = typeof t === "string" ? t : t?.urlTemplate;
            if (url && /reserv|book/i.test(o.potentialAction["@type"] ?? "")) booking = { platform: PLATFORMS.find(([, re]) => re.test(url))?.[0] ?? "own site", url: cleanBooking(url) };
          }
          stack.push(...Object.values(o));
        }
      }
    } catch {}
  }
  const own = links.filter((l) => /\b(book|reserv)/i.test(l.text) && new URL(l.href).hostname === new URL(base).hostname).map((l) => l.href);
  return { booking, price, own: [...new Set(own)].slice(0, 2), form: /<form\b[\s\S]{0,4000}?(party|covers|guests)/i.test(html) };
}

const client = await connect();
const { rows: todo } = await client.query(`
  select id, name, website from places p
  where duplicate_of is null and parent_id is null and status <> 'closed' and coalesce(website, '') ~ '^https?://'
    and category in ('restaurant', 'takeaway', 'street_food', 'cafe', 'pub', 'bar')
    and (recommended or exists (select 1 from reviews r where r.place_id = p.id))
    and (booking_url is null or price_band is null)
    and coalesce(attributes->>'bookingSearchedOn', '') < to_char(current_date - 30, 'YYYY-MM-DD')
  order by recommended desc, (select count(distinct source_id) from reviews r where r.place_id = p.id) desc, id
  limit $1`, [MAX]);
console.log(`${todo.length} places to read`);

let nBook = 0, nPrice = 0, failed = 0;
for (const [i, p] of todo.entries()) {
  let booking = null, price = null;
  try {
    const home = await get(p.website);
    let r = read(home.html, home.url);
    booking = r.booking; price = r.price;
    for (const url of r.own) {
      if (booking && price) break;
      const page = await get(url).catch(() => null);
      if (!page) continue;
      const s = read(page.html, page.url);
      booking ??= s.booking ?? (s.form ? { platform: "own site", url: page.url } : null);
      price ??= s.price;
    }
  } catch { failed++; }
  if (booking) nBook++;
  if (price) nPrice++;
  if (DRY) { console.log(`${p.name}: ${booking ? `${booking.platform} ${booking.url}` : "no booking link"}; ${price ?? "no price"}`); continue; }
  await client.query(
    `update places set
       booking_url = coalesce(booking_url, $2), booking_platform = case when booking_url is null and $2 is not null then $3 else booking_platform end,
       price_band = coalesce(price_band, $4),
       attributes = attributes || jsonb_build_object('bookingSearchedOn', $5::text)
         || case when booking_url is null and $2 is not null then '{"bookingFrom": "website"}'::jsonb else '{}'::jsonb end
         || case when price_band is null and $4 is not null then '{"priceFrom": "website"}'::jsonb else '{}'::jsonb end
     where id = $1`, [p.id, booking?.url ?? null, booking?.platform ?? null, price, today]);
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1} read: ${nBook} booking links, ${nPrice} prices, ${failed} sites unreadable`);
}
console.log(`found ${nBook} booking links and ${nPrice} prices from ${todo.length} websites (${failed} unreadable)`);
const s = await client.query(`select recommended, count(*)::int places, count(booking_url)::int booking, count(price_band)::int price
  from booking_and_prices group by 1 order by 1 desc`);
console.table(s.rows);
await client.end();
