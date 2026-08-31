// Prints, for one guide, every thin entry beside the facts the sheet already
// holds about it.
//
// WHY THIS EXISTS. The sheet carries Why Go on 796 of 797 venues, Setting on
// 281, Signature Dish on 218 and Noise on 260 - material that was researched
// once and then never reached the articles, while the articles sat at 35 words
// an entry. The work of thickening a guide is mostly assembly, not research;
// this shows what is already in hand so the research is only for the gaps.
//
//   node scripts/entry-material.mjs best-turkish-restaurants-london
import fs from "node:fs";

const slug = process.argv[2];
if (!slug) { console.error("usage: entry-material.mjs <article-slug>"); process.exit(1); }

const FACTS = JSON.parse(fs.readFileSync("C:/Users/rober/AppData/Local/Temp/claude/C--Users-rober-Projects-london-travel-geek/46e6fa42-9c34-4730-8fbf-4a23c437b587/scratchpad/venue-facts.json", "utf8"));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = {};
for (const [k, v] of Object.entries(FACTS)) byNorm[norm(k)] = { ...v, sheetName: k };

const lines = fs.readFileSync(`src/content/articles/${slug}.md`, "utf8").split(/\r?\n/);
const isChrome = (t) => {
  const s = t.trim();
  return !s || /^!\[/.test(s) || /^<[a-z]/i.test(s) || /^[>|]/.test(s) || /^-{3,}$/.test(s)
    || (/^\*[^*]+\*$/.test(s) && s.length < 170);
};

const MIN = Number(process.argv[3] ?? 80);
for (let i = 0; i < lines.length; i++) {
  if (!/^### /.test(lines[i])) continue;
  const heading = lines[i].replace(/^###\s+/, "").trim();
  const name = heading.split(",")[0].split(/\s+—\s+/)[0].trim();
  let w = 0, body = [];
  for (let j = i + 1; j < lines.length && !/^#{2,3} /.test(lines[j]); j++) {
    body.push(lines[j]);
    if (!isChrome(lines[j])) w += lines[j].split(/\s+/).filter(Boolean).length;
  }
  if (w >= MIN) continue;
  const f = byNorm[norm(name)];
  console.log(`\n### ${heading}   [${w}w]`);
  console.log(`  CURRENT: ${body.filter((b) => !isChrome(b)).join(" ").slice(0, 150)}`);
  if (!f) { console.log("  SHEET: no row"); continue; }
  const show = (label, v) => { if (v && v.trim()) console.log(`  ${label.padEnd(9)} ${v.slice(0, 240)}`); };
  show("why", f.why); show("signature", f.sig); show("setting", f.setting);
  show("food", f.food); show("op", f.op); show("noise", f.noise);
  show("goodfor", f.good); show("price", [f.price, f.spend].filter(Boolean).join(" "));
  show("closed", f.closed === "None" ? "" : f.closed);
  show("booking", [f.booking, f.lead].filter(Boolean).join(" · "));
  show("station", [f.station, f.walk && `${f.walk} min`].filter(Boolean).join(", "));
}
