// A hotel we hold must be linked to Hotels.com, not to its own front door.
//
// THE RULE, from Rob, 19 September 2026: link a hotel to Hotels.com whenever
// Hotels.com sells it; only a hotel it does not sell links to its own website;
// never link a hotel to any other booking site.
//
// THE FAILURE THIS CATCHES. `[name](hotel:slug)` looks right in the markdown and
// still sends the reader to the hotel's own site, because src/lib/remark-hotel-links
// falls back to `website` when the row has no affiliate link - which is what
// happens when nobody has found that hotel's Hotels.com page yet. Nine of the
// eleven hotels in the Bloomsbury guide shipped that way. The markdown was fine;
// the sheet was not. So this checks the resolved destination, not the markdown.
//
// Fill a missing url with scripts/resolve-hotels-com-urls.mjs, then
// scripts/apply-hotels-com-urls.mjs --write, then re-run the writer and export.
//
//   node scripts/check-hotel-links.mjs
import fs from "node:fs";
import path from "node:path";

const ARTICLES = "src/content/articles";
const DATA = "src/data/hotels.json";

const BOOKING_SITES = [
  "booking.com", "expedia.co.uk", "expedia.com", "agoda.com", "trivago.co.uk",
  "trivago.com", "hostelworld.com", "airbnb.co.uk", "airbnb.com", "kayak.co.uk",
  "lastminute.com", "hotels.com",
];

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
        if (BOOKING_SITES.includes(d)) {
          errors.push(`${where}: "${label}" links to ${d}. Hotels go through hotel:<slug> or hotelscom:<id>.`);
          continue;
        }
        const h = sellable.get(tidyUrl(url));
        if (h) errors.push(`${where}: "${label}" links to ${d}, but Hotels.com sells it. Use hotel:${h.slug}.`);
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
      // link goes to Hotels.com is the mismatch readers notice.
      const text = label.trim();
      if (h.affiliateUrl && !/^hotels\.com$/i.test(text) && /\.(com|co\.uk|london|net|org|uk)$/i.test(text)) {
        errors.push(`${where}: "${label}" lands on Hotels.com, so the link text should say Hotels.com.`);
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
