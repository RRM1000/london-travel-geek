// Logs how each performance sells, one entry a day, so the site can later say
// which shows are selling fast and learn which kinds of show sell out.
//
// Reads the readers' raw output (work/listings/raw/*.json) after a daily run
// and updates two files the workflow commits:
//
//   data/listings/sales.json
//     one line per upcoming performance: title, venue, date, on-sale date, the
//     day we first saw it, and its history as [day, value] pairs, appended only
//     when the value changes. The value is seats left where the box office
//     publishes them (Spektrix gives seats left and capacity), otherwise its
//     status: "available", "few left" or "sold out". Ticketmaster publishes
//     neither, so its dates carry only when they were first seen, which is
//     still enough to spot an extra date added after the first.
//
//   data/listings/sales-outcomes.csv
//     once a performance has happened, its line moves here in a flat form:
//     capacity, the day it sold out (if it did), seats left at the end. This
//     is the record to test any "likely to sell out" rule against.
import fs from "node:fs";
import { RAW } from "./lib.mjs";

const SALES = "data/listings/sales.json";
const OUTCOMES = "data/listings/sales-outcomes.csv";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const old = fs.existsSync(SALES) ? JSON.parse(fs.readFileSync(SALES, "utf8")).shows : {};
const shows = { ...old };

let seen = 0, withSeats = 0, changed = 0;
for (const file of fs.readdirSync(RAW).filter((f) => f.endsWith(".json"))) {
  const { listings = [] } = JSON.parse(fs.readFileSync(`${RAW}/${file}`, "utf8"));
  for (const l of listings) {
    if (!l.id || !l.start || l.longRun || l.note === "timed entry") continue;
    if (l.start.slice(0, 10) < TODAY) continue;
    seen++;
    const value = l.seats ? l.seats[0] : l.availability || null;
    if (l.seats) withSeats++;
    const s = (shows[l.id] ??= { t: l.title, v: l.venue, d: l.start, src: l.source, first: TODAY, h: [] });
    s.t = l.title;
    s.d = l.start;
    if (l.onSaleFrom) s.on = l.onSaleFrom;
    if (l.seats) s.cap = l.seats[1];
    if (value !== null && s.h.at(-1)?.[1] !== value) {
      s.h.push([TODAY, value]);
      changed++;
    }
  }
}

// Performances that have happened leave the live file for the outcomes log.
const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
if (!fs.existsSync(OUTCOMES)) {
  fs.writeFileSync(OUTCOMES, "id,title,venue,date,source,capacity,on_sale,first_seen,sold_out_on,final\n");
}
let moved = 0;
for (const [id, s] of Object.entries(shows)) {
  if (s.d.slice(0, 10) >= TODAY) continue;
  const soldOut = s.h.find(([, v]) => v === 0 || v === "sold out")?.[0] ?? "";
  const final = s.h.at(-1)?.[1] ?? "";
  fs.appendFileSync(OUTCOMES, [id, s.t, s.v, s.d, s.src, s.cap ?? "", s.on ?? "", s.first, soldOut, final].map(esc).join(",") + "\n");
  delete shows[id];
  moved++;
}

// One show per line, sorted, so each day's commit is a readable diff.
const lines = Object.keys(shows).sort().map((id) => `${JSON.stringify(id)}:${JSON.stringify(shows[id])}`);
fs.writeFileSync(SALES, `{"updated":${JSON.stringify(TODAY)},"shows":{\n${lines.join(",\n")}\n}}\n`);
console.log(`sales: ${seen} upcoming dates (${withSeats} with seat counts), ${changed} changes logged, ${moved} past dates moved to the outcomes log`);
