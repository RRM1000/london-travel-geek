// Fails when a guide's entries are too thin to be a guide.
//
// WHY THIS EXISTS. A consensus guide can be perfectly evidenced and still be
// useless to read. Every number on these pages is verified by a script, and
// nothing checked whether the entry beside the number told anyone what the
// place serves or what it is like to sit in. So the prose quietly thinned out
// as the pace went up:
//
//   best-pizza-london          122 words per entry   (done first)
//   best-steak-restaurants     100
//   best-indian-restaurants     84
//   ...
//   best-japanese-restaurants   33
//   best-middle-eastern         31
//   best-afternoon-tea          27                   (done late)
//
// 217 of 502 entries were under 40 words. The measurement existed nowhere, so
// nobody could see the slide.
//
// WHAT AN ENTRY OWES THE READER, beyond the citation count:
//   - what they actually cook, by name. Not "excellent Sichuan food" but the
//     dish someone would order.
//   - what the room is like to be in.
//   - one thing that decides a visit: booking, queue, hours, price, cash-only.
//
//   node scripts/audit-entry-depth.mjs                 # every guide
//   node scripts/audit-entry-depth.mjs best-coffee-london
//   node scripts/audit-entry-depth.mjs --min=60        # stricter
import fs from "node:fs";

const args = process.argv.slice(2);
const MIN = Number(args.find((a) => a.startsWith("--min="))?.slice(6) ?? 45);
const only = args.filter((a) => !a.startsWith("--"));

// Lines that are furniture around an entry rather than the entry itself.
const isChrome = (t) => {
  const s = t.trim();
  if (!s) return true;
  if (/^!\[/.test(s)) return true;                    // image
  if (/^<[a-z]/i.test(s)) return true;                // embed
  if (/^[>|]/.test(s)) return true;                   // callout or table
  if (/^-{3,}$/.test(s)) return true;                 // rule
  if (/^\*[^*]+\*$/.test(s) && s.length < 170) return true; // meta or caption
  return false;
};

const files = fs.readdirSync("src/content/articles")
  .filter((f) => f.endsWith(".md"))
  .filter((f) => /The evidence behind this guide/.test(fs.readFileSync(`src/content/articles/${f}`, "utf8")))
  .filter((f) => !only.length || only.includes(f.replace(/\.md$/, "")));

let totalThin = 0, totalEntries = 0;
const guides = [];

for (const f of files) {
  const lines = fs.readFileSync(`src/content/articles/${f}`, "utf8").split(/\r?\n/);
  const thin = [];
  let entries = 0, words = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!/^### /.test(lines[i])) continue;
    const name = lines[i].replace(/^###\s+/, "").trim();
    let w = 0, hasDish = false, hasPractical = false;
    for (let j = i + 1; j < lines.length && !/^#{2,3} /.test(lines[j]); j++) {
      const t = lines[j];
      if (isChrome(t)) continue;
      w += t.split(/\s+/).filter(Boolean).length;
      // A named dish is usually bolded or carries a food noun.
      if (/\*\*[^*]+\*\*/.test(t)) hasDish = true;
      if (/\b(book|booking|queue|walk-in|cash|opens?|closed|until|from \d|per head|£)\b/i.test(t)) hasPractical = true;
    }
    entries++; words += w;
    if (w < MIN) thin.push({ name, w, hasDish, hasPractical });
  }

  if (!entries) continue;
  totalEntries += entries; totalThin += thin.length;
  guides.push({ f: f.replace(/\.md$/, ""), entries, avg: Math.round(words / entries), thin });
}

guides.sort((a, b) => b.thin.length - a.thin.length || a.avg - b.avg);

for (const g of guides) {
  if (!g.thin.length) continue;
  console.log(`\n=== ${g.f}  (${g.entries} entries, ${g.avg} words average)`);
  for (const t of g.thin) {
    const missing = [];
    if (!t.hasDish) missing.push("no dish named");
    if (!t.hasPractical) missing.push("nothing practical");
    console.log(`  ${String(t.w).padStart(3)}w  ${t.name}${missing.length ? `  — ${missing.join(", ")}` : ""}`);
  }
}

console.log(`\n${totalThin} of ${totalEntries} entries are under ${MIN} words (${Math.round((totalThin / totalEntries) * 100)}%)`);
if (totalThin) {
  console.log("An entry needs: what they cook by name, what the room is like,");
  console.log("and one thing that decides a visit - booking, queue, hours or price.");
  process.exit(1);
}
console.log("every entry carries enough to be worth reading");
