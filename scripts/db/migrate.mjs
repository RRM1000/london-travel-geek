// Applies SQL migration files to the database, for changes the Supabase connector can't make
// (it asks for approval that Rob's app can't show). Every migration here is written to be re-runnable.
//
//   node scripts/db/migrate.mjs supabase/migrations/20261121170000_new_places.sql [more.sql ...]
import fs from "node:fs";
import { connect } from "./lib.mjs";

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: node scripts/db/migrate.mjs <file.sql> ..."); process.exit(1); }
const client = await connect();
for (const f of files) {
  await client.query(fs.readFileSync(f, "utf8"));
  console.log(`applied ${f}`);
}
await client.end();
