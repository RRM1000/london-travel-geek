// Verifier for best-halal-restaurants-london.md.
//
// This guide is not scored on citation counts, so unlike its siblings it does
// not check "cited by N sources" strings - it deliberately prints none. What it
// checks instead is the thing that would actually cause harm: that every halal
// status claim in the article is one of the three the topic config allows, and
// that no venue has been quietly upgraded from its own word into a
// certification.
//
// The config's rule, in one line: never print a venue as certified unless the
// venue itself says certified.
import fs from "node:fs";

const ART = "src/content/articles/best-halal-restaurants-london.md";
const art = fs.readFileSync(ART, "utf8");
const body = art.split(/^---$/m).slice(2).join("---");

let fail = 0;
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++; };
const ok = (m) => console.log(`  ok    ${m}`);

// ---------------------------------------------------------------- status ---
// What each venue's OWN site said, recorded 2026-09-08. The article may not
// claim more than the right-hand column.
const VERIFIED = {
  // Souk STATES HMC certification and HMC's own register does not list it (read
  // 2026-09-08, no Souk under any variant, no WC2 entries at all). So it may
  // name HMC - it is reporting the restaurant's claim - but it may not be
  // presented as certified. Status 2, with the discrepancy carried in the entry.
  "Souk":           { status: 2, evidence: "own FAQ: \"Yes it's 100% Halal HMC certified\"; NOT on the HMC register 2026-09-08", body: "HMC" },
  "Ramo Ramen":     { status: 1, evidence: "own homepage: \"ALL MEAT SERVED IS HALAL CERTIFIED\"", body: null },
  "The Great Chase":{ status: 2, evidence: "own sourcing page: \"High-welfare, and fully Halal\"" },
  "HS&Co":          { status: 2, evidence: "own homepage: \"Proudly fully Halal\", \"hand cut dry aged halal prime steaks\"" },
  "Cue Point":      { status: 2, evidence: "own about page: \"we serve Halal | Vegan | Gluten-Free | Diary-Free\"" },
  "Berenjak":       { status: 2, evidence: "own FAQ: \"We do serve halal meat at all our London restaurants\"" },
  "Honest Burgers": { status: 3, evidence: "own FAQ: \"All of the chicken in our restaurants is halal\"; beef is not" },
  "Dishoom":        { status: 3, evidence: "own site: lamb, chicken and turkey from halal-certified suppliers; serves pork" },
  "Pizza Pilgrims": { status: 3, evidence: "own menu page: halal pepperoni, all cheese halal, \"Halal Options Available\" per branch" },
  "Rasa Sayang":    { status: 3, evidence: "own homepage: \"our Halal offerings\"" },
};

// Every venue in the article must be one I actually verified.
const headings = [...body.matchAll(/^### ([^\n—]+?)(?:\s+—|$)/gm)].map((m) => m[1].trim());
console.log(`\nENTRIES (${headings.length})`);
for (const h of headings) {
  if (!VERIFIED[h]) bad(`"${h}" is in the article but has no recorded verification`);
}
for (const v of Object.keys(VERIFIED)) {
  if (!headings.includes(v)) bad(`"${v}" was verified but is missing from the article`);
}
if (!fail) ok(`all ${headings.length} entries have a recorded, sourced status`);

// ------------------------------------------------------- no upgrades ------
// The harm case. Only a venue whose own site says "certified" may be described
// as certified, and only Souk may be tied to a named certifying body.
console.log("\nCERTIFICATION CLAIMS");
// Cut each entry at the next heading of ANY level. Splitting on /^### / alone
// gives the LAST entry everything to the end of the document, so Rasa Sayang
// was absorbing the closing section and failing on its use of "audited by a
// named body" - a defect in the verifier that read as a defect in the article.
const sections = body.split(/^### /m).slice(1).map((s) => s.split(/^##+ /m)[0]);
for (const sec of sections) {
  const name = sec.split(/\s+—|\n/)[0].trim();
  const rec = VERIFIED[name];
  if (!rec) continue;
  // Quoting a restaurant's own claim is reporting, not asserting - strip
  // quoted spans before testing what the article says in its own voice.
  const text = sec.toLowerCase().replace(/"[^"]*"/g, " ").replace(/\*\*[^*]*\*\*/g, " ");
  const claimsCert = /(is|fully|100%)[^.]{0,40}certified|certified halal|halal[- ]certified/.test(text);
  if (claimsCert && rec.status !== 1 && name !== "Dishoom" && name !== "Honest Burgers" && name !== "Souk") {
    bad(`${name}: article implies certification, venue only gives its own word`);
  }
  const namesBody = /\bhmc\b|halal monitoring committee|\bhfa\b|halal food authority/.test(text);
  if (namesBody && !rec.body) {
    bad(`${name}: article names a certifying body the venue does not name`);
  }
}
if (fail === 0) ok("no venue is upgraded beyond what its own site claims");

// Dishoom and Honest Burgers are the two partial cases - each must carry the
// limit as well as the claim, or the entry misleads by omission.
console.log("\nPARTIAL-STATUS ENTRIES CARRY THEIR LIMIT");
const dishoom = sections.find((s) => s.startsWith("Dishoom"));
if (!dishoom || !/pork/i.test(dishoom)) bad("Dishoom entry must say it serves pork");
else ok("Dishoom entry states it serves pork");

const honest = sections.find((s) => s.startsWith("Honest Burgers"));
if (!honest || !/beef is not halal/i.test(honest)) bad("Honest Burgers entry must say the beef is not halal");
else ok("Honest Burgers entry states the beef is not halal");

const pp = sections.find((s) => s.startsWith("Pizza Pilgrims"));
if (!pp || !/branch/i.test(pp)) bad("Pizza Pilgrims entry must say the answer is per branch");
else ok("Pizza Pilgrims entry states the answer is per branch");

// ------------------------------------------------------- the register -----
// Every number the article prints about the HMC register must match the
// snapshot on disk, and the Souk discrepancy must be stated rather than buried.
console.log("\nREGISTER FIGURES MATCH data/halal-registers.json");
const reg = JSON.parse(fs.readFileSync("data/halal-registers.json", "utf8"));
const hmc = reg.bodies.HMC;
const figures = [
  [hmc.totalOutletsUK, "UK outlet total"],
  [hmc.londonOutlets, "London outlet total"],
  [hmc.londonRestaurants, "London restaurant total"],
];
for (const [n, what] of figures) {
  if (new RegExp(`\\b${n}\\b`).test(body)) ok(`${what} (${n}) matches the snapshot`);
  else bad(`${what} is ${n} in the snapshot but that figure is not in the article`);
}
if (new RegExp(`\\b${reg.read}\\b`).test(body) || /8 September 2026/.test(body)) ok("article dates the register read");
else bad("article must say WHEN the register was read - certification lapses");

// SOUK. Its FAQ says "100% Halal HMC certified" and HMC's register does not
// list it (checked 2026-09-08, no name variant, no WC2 entries at all). Rob's
// decision on 2026-09-08 was to drop that sentence rather than publish a
// discrepancy about a real business, and to file the venue under the kitchen's
// own word. The finding stays in data/topics/halal.json under theSoukProblem.
//
// So the article must NOT print the discrepancy - and must still never assert
// the certification in its own voice. Both halves are checked.
const soukSec = sections.find((s) => s.startsWith("Souk"));
if (!soukSec) bad("Souk entry is missing");
else {
  if (/did not list|not on the HMC register|register .{0,30}did not/i.test(soukSec)) {
    bad("the Souk register discrepancy was dropped by decision - it must not be back in the article");
  } else ok("Souk entry carries no register discrepancy, as decided");

  if (/\bis (HMC )?certified\b/i.test(soukSec.replace(/"[^"]*"/g, ""))) {
    bad("Souk must not be asserted as certified outside a quotation of its own claim");
  } else ok("Souk is not asserted as certified in the article's own voice");

  if (!/own word/i.test(soukSec)) bad("Souk entry must frame the claim as the restaurant's own word");
  else ok("Souk entry frames the claim as the restaurant's own word");
}

// ------------------------------------------------------------ ranking -----
// theRankingProblem: no source publishes a current quality ranking, so the
// article must not imply one, and must carry no methodology callout.
console.log("\nNO INVENTED RANKING");
if (/cited by \d+ sources?/i.test(body)) bad("article prints citation counts - this topic has no usable ranking");
else ok("no citation counts printed");
if (/^\s*\d+\.\s+\*\*/m.test(body) && /best.*ranked/i.test(body)) bad("article appears to present a ranked order");
else ok("no ranked order presented");

// ------------------------------------------------------------- draft ------
console.log("\nDRAFT STATE");
if (/^draft:\s*true\s*$/m.test(art)) ok("draft: true");
else bad("expected draft: true - this guide is not cleared to publish");

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nAll checks passed.\n");
process.exit(fail ? 1 : 0);
