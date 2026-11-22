// Reads the content queue (articles and videos from the blogs, sites and creators we follow) and records each
// place a London, unsponsored item lists as a review from that source, so it counts in the rankings.
//
//   node scripts/db/read-queue.mjs                    # every unread item
//   node scripts/db/read-queue.mjs --max 50 --dry-run
//
// Articles are fetched in full and only their headings, bold lines and list items are matched; videos use the
// stored description lines. See names.mjs for the matching rules. Items are marked read_on and not read again;
// Rob's status (new, added, rejected) is left alone, and rejected items are skipped.
import { connect } from "./lib.mjs";
import { nameIndex, match, pageLines, textLines } from "./names.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const MAX = Number(arg("--max") ?? 10000);
const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

const client = await connect();
const index = await nameIndex(client);
console.log(`${index.size} place names to look for`);
const { rows: items } = await client.query(`
  select q.id, q.source_id, q.url, q.title, q.published_on, q.medium, q.description
  from content_queue q join sources s on s.id = q.source_id
  where q.read_on is null and q.status <> 'rejected' and q.is_london and not q.sponsored
    and not s.excluded and coalesce(s.tier, '') <> 'F'
  order by q.published_on desc nulls last limit $1`, [MAX]);
console.log(`${items.length} unread items`);

let reviews = 0, withPlaces = 0, unreadable = 0;
for (const [i, q] of items.entries()) {
  let lines = [];
  if (q.medium === "article") {
    try {
      const res = await fetch(q.url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(res.status);
      lines = [q.title, ...pageLines((await res.text()).slice(0, 3_000_000))];
    } catch { unreadable++; lines = [q.title]; }
  } else lines = [q.title, ...textLines(q.description)];
  const ids = match(index, lines);
  if (ids.length) withPlaces++;
  if (DRY) { console.log(`${q.medium} ${q.title?.slice(0, 70)}: ${ids.length} places`); continue; }
  await client.query("begin");
  for (const id of ids) {
    const r = await client.query(
      `insert into reviews (place_id, place_name, source_id, url, title, published_on, recorded_on, last_checked, attributes)
       select $1, p.name, $2, $3, $4, $5, $6, $6, jsonb_build_object('via', 'content_queue', 'medium', $7::text)
       from places p where p.id = $1
       on conflict do nothing returning id`, [id, q.source_id, q.url, q.title, q.published_on, today, q.medium]);
    reviews += r.rowCount;
  }
  await client.query("update content_queue set read_on = $2 where id = $1", [q.id, today]);
  await client.query("commit");
  if ((i + 1) % 250 === 0) console.log(`  ${i + 1} read: ${withPlaces} named places, ${reviews} new reviews, ${unreadable} pages unreadable`);
}
console.log(`read ${items.length} items: ${withPlaces} named our places, ${reviews} new reviews (${unreadable} pages unreadable)`);
await client.end();
