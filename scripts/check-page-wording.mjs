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
  // Rob, 4 October 2026: "Days are the column that matters", "which matters more
  // than it sounds", "if that matters to you" are filler. State the fact or the
  // consequence instead ("Borough Market is closed on Mondays").
  [/\b(?:the|every|any|only) (?:[\w'’-]+ ){1,4}that (?:actually |really )?matters?\b|(?:[,;—–-]|\band) ?which (?:actually |really )?matters\b|\b(?:is|are) what (?:actually |really )?matters\b|\bmatters most\b|\b(?:if|why) that matters\b|\bthat matters because\b/i, "…that matters filler"],
  // Rob, 4 October 2026: "the section other guides leave out", "three things nobody
  // tells you", "despite what most guides say". State the fact without the
  // comparison. Branch counts ("several sites") and our own "two other guides"
  // links are not caught; named-source analysis in consensus guides is fine.
  [/(?<!\b(?:two|three|the|how) )\b(?:other|most|many|older|rival|every other|no other|plenty of|a lot of) (?:guides?|guidebooks?|lists|listings|blogs|blog posts|articles)\b|\b(?:nobody|no one) tells you\b|\bwhat (?:nobody|no one) (?:tells|mentions|says)\b|\bguides? (?:still|get (?:this|it) wrong|leave (?:this |it )?out|never mention|forget|bury|blur|merge)\b|\bwhatever (?:the |most |older |some |other )?(?:guides?|guidebooks|listings|lists) (?:say|says|imply|tell)\b/i, "other-guides comparison"],
];
// Card notes are short and have no reason to hedge at all.
const DATA_ONLY = [
  [/\bunconfirmed\b|\bunverified\b|\bwhen checked\b|\bat last check\b|human confirmation|\bcurl\b/i, "working note"],
];
const DATA_FILES = ["restaurants.json", "hotels.json", "events.json", "activities.json", "hiddenLondon.json", "markets.json"];
const DATA_FIELDS = ["name", "style", "whyGo", "opNote", "price", "booking", "typicalWhen", "note"];

// RELATIVE DATES. Rob, 3 October 2026: no phrase that is only true on the day it
// was written. "This Saturday", "next month", "last year", "currently" and the
// rest go stale the moment the page is a day old. Name the date ("Saturday 11
// October 2026", "from 28 November 2026") or state the standing fact ("on
// Saturdays"). Article prose and frontmatter (description, faq) only; components
// and pages that compute "this week" from data are out of scope.
//
// Bare "now" is NOT flagged: "what is now the Children's Zoo" is history. Only
// the forms that mean "at the time of writing" are: "now open", "now on sale",
// "is now closed", "right now", "for now".
const DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const PERIOD = "(?:weekend|week|month|year|summer|autumn|winter|spring|christmas|easter|evening|morning|afternoon|season|january|february|march|april|june|july|august|september|october|november|december)";
const NOW_STATE = "(?:open|opens|on sale|live|closed|sold out|available|booking|taking|selling|accepting|showing|playing|trading|sells|serves|costs|charges|offers|free)";
const RELATIVE = [
  // "the last week of October" and "the last weekend of most months" are standing phrases.
  [new RegExp(`\\bthis (?:coming )?(?:${DAY}|${PERIOD})\\b`, "gi"), "this + period"],
  [new RegExp(`\\bnext (?:${DAY}|${PERIOD})\\b`, "gi"), "next + period"],
  [new RegExp(`\\blast (?:${PERIOD})\\b(?! of\\b)`, "gi"), "last + period"],
  // May is left out of PERIOD ("this may be", "the next may not"); the month is always capitalised.
  [/\b(?:[Tt]his|[Nn]ext|[Ll]ast) May\b(?! of\b)/g, "this/next/last May"],
  [/\b(?:tomorrow|tonight|yesterday)\b/gi, "tomorrow / tonight / yesterday"],
  [/\b(?:coming soon|recently|currently|at the moment|at present|at the time of writing|these days|nowadays|right now|for now|just now)\b/gi, "time-of-writing adverb"],
  [new RegExp(`\\bnow ${NOW_STATE}\\b|\\b(?:is|are) now (?:${NOW_STATE}|£)`, "gi"), "'now' meaning at time of writing"],
  // Lower-case "today" only; the sentence-start "Today it houses..." is a historical contrast.
  [/\btoday\b/g, "today"],
];
// Contexts in which "today" is a standing statement, not the reader's day.
const TODAY_OK = [
  /\b(?:still|remains?|survives?|exists?|stands?|standing|used|known|serves?|marks?|marked|accurate|active|cared for|building|statue|studio|street|site|house|home|scheme|which|that|who)\b[^.!?\n]{0,50}\btoday\b/, // "still used today", "which today serves"
  /\b(?:building|statue|studio|street|site|house|home|route|scheme) today\b/,
  /\bto today\b/,                                  // "from Roman times to today"
  /\btoday(?:'s)? (?:show|performance|matinee|screening|tickets?|rules)\b|\bfor today\b|\bdiscounted today\b|\bopens? today\b/, // a rule about the day itself
];
// Exact phrases that match a pattern but are not relative dates. Keep this short.
const RELATIVE_ALLOW = [
  "tonight josephine",     // a Clapham venue
  "the today debate",      // a BBC Radio 4 programme
  "be well for now",       // a Better membership name
  "today's sherlock holmes museum", // the museum, set against Conan Doyle's 221
  "last season's stock",   // outlet-centre stock, not a date
];

const hits = [];
const articles = path.join(ROOT, "src/content/articles");
const showRelative = process.argv.includes("--relative");
for (const file of fs.readdirSync(articles).filter((f) => f.endsWith(".md"))) {
  const lines = fs.readFileSync(path.join(articles, file), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*<div data-gyg|^!\[/.test(line)) return;
    for (const [re, why] of EVERYWHERE) {
      const m = re.exec(line);
      if (m) { hits.push(`${file}:${i + 1}  ${why}: "${line.slice(Math.max(0, m.index - 50), m.index + 70).trim()}"`); break; }
    }
    const lower = line.toLowerCase();
    for (const [re, why] of RELATIVE) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const around = line.slice(Math.max(0, m.index - 80), m.index + m[0].length + 30);
        if (RELATIVE_ALLOW.some((a) => lower.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).includes(a))) continue;
        if (why === "today" && TODAY_OK.some((ok) => ok.test(around))) continue;
        // sentence-start "Today" is lower-case-only matched above, so it never reaches here.
        hits.push(`${file}:${i + 1}  relative date (${why}): "${line.slice(Math.max(0, m.index - 50), m.index + 70).trim()}"`);
      }
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
