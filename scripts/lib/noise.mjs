// One definition of "this captured name is not a venue", shared by the three
// tools that need it: build-evidence.mjs, audit-corpus.mjs and clean-corpus.mjs.
//
// WHY THIS EXISTS. data/name-noise.json grew TWO pattern lists that no one had
// noticed were separate:
//
//   NOISE.patterns                  16 patterns - read only by build-evidence
//   NOISE.chromePatterns.patterns   44 patterns - read only by audit and clean
//
// Zero overlap. So the audit could call a corpus clean while the build was
// still dropping names from it, and the cleaner could leave behind furniture
// the build had been quietly discarding for months. The counts printed by the
// two tools were answering different questions and neither said so.
//
// AND ONE OF THE LISTS WAS PARTLY DEAD. In JSON, "\b" is the backspace
// character U+0008, not a regex word boundary - that needs "\\b". Three
// patterns had been written with a single backslash and compiled to something
// ending in an unmatchable control character, so they never fired. The file's
// own note explains that the \b was added on purpose, because "^home" had
// eaten Homeslice; adding it correctly is what silently switched the pattern
// off. isSafe() below fails loudly on that shape rather than skipping it.
import fs from "node:fs";

const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));

export const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

// Exact-match furniture, plus the real-but-not-in-London list. Kept apart in
// the JSON on purpose: siteChrome is junk, outOfArea is a real business we are
// choosing not to cover.
export const EXACT = new Set(
  [
    ...(NOISE.siteChrome ?? []),
    ...(NOISE.countries ?? []),
    ...(NOISE.genericCategories ?? []),
    ...Object.keys(NOISE.outOfArea ?? {}),
  ].map((s) => String(s).toLowerCase()),
);

const RAW = [...(NOISE.patterns ?? []), ...(NOISE.chromePatterns?.patterns ?? [])];

// A pattern carrying a control character is a bug, not a pattern. Refuse to run
// rather than filtering with a rule that cannot match anything.
export function assertPatternsUsable() {
  const bad = [];
  for (const p of RAW) {
    if (/[\x00-\x1f]/.test(p)) {
      bad.push(`contains a control character (a JSON "\\b" is a backspace; write "\\\\b"): ${JSON.stringify(p)}`);
    }
    try { new RegExp(p, "i"); } catch (e) { bad.push(`will not compile: ${p} - ${e.message}`); }
  }
  if (bad.length) {
    console.error(`\n${bad.length} unusable pattern(s) in data/name-noise.json:`);
    bad.forEach((b) => console.error("  " + b));
    process.exit(1);
  }
  return RAW.length;
}

assertPatternsUsable();
const PATTERNS = RAW.map((p) => new RegExp(p, "i"));

// Some strings are furniture on most pages and a venue on some. "Sunday" is an
// opening-hours row in Harden's, sandwiched between "Saturday" and "9 am-11 pm"
// - and it is also a well-known brunch restaurant in Barnsbury, which The Nudge
// and The Infatuation both list among The Wolseley and Caravan. A single global
// verdict has to be wrong in one direction or the other, so the exception is
// scoped to the topics where the name really is a venue.
const EXCEPTIONS = new Map(
  Object.entries(NOISE.venueExceptions ?? {}).map(([k, v]) => [norm(k), new Set(v.topics ?? [])]),
);

/**
 * Is this captured string site furniture rather than a venue?
 * @param {string} name
 * @param {string} [topic] the corpus it was captured for, if known
 */
export function isFurniture(name, topic) {
  const n = String(name ?? "").trim();
  if (!n) return true;
  const allowed = EXCEPTIONS.get(norm(n));
  if (allowed && topic && allowed.has(topic)) return false;
  if (EXACT.has(n.toLowerCase())) return true;
  return PATTERNS.some((r) => r.test(n));
}

export const patternCount = RAW.length;
