// Dumps every tab of the London Restaurants Google Sheet to work/sheet-dump/<tab>.json,
// one array of row objects per tab, for the one-off import into Supabase.
// work/ is gitignored, so nothing from the Sheet is committed.
//
//   node scripts/db/dump-sheet.mjs
//
import fs from "node:fs";
import path from "node:path";
import { getSheets, SHEET_ID } from "../sheets.mjs";

const out = path.join("work", "sheet-dump");
fs.mkdirSync(out, { recursive: true });

const sheets = await getSheets();
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
const index = [];
for (const s of meta.data.sheets) {
  const tab = s.properties.title;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tab.replace(/'/g, "''")}'`,
  });
  const [header = [], ...rows] = res.data.values ?? [];
  const keys = header.map((h, i) => (h ?? "").trim() || `col_${i + 1}`);
  const objs = rows
    .filter((r) => r.some((v) => (v ?? "").toString().trim()))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").toString().trim()])));
  const file = tab.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + ".json";
  fs.writeFileSync(path.join(out, file), JSON.stringify(objs, null, 1));
  index.push({ tab, file, rows: objs.length, columns: keys });
  console.log(`${tab.padEnd(28)} ${objs.length} rows`);
}
fs.writeFileSync(path.join(out, "_index.json"), JSON.stringify(index, null, 1));
console.log(`wrote ${index.length} tabs to ${out}`);
