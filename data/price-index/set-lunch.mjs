// LTG-own measure: two-course set lunch price across the live set-menu deals in
// data/food-deals/deals.json (an export of the deals table).
// usage: node data/price-index/set-lunch.mjs [YYYY-MM-DD]   (prints JSON to stdout)
//
// Rules (keep them fixed month to month so the change is real):
//  - type === 'set-menu'
//  - not expired: endDate empty or on/after the read date
//  - a lunch offer: "lunch" appears in offer/price/times, or the times window opens before 15:00
//    and closes by 18:30; evening-only, Sunday-only, festive and "for two/to share" offers are out
//  - a two-course price is stated: "£X for 2 courses", "2 courses £X", "£X / 2", "two courses from £X"
//  - one figure per restaurant name (the lowest stated two-course lunch price)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const readDate = process.argv[2] || new Date().toISOString().slice(0, 10);
const deals = JSON.parse(fs.readFileSync(path.join(here, '..', 'food-deals', 'deals.json'), 'utf8'));

const NUM = '£\\s?(\\d+(?:\\.\\d{1,2})?)';
const patterns = [
  new RegExp(`${NUM}\\s*(?:for\\s*)?(?:2|two)[\\s-]*courses?`, 'i'),
  new RegExp(`(?:2|two)[\\s-]*courses?\\s*(?:from\\s*|for\\s*)?${NUM}`, 'i'),
  new RegExp(`${NUM}\\s*\\/\\s*2\\b`, 'i'),
];
const excluded = /festive|christmas|twixmas|sunday|for two(?![\s-]*courses?)|to share|whole table|for 2\b(?![\s-]*courses?)/i;

const rows = [];
for (const d of deals) {
  if (d.type !== 'set-menu') continue;
  if (d.endDate && d.endDate < readDate) continue;
  const text = [d.offer, d.price].filter(Boolean).join(' | ');
  const all = [text, d.times].filter(Boolean).join(' | ');
  if (excluded.test(text)) continue;
  let lunch = /lunch|pranzetto|menu del d/i.test(all);
  if (!lunch && d.times) {
    const m = d.times.match(/(\d{1,2})[:.]?(\d{2})?\s*(?:am|pm)?\s*[–-]\s*(\d{1,2})[:.]?(\d{2})?/);
    if (m) {
      const open = +m[1], close = +m[3] + (+m[4] || 0) / 60;
      if (open < 15 && close <= 18.5 && close >= 12) lunch = true;
    }
  }
  if (!lunch) continue;
  if (/^(evening|from 1[7-9]|from 2)/i.test(d.times || '')) continue;
  // lunch-specific part of a combined lunch/dinner price string
  const lunchText = (d.price || '').match(/lunch[^;]*?(?:;|$)/i)?.[0] || d.price || d.offer || '';
  let price = null;
  for (const re of patterns) {
    const m = lunchText.match(re) || (!d.price && (d.offer || '').match(re));
    if (m) { price = +m[1]; break; }
  }
  if (price == null) continue;
  rows.push({ name: d.name, area: d.area || null, price, priceText: d.price || d.offer, times: d.times || null,
    sourceUrl: d.sourceUrl || d.site || null, checked: d.checked || null });
}

// one figure per restaurant name (strip bracketed menu names)
const byName = new Map();
for (const r of rows) {
  const key = r.name.replace(/\s*\(.*\)\s*$/, '').toLowerCase();
  if (!byName.has(key) || byName.get(key).price > r.price) byName.set(key, r);
}
const sample = [...byName.values()].sort((a, b) => a.price - b.price);
const prices = sample.map(r => r.price);
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
console.log(JSON.stringify({ readDate, n: sample.length, min: prices[0], median: median(prices), max: prices.at(-1), sample }, null, 1));
