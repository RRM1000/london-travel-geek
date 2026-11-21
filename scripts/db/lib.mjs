// Shared database connection for scripts/db/*. DATABASE_URL comes from the environment
// (GitHub Actions secret SUPABASE_DB_URL) or from work/.env on Rob's computer.
// pg is not a site dependency: it resolves from work/node_modules locally, or from a
// `npm install --no-save pg` in CI.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function loadPg() {
  for (const base of [path.resolve("work", "noop.js"), path.resolve("noop.js")]) {
    try { return createRequire(base)("pg"); } catch {}
  }
  throw new Error("pg is not installed: run `npm install --prefix work pg` (or `npm install --no-save pg` in CI)");
}

export async function connect() {
  if (!process.env.DATABASE_URL && fs.existsSync(path.join("work", ".env"))) {
    const m = fs.readFileSync(path.join("work", ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL, or put DATABASE_URL=... in work/.env");
  const pg = loadPg();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });
  await client.connect();
  // Supabase's default statement timeout is too short for the bulk matching queries.
  await client.query("set statement_timeout = '15min'");
  return client;
}
