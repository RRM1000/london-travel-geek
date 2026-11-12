// Weekly expiry check for the food deals pipeline. Re-reads each deal's source page and
// sorts the deals into: ok, expired (endDate passed), changed (the page no longer carries
// the deal's prices or wording), gone (404/410) and unreachable (blocked or down: not
// evidence of anything, retried next week). Lists every article that names a flagged deal.
//
//   node scripts/recheck-food-deals.mjs [--on=YYYY-MM-DD] [--apply]
//
// --apply removes expired and gone deals from data/food-deals/deals.json and marks
// changed ones with "recheck": "changed" so they are re-extracted before they are reused.
import fs from "node:fs";

const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
const on = process.argv.find((a) => a.startsWith("--on="))?.slice(5) ?? new Date().toISOString().slice(0, 10);
const apply = process.argv.includes("--apply");
const deals = JSON.parse(fs.readFileSync("data/food-deals/deals.json", "utf8"));

const norm = (s) => s.toLowerCase().replace(/&pound;|&#163;/g, "£").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function page(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctl.signal });
    return { status: r.status, text: r.ok ? norm(await r.text()) : "" };
  } catch {
    return { status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

// What must still be on the page: the deal's money and percentages, and most of the
// longer words of the quote the extraction recorded.
function verdict(d, text) {
  // From the quote only (the page's own words): the price field is the extractor's
  // rewording ("half price" becomes "50%", "24.95" becomes "£24.95"). Matched without the £.
  const money = [...new Set([...(d.quote ?? "").matchAll(/£?(\d+(?:\.\d\d)?)(?=\b|%)/g)].map((m) => m[1]).filter((n) => n.length > 1))];
  const missingMoney = money.filter((m) => !new RegExp(`(^|[^0-9.])${m.replace(".", "\\.")}([^0-9]|$)`).test(text));
  const words = norm(d.quote ?? "").split(/[^a-z0-9£%'-]+/).filter((w) => w.length > 5);
  const wordShare = words.length ? words.filter((w) => text.includes(w)).length / words.length : 1;
  if (missingMoney.length || wordShare < 0.5) return { status: "changed", missingMoney, wordShare: Math.round(wordShare * 100) };
  return { status: "ok" };
}

const bySource = new Map();
for (const d of deals) bySource.set(d.sourceUrl, [...(bySource.get(d.sourceUrl) ?? []), d]);
const results = [];
const urls = [...bySource.keys()];
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    const p = await page(url);
    for (const d of bySource.get(url)) {
      let v;
      if (d.endDate && d.endDate < on) v = { status: "expired" };
      else if (p.status === 404 || p.status === 410) v = { status: "gone" };
      else if (!p.text) v = { status: "unreachable", http: p.status };
      else v = verdict(d, p.text);
      results.push({ name: d.name, offer: d.offer, sourceUrl: url, ...v });
    }
  }
}));

// Which articles name each flagged deal, by its offer URL or the restaurant name.
const articles = fs.readdirSync("src/content/articles").filter((f) => f.endsWith(".md"))
  .map((f) => ({ f, text: fs.readFileSync(`src/content/articles/${f}`, "utf8") }));
const flagged = results.filter((r) => !["ok", "unreachable"].includes(r.status));
for (const r of flagged) r.pages = articles.filter((a) => a.text.includes(r.sourceUrl)).map((a) => a.f);

const count = {};
for (const r of results) count[r.status] = (count[r.status] ?? 0) + 1;
fs.writeFileSync(`data/food-deals/recheck-${on}.json`, JSON.stringify({ on, count, results }, null, 1));
console.log(`${on}: ${results.length} deals`, count);
for (const r of flagged) console.log(`${r.status.padEnd(8)} ${r.name}: ${r.offer}${r.pages.length ? `  → on ${r.pages.join(", ")}` : ""}`);

if (apply) {
  const drop = new Set(results.filter((r) => r.status === "expired" || r.status === "gone").map((r) => `${r.name}|${r.offer}`));
  const changed = new Set(results.filter((r) => r.status === "changed").map((r) => `${r.name}|${r.offer}`));
  const kept = deals.filter((d) => !drop.has(`${d.name}|${d.offer}`))
    .map((d) => (changed.has(`${d.name}|${d.offer}`) ? { ...d, recheck: "changed" } : (({ recheck, ...rest }) => rest)(d)));
  fs.writeFileSync("data/food-deals/deals.json", JSON.stringify(kept, null, 1));
  console.log(`applied: ${deals.length - kept.length} removed, ${changed.size} marked changed`);
}
