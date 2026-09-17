// Fails the build when a page would tell readers how our research went instead
// of what is true. Rob, 17 September 2026: never write that a website is down,
// that Google or a listing has a place as closed, that an automated check failed,
// or that something needs verifying. See "Never on a page" in CONTENT_GUIDELINES.md.
//
// Scans article markdown and the exported data files, whose whyGo and opNote
// fields print on area-guide and restaurant cards. A data hit is fixed in the
// owner script (scripts/write-*.mjs), then the tab is re-written and re-exported.
//
//   node scripts/check-page-wording.mjs
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

const EVERYWHERE = [
  [/needs (verifying|reconfirming)/i, "working note"],
  [/\b(did not|didn't|would not|wouldn't) (respond|resolve)\b/i, "website down"],
  [/\b(does not|doesn't|no longer) resolves?\b/i, "website down"],
  [/\b(site|website|domain|page)s? (is |are |was |were )?(currently )?unreachable/i, "website down"],
  [/\bparked (domain|page)|\bholding page\b|\bdomain\b[^.\n]{0,60}\b(lapsed|expired|parking page|for sale|for-sale)/i, "website down"],
  [/\b(returns?|returned) (a |an )?(404|error page)/i, "website down"],
  [/blocked automated|automated (access|requests)|refuses automated|logged-out visitor/i, "how we checked"],
  [/\bgoogle('s)? (maps |places )?(business )?(listings?|records?)\b|\bgoogle (maps |places )?(now )?(shows|lists|marks|says|has)\b[^.\n]{0,60}\bclosed\b/i, "Google as a source"],
  [/\b(listed|recorded|marked|flagged) as (permanently |temporarily )?closed\b/i, "listing as a source"],
  [/\bcould not be (confirmed|verified|established)\b|\bwe (could not|couldn't|cannot|can't) (confirm|verify)\b|treat (it |this )?as unconfirmed/i, "research gap"],
  // "X does not publish its prices" is a fact about the operator; these are notes to ourselves.
  [/\bbefore publishing\b|\bdo not print\b/i, "working note"],
  [/\bRESOLVED 20\d\d|\bAMBIGUOUS SOURCE\b|\bDO NOT REPEAT\b/, "working note"],
];
// Card notes are short and have no reason to hedge at all.
const DATA_ONLY = [
  [/\bunconfirmed\b|\bunverified\b|\bwhen checked\b|\bat last check\b|human confirmation|\bcurl\b/i, "working note"],
];
const DATA_FILES = ["restaurants.json", "hotels.json", "events.json", "activities.json", "hiddenLondon.json", "markets.json"];
const DATA_FIELDS = ["name", "style", "whyGo", "opNote", "price", "booking", "typicalWhen", "note"];

const hits = [];
const articles = path.join(ROOT, "src/content/articles");
for (const file of fs.readdirSync(articles).filter((f) => f.endsWith(".md"))) {
  const lines = fs.readFileSync(path.join(articles, file), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*<div data-gyg|^!\[/.test(line)) return;
    for (const [re, why] of EVERYWHERE) {
      const m = re.exec(line);
      if (m) { hits.push(`${file}:${i + 1}  ${why}: "${line.slice(Math.max(0, m.index - 50), m.index + 70).trim()}"`); break; }
    }
  });
}
for (const file of DATA_FILES) {
  const p = path.join(ROOT, "src/data", file);
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const rows = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) ?? [];
  for (const row of rows) {
    for (const field of DATA_FIELDS) {
      const v = row[field];
      if (typeof v !== "string") continue;
      for (const [re, why] of [...EVERYWHERE, ...DATA_ONLY]) {
        const m = re.exec(v);
        if (m) { hits.push(`src/data/${file} "${row.name}" ${field}  ${why}: "${v.slice(Math.max(0, m.index - 50), m.index + 70).trim()}"`); break; }
      }
    }
  }
}

if (hits.length) {
  console.error(`check-page-wording: ${hits.length} passage(s) describe our research instead of the facts:`);
  for (const h of hits) console.error(`  ${h}`);
  console.error("Say what is true, or leave it out and ask Rob. Rules: CONTENT_GUIDELINES.md, \"Never on a page\".");
  process.exit(1);
}
console.log("check-page-wording: clean");
