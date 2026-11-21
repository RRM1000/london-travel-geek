// Copies the short quotes recorded in data/consensus/*.json onto the matching review rows
// (same source URL, same venue name once case and punctuation are ignored). Re-runnable.
//
//   node scripts/db/import-quotes.mjs
import fs from "node:fs";
import { connect } from "./lib.mjs";

const key = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").replace(/^the/, "");
const quotes = new Map(); // url|name -> quote
for (const f of fs.readdirSync("data/consensus").filter((f) => f.endsWith(".json"))) {
  const c = JSON.parse(fs.readFileSync(`data/consensus/${f}`, "utf8"));
  for (const s of c.sources ?? []) for (const [name, q] of Object.entries(s.quotes ?? {})) if (s.url && q) quotes.set(`${s.url}|${key(name)}`, q);
}
console.log(`${quotes.size} quotes in the research files`);

const client = await connect();
const { rows } = await client.query("select id, place_name, url, coalesce(attributes->>'channelUrl', url) orig from reviews where quote is null");
const ids = [], qs = [];
for (const r of rows) {
  const q = quotes.get(`${r.orig}|${key(r.place_name)}`) ?? quotes.get(`${r.url}|${key(r.place_name)}`);
  if (q) { ids.push(r.id); qs.push(q); }
}
await client.query("update reviews r set quote = u.q from unnest($1::bigint[], $2::text[]) as u(id, q) where r.id = u.id", [ids, qs]);
console.log(`added a quote to ${ids.length} reviews`);
await client.end();
