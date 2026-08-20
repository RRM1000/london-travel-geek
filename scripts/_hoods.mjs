import fs from "node:fs";
const s = fs.readFileSync("scripts/write-restaurants-v2.mjs", "utf8").replace(/\r\n/g, "\n");
const block = /const HOODS = \{([^]*?)\n\};/.exec(s)[1];
const names = [...block.matchAll(/"([^"]+)": */g)].map(m => m[1]);
console.log(names.length + " hoods");
for (const want of ["Paddington","Highbury","Royal Docks","Bermondsey","Hackney","Camden","Victoria","Covent Garden","Spitalfields","Chinatown","Borough","Fitzrovia","City of London","Elephant and Castle","London Fields"])
  console.log((names.includes(want) ? "  ok   " : "  MISS ") + want);
