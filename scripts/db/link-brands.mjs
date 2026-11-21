// Groups chain branches under one brand row (places.parent_id). Installs or updates the
// link_brands() function from its migration, runs it, and prints the biggest brands.
//
//   node scripts/db/link-brands.mjs                       # migration from supabase/migrations
//   node scripts/db/link-brands.mjs work/link_brands.sql  # or from another copy of that file
import fs from "node:fs";
import { connect } from "./lib.mjs";

const file = process.argv[2] ?? "supabase/migrations/20261121163000_link_brands.sql";
const client = await connect();
await client.query(fs.readFileSync(file, "utf8"));
await client.query("begin");
const { rows: [r] } = await client.query("select * from link_brands()");
await client.query("commit");
console.log(`${r.brands} brands, ${r.branches} branches newly linked`);
const top = await client.query(`select b.name, b.origin, count(c.id)::int branches from places b join places c on c.parent_id = b.id
  group by b.id order by 3 desc limit 25`);
console.table(top.rows);
await client.end();
