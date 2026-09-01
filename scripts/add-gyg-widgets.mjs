// Makes sure every article carries at least one GetYourGuide widget, and that
// long ones carry two: a specific one that matches what the page is about, and
// a general London one near the end.
//
//   node scripts/add-gyg-widgets.mjs --dry
//   node scripts/add-gyg-widgets.mjs
//
// PLACEMENT RULE. A widget dropped into the middle of a table or a blockquote
// breaks the page, so this only ever inserts on the blank line directly before
// a top-level "## " heading. Those are always safe boundaries.
//   - the specific widget goes before the heading nearest 45% of the way down,
//     which is far enough in that the reader is engaged and well clear of the
//     opening summary.
//   - the general one goes before the closing section, so it is the last thing
//     before the outbound links rather than competing with the article.
import fs from "node:fs";

const DIR = "src/content/articles";
const dry = process.argv.includes("--dry");
const PARTNER = "WWP7I0R";
const LONG = 3000; // words, above which a page gets a second widget

// A page only earns a specific widget if there is a real product behind the
// query. Where a topic has no plausible tour, it gets the general one instead
// and is listed as "general only" below.
const SPECIFIC = {
  "should-you-buy-sim-card-at-airport": ["UK eSIM", "London eSIM data plan"],
  "travel-sim-esim-guide": ["UK eSIM", "London eSIM data plan"],
  "oyster-card-guide-london": ["London Travel Pass", "London travelcard"],
  "how-to-use-the-london-underground": ["London Travel Pass", "London travelcard"],
  "london-tube-and-rail-lines-guide": ["London Hop On Buses", "London hop on hop off bus"],
  "cinema-deals-london": ["London Film Tours", "London film locations tour"],
  "london-film-festival": ["London Film Tours", "London film locations tour"],
  "camden-area-guide": ["Camden Market", "Camden Market food tour"],
  "best-steak-restaurants-london": ["London Food Tours", "London food tasting tour"],
  "best-spanish-restaurants-london": ["Tapas Tours", "London tapas tour"],
  "best-mexican-restaurants-london": ["London Food Tours", "London food tasting tour"],
  "best-japanese-restaurants-london": ["Sushi Class", "sushi making class London"],
  "best-chinese-east-asian-restaurants-london": ["Chinatown Food Tours", "London Chinatown food tour"],
  "best-burgers-london": ["London Food Tours", "London food tasting tour"],
  "best-turkish-restaurants-london": ["London Food Tours", "London food tasting tour"],
  "best-italian-restaurants-london": ["Pasta Class", "pasta making class London"],
  "best-seafood-restaurants-london": ["Borough Market Food Tour", "Borough Market food tour"],
  "best-street-food-london": ["Street Food Tours", "London street food tour"],
  "best-indian-restaurants-london": ["Brick Lane Curry Tour", "Brick Lane food tour"],
  "immersive-experiences-london": ["Immersive Experiences", "London immersive experience"],
  "wimbledon-tickets-guide": ["Wimbledon Tour", "Wimbledon Lawn Tennis Museum tour"],
};

const GENERAL = ["London Top Attractions", "London top attractions"];

const widget = (cmp, q) =>
  `<div data-gyg-href="https://widget.getyourguide.com/default/activities.frame" ` +
  `data-gyg-locale-code="en-US" data-gyg-widget="activities" data-gyg-number-of-items="3" ` +
  `data-gyg-cmp="${cmp}" data-gyg-partner-id="${PARTNER}" data-gyg-q="${q}">` +
  `<span>Powered by <a target="_blank" rel="sponsored" href="https://www.getyourguide.com/london-l57/">GetYourGuide</a></span></div>`;

let added = 0;
const report = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const slug = file.replace(/\.md$/, "");
  const path = `${DIR}/${file}`;
  const raw = fs.readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const have = (raw.match(/data-gyg-widget/g) || []).length;
  const words = raw.split(/\s+/).length;
  const want = words >= LONG ? 2 : 1;
  if (have >= want) continue;

  // Body only — never touch the front matter, which also uses --- fences.
  let fmEnd = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { fmEnd = i; break; }
  }

  // Safe insertion points: the blank line before each top-level H2.
  const heads = [];
  for (let i = fmEnd + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) heads.push(i);
  }
  if (heads.length < 2) { report.push(`  SKIP ${slug} — too few headings`); continue; }

  // The closing section is whichever H2 mentions continuing, related or next.
  const closingIdx = heads.findIndex((i) =>
    /^## (continue|related|more|what to read|keep|plan)/i.test(lines[i]));
  const closing = closingIdx >= 0 ? heads[closingIdx] : heads[heads.length - 1];

  const inserts = [];
  const [scmp, sq] = SPECIFIC[slug] || GENERAL;

  if (have === 0) {
    // 45% down, but never the closing section and never the first heading.
    const eligible = heads.filter((i) => i !== closing && i !== heads[0]);
    const target = eligible.length
      ? eligible.reduce((best, i) =>
          Math.abs(i - lines.length * 0.45) < Math.abs(best - lines.length * 0.45) ? i : best,
        eligible[0])
      : closing;
    inserts.push([target, widget(`${slug}-${scmp.toLowerCase().replace(/\s+/g, "-")}`, sq)]);
  }

  if (want === 2 && have + inserts.length < 2) {
    inserts.push([closing, widget(`${slug}-general`, GENERAL[1])]);
  }

  // Insert from the bottom up so earlier indices stay valid.
  inserts.sort((a, b) => b[0] - a[0]);
  for (const [at, html] of inserts) {
    lines.splice(at, 0, html, "");
    added++;
  }

  report.push(`  ${have}→${have + inserts.length}  ${String(words).padStart(6)}w  ${slug}`);
  if (!dry) fs.writeFileSync(path, lines.join(eol));
}

console.log(report.join("\n"));
console.log(`\n${added} widget(s) ${dry ? "would be added" : "added"} across ${report.length} article(s).`);
