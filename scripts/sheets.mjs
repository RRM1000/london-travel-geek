// Shared Google Sheets client for the restaurant data pipeline.
//
// The service-account credential lives OUTSIDE this repo and is referenced by
// absolute path, so nothing secret is ever copied in or committed. Override the
// default with GOOGLE_SERVICE_ACCOUNT if the file moves.
//
//   node scripts/sheets.mjs            # prints the sheet's tabs and row counts
//
import { google } from "googleapis";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const SHEET_ID =
  process.env.RESTAURANTS_SHEET_ID ??
  "18M3ZaxzYRo6pplCzQ7iK3-f2SAcc4k_eJ9xa24aRw9Y";

// Exported so pull-analytics.mjs authenticates from the same file - one
// service account, one path to keep right.
export const KEY_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT ??
  "C:/Users/rober/Projects/london-theatre-geek/google-service-account.json";

export async function getSheets() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Service account not found at ${KEY_PATH}. Set GOOGLE_SERVICE_ACCOUNT to its absolute path.`,
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

/** Read a tab as an array of objects keyed by its header row. */
export async function readTab(tab) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tab,
  });
  const [header, ...rows] = res.data.values ?? [];
  if (!header) return [];
  return rows.map((r) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])),
  );
}

/** Create a tab if it does not already exist. Returns true when created. */
export async function ensureTab(title) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  if (meta.data.sheets.some((s) => s.properties.title === title)) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return true;
}

/** Overwrite a tab with a header row plus rows. Clears whatever was there. */
export async function writeTab(tab, header, rows) {
  const sheets = await getSheets();
  await ensureTab(tab);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: tab,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });
  return rows.length;
}

/** Append rows to a tab without touching what is already there. */
export async function appendRows(tab, rows) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
  return rows.length;
}

// Running this file directly prints a summary, which doubles as a health check.
// pathToFileURL handles the Windows file:///C:/ form, which a hand-built
// `file://${argv[1]}` string does not.
// argv[1] is undefined under `node -e`, so guard before converting it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  console.log(`sheet: ${meta.data.properties.title}`);
  for (const s of meta.data.sheets) {
    const col = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${s.properties.title}!A:A`,
    });
    const n = (col.data.values?.length ?? 1) - 1;
    console.log(`  ${s.properties.title.padEnd(20)} ${n} data rows`);
  }
}
