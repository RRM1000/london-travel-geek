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
// A FLAT FLOOR WAS THE WRONG SHAPE. 45 words cleared the bar and still read as
// three lines - Duck & Waffle passed while saying almost nothing about the
// dish, the room or the hours. The floor is now 80 for a full entry.
//
// But not every entry is a full entry. The later sections of a guide are
// deliberately a LIST: name, one line, and a pointer up to the fuller entry, so
// the same description is not written twice. Those are exempt - see isCrossRef
// below - because holding them to 80 words would force exactly the duplication
// the structure exists to avoid.
//
// AND NOT EVERY GUIDE IS A LISTICLE. The floor asks what a place cooks, what
// its room is like and what decides a visit - which are questions about a
// VENUE. A guide to one event or one process has sections instead: "How the
// ballot works", "Declining an offer", "Booking ahead", "The Giant Wheel".
// Holding those to a venue standard produced nonsense - it asked what dish
// "Declining an offer" served - and the noise hid the guides that genuinely
// were thin. Those guides are listed in NOT_LISTICLES below and measured on
// nothing; their prose is judged by reading it, which is the only way to judge
// a process description anyway.
//
// The list is deliberately explicit rather than inferred from the headings. A
// pattern match would misfire silently on a venue that happens to be called
// "The Giant Wheel"; a list is wrong out loud, in one place, where anyone can
// see it and disagree.
//
// WHAT A FULL ENTRY OWES THE READER, beyond the citation count:
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
const MIN = Number(args.find((a) => a.startsWith("--min="))?.slice(6) ?? 80);
const only = args.filter((a) => !a.startsWith("--"));

// Guides whose sections describe a process or a single event rather than a set
// of venues. Pass --all to measure them anyway.
const NOT_LISTICLES = new Set([
  "wimbledon-tickets-guide",          // the ballot, the queue, resale, hospitality
  "hyde-park-winter-wonderland",      // one event; the sections are its rides
  "london-marathon-guide",            // ballot, spectating, road closures
  "national-rail-2for1-london-attractions",
  "london-public-transport-costs-and-fares",
  "oyster-card-guide-london",
  "london-pass-guide",
]);
const measureAll = args.includes("--all");

// Does the entry say what you would actually eat or drink? One named item is
// enough - the failure being caught is an entry that never mentions food at all.
//
// WIDENED AFTER IT MISFIRED. The first list was written while fixing the
// breakfast guide and was breakfast-shaped, so it called a 92-word entry about
// lamb ribs and charcoal "NAMES NO FOOD". A check that fires on correct work
// teaches you to ignore it, which is worse than having no check.
//
// No trailing word boundary: \\bscone\\b does not match "scones".
const FOOD = /\b(?:(?:bacon|sausage|pancake|waffle|scone|granola|porridge|omelette|benedict|black pudding|crumpet|marmalade|preserve|clotted cream|fry-up|full english|full irish|gravy|yorkshire|pasty|bubble and squeak|bread|brioche|croissant|pastr|viennoiserie|patisserie|danish|muffin|doughnut|cookie|biscuit|sourdough|babka|cannoli|gelato|ice cream|sorbet|custard|pudding|pizza|pasta|ragu|cacio|carbonara|risotto|focaccia|burrata|mozzarella|margherita|tiramisu|gnocchi|lasagne|antipasti|steak|brisket|sirloin|ribeye|kebab|kofte|kofta|adana|shish|skewer|charcoal|ocakbasi|sweetbread|chicken|lamb|beef|pork|duck|quail|burger|sandwich|sando|butty|shawarma|doner|tantuni|lahmacun|pide|gozleme|meze|mezze|hummus|labneh|labaneh|falafel|flatbread|pitta|pita|dumpling|dim sum|har gau|har gow|siu mai|cheung fun|noodle|noodl|ramen|udon|soba|curry|curri|biryani|dosa|naan|tandoor|masala|paneer|samosa|sushi|sashimi|omakase|tempura|katsu|yakitori|kimchi|bibimbap|bulgogi|banchan|tteok|laksa|satay|rendang|congee|xiao long bao|mapo|sichuan|wonton|spring roll|jianbing|chawanmushi|tapas|jamon|croqueta|paella|tortilla|pintxo|taco|quesadilla|mole|ceviche|guacamole|tostada|oyster|lobster|prawn|scallop|mussel|haddock|turbot|mackerel|anchov|fish|coffee|espresso|flat white|filter|matcha|cocktail|martini|negroni|sharing plates|small plates|tasting menu)|(?:pho|dal|daal|bao|rib|chop|ale|tea|dish|plate|pie|bun|cod|crab|menu|pub food|pub fare|bar snack|kitchen|carvery|ploughman|hash|mash|chip|roast|grill|liver|beer|wine|pint|toast|egg|cake|loaf|tart)s?\b)/i;

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
  // WAS: only guides carrying an evidence block, which left 68 articles
  // unchecked - including the live music guide, whose entries ran to fifteen
  // words. A guide is a guide whether or not a consensus corpus sits behind
  // it. Scope is now "an article that lists places": eight or more entries,
  // filed under Food and drink or Things to do. Transport and SIM guides have
  // headings too, and an 80-word floor means nothing for them.
  .filter((f) => {
    const text = fs.readFileSync(`src/content/articles/${f}`, "utf8");
    const entries = (text.match(/^### /gm) || []).length;
    const cat = (text.match(/^category: *"?([^"\n]+)/m) || [])[1]?.trim();
    // Area guides carry five to seven micro-district sections rather than a
    // long venue list, so the eight-entry rule would exclude all 27 of them.
    // They are exactly where the thin-stub problem keeps turning up: the
    // South Bank guide gave Borough and Southwark fourteen words, and
    // Shoreditch gave Brick Lane twenty.
    if (cat === "London areas") return entries >= 4;
    if (entries < 8) return false;
    return cat === "Food and drink" || cat === "Things to do";
  })
  .filter((f) => !only.length || only.includes(f.replace(/\.md$/, "")));

let totalThin = 0, totalEntries = 0;
const guides = [];

for (const f of files) {
  const slug = f.replace(/\.md$/, "");
  // Not a set of venues - see NOT_LISTICLES above. Skipped entirely rather than
  // reported as passing, so the totals describe only what the floor can judge.
  if (!measureAll && NOT_LISTICLES.has(slug) && !only.includes(slug)) continue;
  const raw = fs.readFileSync(`src/content/articles/${f}`, "utf8");
  // A cinema is not required to name a dish. The food check applies only to
  // food guides; elsewhere it fired on correct work, which teaches people to
  // ignore the audit.
  const foodGuide = /^category: *"?Food and drink"?\s*$/m.test(raw);
  const lines = raw.split(/\r?\n/);
  const thin = [];
  let entries = 0, words = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!/^### /.test(lines[i])) continue;
    // A ### that CONTAINS #### headings is a section header, not an entry.
    // best-indian-restaurants-london groups venues under "### North-eastern and
    // Himalayan" with the restaurants themselves at ####, and counting the
    // group header as a thin entry asks the writer to pad a signpost.
    {
      let k = i + 1, isSection = false;
      for (; k < lines.length && !/^#{1,3} /.test(lines[k]); k++) {
        if (/^#### /.test(lines[k])) { isSection = true; break; }
      }
      if (isSection) continue;
    }
    const name = lines[i].replace(/^###\s+/, "").trim();
    let w = 0, hasDish = false, hasPractical = false, hasFood = false;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^#{2,3} /.test(lines[j]); j++) {
      const t = lines[j];
      body.push(t);
      if (isChrome(t)) continue;
      w += t.split(/\s+/).filter(Boolean).length;
      // A named dish is usually bolded or carries a food noun.
      if (/\*\*[^*]+\*\*/.test(t)) hasDish = true;
      if (/\b(book|booking|queue|walk-in|cash|opens?|closed|until|from \d|per head|£)\b/i.test(t)) hasPractical = true;
      // NAME THE FOOD. Word count alone let an entry run to 117 words about which
      // sources cited a place while never saying what you eat there.
      if (FOOD.test(t)) hasFood = true;
    }
    // A CROSS-REFERENCE IS SUPPOSED TO BE SHORT. The skill's later sections
    // name a venue, give one line and point up to the fuller entry, precisely
    // so the description is not repeated. Flagging those as thin would push
    // the writer to duplicate the very text the rule exists to prevent.
    const isCrossRef = /Full entry above/i.test(body.join(" "));
    entries++; words += w;
    const foodOk = hasFood || !foodGuide;
    if ((w < MIN || !foodOk) && !isCrossRef) thin.push({ name, w, hasDish, hasPractical, hasFood: foodOk });
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
    if (!t.hasFood) missing.push("NAMES NO FOOD");
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
