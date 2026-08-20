import fs from "node:fs";
// NOTE: no backslash escapes in any regex here - they do not survive the heredoc.
const lines = fs.readFileSync("scripts/write-restaurants-v2.mjs", "utf8").replace(/\r\n/g, "\n").split("\n");
const CUI = { base: "Italian", brit: "British", ind: "Indian", chi: "Chinese" };
let cur = null; const rows = [];
for (const L of lines) {
  const m = /^ +[.]{3}(base|brit|ind|chi),/.exec(L);
  if (m) { cur = { cuisine: CUI[m[1]], text: "" }; rows.push(cur); }
  if (cur) cur.text += L + "\n";
  if (cur && /^ {2}[}],/.test(L)) cur = null;
}
const get = (b, k) => (new RegExp(k + ': *"([^"]*)"').exec(b) || [, ""])[1];
const hits = rows.filter(r => /street-food/.test(get(r.text, "specialities")) || /Market|Hall|Stall/i.test(get(r.text, "venueFormat")));
for (const r of hits.sort((a, b) => a.cuisine.localeCompare(b.cuisine)))
  console.log([r.cuisine.padEnd(8), get(r.text, "name").padEnd(26), get(r.text, "venueFormat").padEnd(13), (get(r.text, "specialities") || "-").padEnd(28), get(r.text, "hood")].join(" "));
console.log(`\n${hits.length} of ${rows.length} rows`);
