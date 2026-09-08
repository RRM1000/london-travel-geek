// Checks the kosher guide's numbers against data/kosher-registers.json.
//
// THIS ONE IS SHAPED DIFFERENTLY FROM THE OTHER VERIFIERS, because the guide is.
// Every other guide on this site ranks venues by how many independent sources
// name them, and its verifier reads data/evidence.json. Kosher has no consensus
// to measure: four authorities publish the complete list of who is certified,
// for free, so a citation ranking would print the handful of venues the
// listicles happen to share and bury thirty the authorities license. The
// article is the registers, so the registers are what is checked.
//
// FOUR CLAIMS, ALL OF WHICH GO STALE WITHOUT ANYTHING NOTICING:
//
//   1. The counts - 33 on the KLBD register, 30 in London, 18 meat, 15 dairy,
//      25 on KF. Certification is added and withdrawn continually.
//   2. THREE LISTINGS ARE NOT IN LONDON. Two in Borehamwood and one in Hove.
//      A reader treating the register as a London list is the exact error the
//      article warns about, so it must keep warning about the right ones.
//   3. Kedassia's register is UNREACHABLE. This is the article's biggest
//      caveat and the reason it tells readers to ask locally in Stamford Hill.
//      If the site comes back, that whole section is wrong and the topic gets
//      considerably better - so this is a check you WANT to fail one day.
//   4. The meat/dairy pair on Brent Street, which is the article's clearest
//      illustration of the distinction that decides where a reader eats.
import fs from "node:fs";

const ARTICLE = "src/content/articles/best-kosher-restaurants-london.md";
const art = fs.readFileSync(ARTICLE, "utf8");
const reg = JSON.parse(fs.readFileSync("data/kosher-registers.json", "utf8"));

const errors = [];
const k = reg.klbd;

// ---------------------------------------------------------------- counts ---
const claim = (re, actual, what) => {
  const m = art.match(re);
  if (!m) { errors.push(`could not find the ${what} figure in the article`); return; }
  if (Number(m[1]) !== actual) errors.push(`${what}: article says ${m[1]}, register snapshot says ${actual}`);
};

claim(/\*\*(\d+)\*\* restaurants and takeaways/, k.total, "KLBD total");
claim(/\*\*Meat kitchens \((\d+)\)/, k.meat, "meat kitchens");
claim(/\*\*Dairy kitchens \((\d+)\)/, k.dairy, "dairy kitchens");
claim(/\*\*(\d+)\*\* establishments, a largely different set/, reg.authorities.KF.count, "KF Kosher total");

// The article states the London subset in prose rather than as a lone figure.
const londonClaim = art.match(/of which (\w+) are in London/);
const WORDS = { thirty: 30, "twenty-nine": 29, "thirty-one": 31, "thirty-two": 32 };
if (londonClaim) {
  const said = WORDS[londonClaim[1].toLowerCase()] ?? Number(londonClaim[1]);
  if (said !== k.london) errors.push(`London subset: article says ${londonClaim[1]} (${said}), register snapshot says ${k.london}`);
} else {
  errors.push("could not find the London-subset claim in the article");
}

// ------------------------------------------------------- out-of-London ---
// The article names the three by name. If the register changes which ones are
// outside London, naming the old ones is worse than naming none.
// Matched on the distinctive first word rather than the register's full
// trading name: prose says "Yofi is in Hove", not "Yofi Restaurant & Deli".
let namedOutside = 0;
for (const entry of k.outsideLondon) {
  const full = entry.split(" (")[0];
  const short = full.split(/\s+/)[0].replace(/[^A-Za-z']/g, "");
  if (art.includes(full) || new RegExp(`\\b${short}\\b`).test(art)) namedOutside++;
  else errors.push(`${full} is on the register and outside London, but the article does not name it as such`);
}
if (namedOutside !== k.outsideLondon.length) {
  errors.push(`the article names ${namedOutside} out-of-London listings, the register has ${k.outsideLondon.length}`);
}

// ------------------------------------------------------------- Kedassia ---
// A check you want to fail eventually.
const saysUnreachable = /website unreachable|does not resolve at all|did not resolve/i.test(art);
if (reg.authorities.Kedassia.reachable && saysUnreachable) {
  errors.push("the article says Kedassia's register is unreachable, but the snapshot now records it as reachable - re-read that register and rewrite the Stamford Hill section, which is currently built on the gap");
}
if (!reg.authorities.Kedassia.reachable && !saysUnreachable) {
  errors.push("Kedassia's register is still unreachable but the article no longer says so - the Stamford Hill caveat is load-bearing");
}

// -------------------------------------------------------- the Brent pair ---
// The article's clearest illustration: same name, next door, different kitchens.
const dairy = k.establishments.find((e) => e.name === "Bagels Bar" && e.category === "Dairy");
const meat = k.establishments.find((e) => /Bagels Bar Grill House/.test(e.name) && e.category === "Meat");
if (!dairy || !meat) {
  errors.push("the Bagels Bar meat/dairy pair is no longer on the register, but the article uses it as its main illustration");
} else {
  if (!art.includes("84 Brent Street")) errors.push("the article has lost the dairy address (84 Brent Street) from the Bagels Bar illustration");
  if (!art.includes("86 Brent Street")) errors.push("the article has lost the meat address (86 Brent Street) from the Bagels Bar illustration");
}

// ------------------------------------------------------------ the trap ---
if (!/klbdkosher\.org/.test(art)) {
  errors.push("the klbdkosher.org trade-site warning has gone - it is the trap that makes a reader conclude KLBD certifies no restaurants at all");
}

console.log(`register snapshot read ${reg.read}`);
console.log(`KLBD: ${k.total} total, ${k.london} in London, ${k.meat} meat, ${k.dairy} dairy`);
console.log(`outside London: ${k.outsideLondon.length} (${k.outsideLondon.map((e) => e.split(" (")[0]).join(", ")})`);
console.log(`Kedassia reachable: ${reg.authorities.Kedassia.reachable} - article says unreachable: ${saysUnreachable}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nevery figure in the article matches the register snapshot");
