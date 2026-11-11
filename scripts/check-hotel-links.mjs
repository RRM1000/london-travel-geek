// A hotel we hold must be linked to Hotels.com, or to Booking.com where only
// Booking.com sells it, not to its own front door.
//
// THE RULE, from Rob, 19 September 2026, extended 11 November 2026 when Booking.com
// joined CJ: link a hotel to Hotels.com whenever Hotels.com sells it; a hotel
// Hotels.com does not sell links to Booking.com when Booking.com sells it; only
// a hotel neither sells links to its own website. Never show both, and never
// link a hotel to any other booking site.
//
// THE FAILURE THIS CATCHES. `[name](hotel:slug)` looks right in the markdown and
// still sends the reader to the hotel's own site, because src/lib/remark-hotel-links
// falls back to `website` when the row has no affiliate link - which is what
// happens when nobody has found that hotel's Hotels.com page yet. Nine of the
// eleven hotels in the Bloomsbury guide shipped that way. The markdown was fine;
// the sheet was not. So this checks the resolved destination, not the markdown.
//
// Fill a missing url with scripts/resolve-hotels-com-urls.mjs (Hotels.com, kept in
// data/hotels-com-urls.json) or data/booking-com-urls.json (Booking.com), then
// re-run node scripts/export-hotels.mjs.
//
//   node scripts/check-hotel-links.mjs
import fs from "node:fs";
import path from "node:path";

const ARTICLES = "src/content/articles";
const DATA = "src/data/hotels.json";

const BOOKING_SITES = [
  "expedia.co.uk", "expedia.com", "agoda.com", "trivago.co.uk",
  "trivago.com", "hostelworld.com", "airbnb.co.uk", "airbnb.com", "kayak.co.uk",
  "lastminute.com",
];
// Hotels.com and Booking.com are ours, but only through the affiliate: a raw link
// is untracked, and in an article it must go through hotel:<slug> or hotelscom:<id>.
const AFFILIATED_SITES = ["hotels.com", "uk.hotels.com", "booking.com"];

const host = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};

const rows = (() => {
  const j = JSON.parse(fs.readFileSync(DATA, "utf8"));
  return Array.isArray(j) ? j : (j.hotels ?? Object.values(j).find(Array.isArray) ?? []);
})();

const bySlug = new Map(rows.map((h) => [h.slug, h]));
// A row's own page, but only where we could send the reader to Hotels.com instead.
// Keyed on the whole url rather than the domain: the chains share one domain, so
// all.accor.com belongs to a dozen hotels and proves nothing on its own.
const tidyUrl = (u) => String(u || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const sellable = new Map();
for (const h of rows) {
  const u = tidyUrl(h.website);
  if (u && h.affiliateUrl) sellable.set(u, h);
}

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const errors = [];

for (const file of fs.readdirSync(ARTICLES).filter((f) => f.endsWith(".md"))) {
  const text = fs.readFileSync(path.join(ARTICLES, file), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const [, label, url] = m;
      const where = `${file}:${i + 1}`;

      if (/^https?:/i.test(url)) {
        const d = host(url);
        if (BOOKING_SITES.includes(d) || AFFILIATED_SITES.some((s) => d === s || d.endsWith("." + s))) {
          errors.push(`${where}: "${label}" links to ${d}. Hotels go through hotel:<slug> or hotelscom:<id>.`);
          continue;
        }
        const h = sellable.get(tidyUrl(url));
        if (h) errors.push(`${where}: "${label}" links to ${d}, but ${h.affiliateMerchant || "Hotels.com"} sells it. Use hotel:${h.slug}.`);
        continue;
      }

      const slug = url.startsWith("hotel:") ? url.slice(6) : null;
      if (!slug) continue;
      const h = bySlug.get(slug);
      if (!h) {
        errors.push(`${where}: hotel:${slug} is not in ${DATA}. Re-run the export, or fix the slug.`);
        continue;
      }
      // The label should say where the link lands. A domain in the label while the
      // link goes to Hotels.com or Booking.com is the mismatch readers notice, and
      // so is "Hotels.com" on a link that lands on Booking.com, or the reverse.
      const text = label.trim();
      if (h.affiliateUrl) {
        const merchant = h.affiliateMerchant || "Hotels.com";
        const other = merchant === "Booking.com" ? /^hotels\.com$/i : /^booking\.com$/i;
        if (other.test(text)) {
          errors.push(`${where}: "${label}" lands on ${merchant}, so the link text should say ${merchant}.`);
        } else if (text.toLowerCase() !== merchant.toLowerCase() && /\.(com|co\.uk|london|net|org|uk)$/i.test(text)) {
          errors.push(`${where}: "${label}" lands on ${merchant}, so the link text should say ${merchant}.`);
        }
      }
    }
  });
}

if (errors.length) {
  console.error(`check-hotel-links: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("check-hotel-links: clean");
