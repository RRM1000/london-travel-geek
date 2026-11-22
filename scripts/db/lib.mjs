// Shared database connection for scripts/db/*. DATABASE_URL comes from the environment
// (GitHub Actions secret SUPABASE_DB_URL) or from work/.env on Rob's computer.
// pg is not a site dependency: it resolves from work/node_modules locally, or from a
// `npm install --no-save pg` in CI.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// work/ in the current folder, then the repo's work/ (so a script run from another folder still finds it).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK_DIRS = [path.resolve("work"), path.resolve(HERE, "..", "..", "work"), HERE];

function loadPg() {
  for (const base of [...WORK_DIRS.map((d) => path.join(d, "noop.js")), path.resolve("noop.js")]) {
    try { return createRequire(base)("pg"); } catch {}
  }
  throw new Error("pg is not installed: run `npm install --prefix work pg` (or `npm install --no-save pg` in CI)");
}

export async function connect() {
  for (const d of WORK_DIRS) {
    if (process.env.DATABASE_URL || !fs.existsSync(path.join(d, ".env"))) continue;
    const m = fs.readFileSync(path.join(d, ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m);
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
