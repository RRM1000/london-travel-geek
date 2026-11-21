// Reads the editorial and award lists in data/db-lists.json (music venues, jazz, coffee, cocktail bars ...) and
// records each place a list names as a review from that list's source, under the list's topic. Free.
//
//   node scripts/db/load-lists.mjs
//   node scripts/db/load-lists.mjs --dry-run
//
// A source is found by its domain, or for an award reported on another site (World's 50 Best Bars on Time Out)
// by its name; a new one is added with the tier given in the file. A list that matches fewer than 3 of our places
// is reported and skipped, since its layout probably was not read. Re-runnable: reviews are unique per place,
// source, page and topic.
import fs from "node:fs";
import { connect } from "./lib.mjs";
import { nameIndex, match, pageLines } from "./names.mjs";

const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const { lists } = JSON.parse(fs.readFileSync("data/db-lists.json", "utf8"));

const client = await connect();
const index = await nameIndex(client);
const summary = [];
for (const l of lists) {
  let ids = [];
  try {
    const res = await fetch(l.url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    ids = match(index, pageLines(await res.text()));
  } catch (e) { summary.push({ topic: l.topic, source: l.source, places: 0, note: `unreadable (${e.message})` }); continue; }
  if (ids.length < 3) { summary.push({ topic: l.topic, source: l.source, places: ids.length, note: "too few matches; skipped" }); continue; }
  if (DRY) { summary.push({ topic: l.topic, source: l.source, places: ids.length, note: "dry run" }); continue; }

  await client.query("begin");
  let src = l.domain
    ? await client.query("select id, excluded from sources where domain = $1", [l.domain])
    : await client.query("select id, excluded from sources where name = $1 and kind = $2", [l.source, l.kind]);
  if (!src.rows.length) src = await client.query(
    `insert into sources (name, kind, tier, domain, url, topics, last_checked) values ($1, $2, $3, $4, $5, array[$6::text], $7)
     on conflict (name, kind) do update set last_checked = excluded.last_checked returning id, sources.excluded`,
    [l.source, l.kind, l.tier, l.domain, l.domain ? `https://${l.domain}` : l.url, l.topic, today]);
  if (src.rows[0].excluded) { await client.query("rollback"); summary.push({ topic: l.topic, source: l.source, places: ids.length, note: "source excluded" }); continue; }
  let added = 0;
  for (const id of ids) {
    const r = await client.query(
      `insert into reviews (place_id, place_name, source_id, url, topic, recorded_on, last_checked, attributes)
       select $1, p.name, $2, $3, $4, $5, $5, '{"via": "db-lists"}'::jsonb from places p where p.id = $1
       on conflict do nothing returning id`, [id, src.rows[0].id, l.url, l.topic, today]);
    added += r.rowCount;
  }
  await client.query("commit");
  summary.push({ topic: l.topic, source: l.source, places: ids.length, note: `${added} new reviews` });
}
console.table(summary);
await client.end();
