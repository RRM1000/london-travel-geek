// Search GetYourGuide's live catalogue, or check activity ids, through the
// public widget feed (getyourguide.com itself rate-limits and blocks curl).
//
//   node scripts/gyg-search.mjs "Stonehenge Avebury"            search, GBP
//   node scripts/gyg-search.mjs "Hallstatt" --currency=EUR --n=12
//   node scripts/gyg-search.mjs --ids=70032,170451               which ids are still bookable
//
// The feed only returns activities that can be booked now, so an id missing
// from an --ids answer has been deactivated (getyourguide.com serves 410 for it).
// Links built from these results must use our partner id (WWP7I0R), never a
// connector's.
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const q = process.argv.slice(2).find((a) => !a.startsWith("--"));
const currency = args.currency ?? "GBP";
const n = args.n ?? 10;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const params = new URLSearchParams({ locale_code: "en-GB", widget: "activities", partner_id: "WWP7I0R", currency });
if (args.ids) { params.set("tour_ids", args.ids); params.set("number_of_items", String(args.ids.split(",").length)); }
else if (q) { params.set("q", q); params.set("number_of_items", String(n)); }
else { console.error("give a search or --ids="); process.exit(1); }

const raw = execFileSync("curl", ["-s", "-A", UA, `https://widget.getyourguide.com/default/activities.frame?${params}`], { encoding: "utf8", maxBuffer: 1e8 });
const s = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'");
const val = (chunk, key) => { const m = chunk.match(new RegExp(`"${key}":\\[0,("((?:[^"\\\\]|\\\\.)*)"|[\\d.]+|null|true|false)`)); return m ? (m[2] ?? m[1]) : ""; };
const cards = s.split('{"price":').slice(1).map((c) => {
  const url = val(c, "urlToAdp");
  return {
    id: (url.match(/-t(\d+)\//) ?? [])[1],
    title: val(c, "title"),
    from: `${val(c, "startingPrice")} ${currency}`,
    rating: val(c, "averageRating") || val(c, "rating"),
    reviews: val(c, "totalRating") || val(c, "numberOfRatings") || val(c, "reviewsCount"),
    location: (c.match(/"primaryLocation":\[0,\{"id":\[0,\d+\],"name":\[0,"([^"]+)"/) ?? [])[1],
    duration: val(c, "duration") || val(c, "formattedDuration"),
    path: url.replace(/^https:\/\/www\.getyourguide\.com/, "").replace(/\?.*/, ""),
    abstract: val(c, "abstract"),
  };
}).filter((c) => c.id);

if (args.ids) {
  const live = new Set(cards.map((c) => c.id));
  for (const id of args.ids.split(",")) console.log(id, live.has(id) ? "LIVE" : "GONE", cards.find((c) => c.id === id)?.title ?? "");
} else {
  for (const c of cards) console.log(`${c.id} | ${c.title} | ${c.location} | from ${c.from} | ★${c.rating} (${c.reviews}) ${c.duration}\n    ${c.path}\n    ${c.abstract.slice(0, 220)}`);
}
