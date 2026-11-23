// One-off: moves every deal-list table on the deal pages into data/food-deals/deals.json,
// so the pages print their tables from the data (see src/lib/remark-deal-tables.mjs).
//
// Each table row is matched to the deal it describes (by its link, then the venue name, then
// how alike the wording is). The row's cells are stored on that deal under show[<list>], with
// its position, so the table prints exactly as it was written. A row with no deal behind it
// becomes a new deal record (origin "page"). The table in the article is replaced by a
// {deals list=<key>} line, and the list's header goes in data/food-deals/lists.json.
//   node scripts/import-deal-rows.mjs            report only
//   node scripts/import-deal-rows.mjs --write    write deals.json, lists.json and the articles
import fs from "node:fs";

const write = process.argv.includes("--write");
const DEALS = "data/food-deals/deals.json";
const LISTS = "data/food-deals/lists.json";

// Which tables are deal lists, and which column names the venue. Summary tables (kids eat
// free by area, the card and app comparisons) are not lists of deals and stay as written.
const PAGES = {
  "food-deals-london": { type: null },
  "restaurant-deals-london": { type: "set-menu" },
  "happy-hour-london": { type: "happy-hour", nameCol: { "happy-hours-at-the-weekend": 1 } },
  "kids-eat-free-london": { type: "kids-eat-free", skip: ["by-area-what-is-actually-near-you"] },
  "bottomless-brunch-london": { type: "bottomless" },
  "all-you-can-eat-london": { type: "all-you-can-eat" },
};
// The deal type a new record takes when a hub section has no single page type.
const HUB_TYPES = {
  "2-for-1-deals": "two-for-one", "percentage-off-deals": "percent-off", students: "discount-group",
  "blue-light-card-holders": "discount-group", "other-cards-and-memberships": "discount-group",
  "end-of-day-reductions": "end-of-day", "bring-your-own-bottle": "byo", "a-reward-for-joining": "app-reward",
  "stamps-and-points": "app-reward", "birthday-freebies": "birthday",
};

const slugify = (s) => s.toLowerCase().replace(/&amp;|&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => (s ?? "").toLowerCase().replace(/&amp;/g, "&").replace(/['’]/g, "").replace(/[^a-z0-9]/g, "");
const host = (u) => (u ?? "").replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0].toLowerCase();
const pageOf = (u) => (u ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
const words = (s) => new Set((s ?? "").toLowerCase().replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[^a-z0-9£ ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const overlap = (x, y) => { const a = words(x), b = words(y); let n = 0; for (const w of a) if (b.has(w)) n++; return n / (Math.min(a.size, b.size) || 1); };
const cellsOf = (line) => line.replace(/^\|\s?/, "").replace(/\s?\|\s*$/, "").split(/\s\|\s?/).map((c) => c.trim());
// "**Megan's** Classic" is Megan's: a bold lead is the venue, the rest names the package.
const nameOf = (cell) => (cell.match(/^\*\*(?:\[([^\]]+)\]\([^)]*\)|([^*]+))\*\*/)?.slice(1).find(Boolean) ?? cell).replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/, "$1").split(/,| \(| ★/)[0].trim();
const linkOf = (cell) => cell.match(/\]\((https?:[^)]+)\)/)?.[1] ?? null;
const venueKey = (n) => norm(n.replace(/\s*\(.*\)\s*$/, ""));

const deals = JSON.parse(fs.readFileSync(DEALS, "utf8"));
for (const d of deals) delete d.show; // re-runnable
const lists = {};
const report = { matched: 0, created: 0, weak: [] };
const articles = {};

for (const [page, cfg] of Object.entries(PAGES)) {
  const file = `src/content/articles/${page}.md`;
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const out = [];
  let sec = "";
  const seen = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{2,3} /.test(l)) sec = slugify(l.replace(/^#+ /, ""));
    const isTableStart = /^\| /.test(l) && /^\|\s*:?-{3}/.test(lines[i + 1] ?? "") && !/^\| /.test(lines[i - 1] ?? "");
    if (!isTableStart || (cfg.skip ?? []).includes(sec)) { out.push(l); continue; }
    // A key per table: page and section, with a counter if a section holds two tables.
    seen[sec] = (seen[sec] ?? 0) + 1;
    const key = `${page}#${sec}${seen[sec] > 1 ? `-${seen[sec]}` : ""}`;
    const header = cellsOf(l);
    const nameCol = cfg.nameCol?.[sec] ?? 0;
    lists[key] = { header, nameCol };
    let j = i + 2, pos = 0;
    for (; j < lines.length && /^\| /.test(lines[j]); j++) {
      const cells = cellsOf(lines[j]);
      const name = nameOf(cells[nameCol]);
      const link = linkOf(cells[nameCol]) ?? cells.map(linkOf).find(Boolean) ?? null;
      const text = cells.filter((_, k) => k !== nameCol).join(" ");
      // Candidates: every deal on the same site or with the same venue name. A venue's deals
      // can sit on several of its pages (Brasserie Blanc's Steak Night is on its Southbank page).
      const pool = deals.filter((d) => d.origin !== "page" || d.show);
      const byName = pool.filter((d) => venueKey(d.name) === venueKey(name) || norm(d.name).startsWith(norm(name)) && norm(name).length >= 4);
      const bySite = link ? pool.filter((d) => host(d.site) === host(link) || host(d.sourceUrl) === host(link)) : [];
      // A deal already holding a row of this table is not this row: two rows are two offers.
      let cands = (byName.length ? byName : bySite).filter((d) => !d.show?.[key]);
      // A discount-group row only matches a deal for the same group.
      const AUD = { students: /student|unidays|totum|nus\b/i, "blue-light-card-holders": /blue light/i };
      if (AUD[sec]) cands = cands.filter((d) => AUD[sec].test(`${d.offer} ${d.conditions ?? ""} ${d.name}`));
      // Different named offers ("Steak Night" against "Charcuterie & Wine Night"), or prices with
      // nothing in common, are different deals.
      const label = (s) => { const m = (s ?? "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").match(/^([^:]{3,40}):/); return m && m[1].split(/\s+/).length <= 5 ? m[1] : null; };
      const strip = (s) => s.replace(/\b(nights?|days?|(mon|tues|wednes|thurs|fri|satur|sun)days?|happy|hour|menu|deal|club|offer)\b/gi, "");
      const prices = (s) => new Set([...(s ?? "").matchAll(/£(\d+(?:\.\d\d)?)/g)].map((m) => m[1]));
      const rowLabel = label(cells[nameCol === 0 ? 1 : 2]), rowPrices = prices(text);
      cands = cands.filter((d) => {
        const dl = label(d.offer);
        if (rowLabel && dl && words(strip(rowLabel)).size && words(strip(dl)).size && overlap(strip(rowLabel), strip(dl)) === 0) return false;
        const dp = prices([d.offer, d.price].join(" "));
        if (rowPrices.size && dp.size && ![...rowPrices].some((p) => dp.has(p))) return false;
        return true;
      });
      // The type a row on this table should be: the page's, else the hub section's.
      const want = cfg.type ?? HUB_TYPES[sec] ?? (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(sec) ? "day-deal" : null);
      let best = null, score = 0;
      for (const d of cands) {
        const s = overlap(text, [d.offer, d.price, d.days, d.times].filter(Boolean).join(" ")) + (want && d.type === want ? 0.15 : 0) + (link && pageOf(d.sourceUrl) === pageOf(link) ? 0.05 : 0);
        if (s > score) { best = d; score = s; }
      }
      if (best && (score >= 0.3 || cands.length === 1)) {
        if (score < 0.45) report.weak.push(`${key} | ${name} | ${score.toFixed(2)} | row: ${text.slice(0, 70)} | deal: ${best.offer.slice(0, 60)}`);
        best.show ??= {};
        best.show[key] = { pos, cells };
        report.matched++;
      } else {
        const d = {
          name, slug: null, site: link ? `https://${host(link)}/` : null,
          type: cfg.type ?? HUB_TYPES[sec] ?? (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|deals-that-run)/.test(sec) ? "day-deal" : "other"),
          offer: cells[nameCol === 0 ? 1 : 2].replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
          price: null, days: null, times: null, conditions: null, branches: null, endDate: null,
          sourceUrl: link, checked: "2026-11-23", quote: null, origin: "page", show: { [key]: { pos, cells } },
        };
        deals.push(d);
        report.created++;
      }
      pos++;
    }
    out.push(`{deals list=${key}}`);
    i = j - 1;
  }
  articles[file] = out.join(eol);
}

console.log(`matched ${report.matched} rows to deals; ${report.created} rows became new records; ${Object.keys(lists).length} lists`);
console.log(`weak matches (check these):\n  ${report.weak.join("\n  ")}`);
if (write) {
  fs.writeFileSync(DEALS, JSON.stringify(deals, null, 1));
  fs.writeFileSync(LISTS, JSON.stringify(lists, null, 1) + "\n");
  for (const [f, t] of Object.entries(articles)) fs.writeFileSync(f, t);
  console.log("written");
}
