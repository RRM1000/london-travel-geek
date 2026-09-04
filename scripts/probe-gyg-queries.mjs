// Ask GetYourGuide what each widget query actually returns.
//
// The balancer fills every slot with a SEARCH string, and nothing has ever
// checked that the search returns anything. A query like "London fish and
// chips tour" reads fine in the JSON and may return an empty carousel, or
// three Stonehenge coach trips, on the live page.
//
// This hits the same frame the embed hits, counts the results and records the
// first three titles, so a dead query is visible as a number rather than as
// something a reader notices.
import fs from "node:fs";

const PLAN = JSON.parse(fs.readFileSync("data/gyg-queries.json", "utf8"));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// Every distinct query in the plan: article slots and anchor pools alike.
const queries = new Set();
for (const a of Object.values(PLAN.articles))
  for (const k of ["slot1", "slot2", "slot3", "slot4"]) if (a[k]) queries.add(a[k]);
for (const pool of Object.values(PLAN.anchors)) for (const q of pool) queries.add(q);

const list = [...queries].sort();
console.error(`probing ${list.length} distinct queries`);

async function probe(q) {
  const url =
    "https://widget.getyourguide.com/default/activities.frame" +
    `?partner_id=WWP7I0R&number_of_items=3&locale_code=en-GB&currency=GBP` +
    `&q=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://londontravelgeek.com/" },
        signal: AbortSignal.timeout(45000),
      });
      const html = await res.text();
      // Each card is an activity URL: /london-l57/<slug>-t<id>/?locale=...
      // The card titles are rendered client-side, so the slug is the only
      // human-readable name in the response - which is enough to see whether
      // the results are the right subject.
      const seen = new Map();
      for (const m of html.matchAll(/\/([a-z0-9-]{4,})-t(\d+)\/\?locale/g))
        if (!seen.has(m[2])) seen.set(m[2], m[1].replace(/-/g, " "));
      return { q, n: seen.size, ids: [...seen.keys()], titles: [...seen.values()].slice(0, 3) };
    } catch (e) {
      if (attempt === 2) return { q, n: -1, ids: [], titles: [], err: String(e).slice(0, 60) };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// ONE AT A TIME, with a pause. Six in parallel gets throttled: the endpoint
// starts returning a valid, empty frame rather than an error, so a throttled
// run looks exactly like a query with no inventory. The tell was that the
// "empty" list was a contiguous alphabetical run - everything after the
// throttle kicked in. Slow is the only way to trust the answer.
const out = [];
for (const q of list) {
  out.push(await probe(q));
  if (out.length % 20 === 0) console.error(`  ${out.length}/${list.length}`);
  await new Promise((r) => setTimeout(r, 700));
}

fs.writeFileSync("data/gyg-query-probe.json", JSON.stringify(out, null, 2));

const dead = out.filter((r) => r.n === 0);
const thin = out.filter((r) => r.n > 0 && r.n < 3);
const err = out.filter((r) => r.n === -1);
console.log(`\n${out.length} queries: ${out.length - dead.length - thin.length - err.length} full, ${thin.length} thin (1-2), ${dead.length} EMPTY, ${err.length} errored\n`);
if (dead.length) {
  console.log("EMPTY — the widget renders nothing:");
  for (const r of dead) console.log(`  ${r.q}`);
}
if (thin.length) {
  console.log("\nTHIN — fewer than three results:");
  for (const r of thin) console.log(`  ${String(r.n)}  ${r.q}  →  ${r.titles.join(" | ")}`);
}
if (err.length) {
  console.log("\nERRORED:");
  for (const r of err) console.log(`  ${r.q}  ${r.err}`);
}
