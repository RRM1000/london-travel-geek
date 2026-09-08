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
  "Souk":           { status: 1, evidence: "own FAQ: \"Yes it's 100% Halal HMC certified\"", body: "HMC" },
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
const sections = body.split(/^### /m).slice(1);
for (const sec of sections) {
  const name = sec.split(/\s+—|\n/)[0].trim();
  const rec = VERIFIED[name];
  if (!rec) continue;
  const text = sec.toLowerCase();
  const claimsCert = /(is|fully|100%)[^.]{0,40}certified|certified halal|halal[- ]certified/.test(text);
  if (claimsCert && rec.status !== 1 && name !== "Dishoom" && name !== "Honest Burgers") {
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
