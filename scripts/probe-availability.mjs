// Which activities can carry an availability widget?
//
// The availability widget is the good one: a named product, a date picker and
// a live price, next to the paragraph that argues for it. There are four on the
// site and no idea whether the other 60-odd activities we link could take one.
//
// So ask. The embed resolves to availability.frame, and a product that cannot
// be booked through it renders an error or an empty shell rather than a picker.
// The tell is the frame's own content: a working one names the activity and
// carries a price and a date control.
import fs from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// Everything worth asking about: GetYourGuide's own top-43 export, plus every
// id already wired into the site.
const rows = fs.readFileSync(
  "C:\\Users\\rober\\Downloads\\Top activities (based on all filters).csv", "utf8")
  .split(/\r?\n/).slice(1).filter(Boolean)
  .map((l) => {
    const m = l.match(/^(\d+),(.*),(\d+),(\S+),([^,]*),([^,]*),"?([\d,]+)"?,London/);
    return m ? { id: m[1], title: m[2].replace(/^"|"$/g, ""), price: m[5], rating: m[6] } : null;
  }).filter(Boolean);

const mapped = JSON.parse(fs.readFileSync("data/gyg-tours.json", "utf8")).tours;
for (const [slug, t] of Object.entries(mapped))
  if (!rows.some((r) => r.id === t.tourId))
    rows.push({ id: t.tourId, title: t.title ?? slug, price: "", rating: "" });

const picks = JSON.parse(fs.readFileSync("data/gyg-queries.json", "utf8")).picks;
for (const set of Object.values(picks))
  for (const id of set.tourIds)
    if (!rows.some((r) => r.id === id)) rows.push({ id, title: "(from a pick set)", price: "", rating: "" });

console.error(`probing availability for ${rows.length} activities`);

async function probe(r) {
  const url =
    "https://widget.getyourguide.com/default/availability.frame" +
    `?tour_id=${r.id}&partner_id=WWP7I0R&locale_code=en-GB&currency=GBP&variant=horizontal`;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://londontravelgeek.com/" },
        signal: AbortSignal.timeout(45000),
      });
      const html = await res.text();
      // NEGATIVE CONTROL: tour_id=999999999 does not error. It renders a
      // generic "View activities at GetYourGuide / Find Things to Do" promo
      // box - the same silent degradation the search widgets do. So the test
      // for a live widget is that the frame echoes the id back AND does not
      // carry that fallback copy.
      const echoed = html.includes(`"tourId":${r.id}`) || html.includes(`tour_id=${r.id}`) ||
                     new RegExp(`-t${r.id}\\b`).test(html);
      const priced = /"price"|data-price|£|EUR|GBP/.test(html);
      const fallback = /Book tickets for top attractions around the world/i.test(html);
      const picker = !fallback && /Check availability/i.test(html);
      return { ...r, status: res.status, bytes: html.length, echoed, priced, picker };
    } catch (e) {
      if (a === 2) return { ...r, status: -1, err: String(e).slice(0, 60) };
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
}

const out = [];
for (const r of rows) {
  out.push(await probe(r));
  if (out.length % 15 === 0) console.error(`  ${out.length}/${rows.length}`);
  await new Promise((s) => setTimeout(s, 700));
}

fs.writeFileSync("data/gyg-availability-probe.json", JSON.stringify(out, null, 2));

const ok = out.filter((r) => r.echoed && r.picker);
const no = out.filter((r) => !(r.echoed && r.picker));
console.log(`\n${ok.length} of ${out.length} activities render an availability widget\n`);
if (no.length) {
  console.log("NOT bookable through the availability widget:");
  for (const r of no)
    console.log(`  ${r.id.padStart(8)}  status=${r.status} bytes=${r.bytes ?? 0} echoed=${r.echoed} picker=${r.picker}  ${String(r.title).slice(0, 52)}`);
}
console.log("\nbyte-size spread (a dead frame is much smaller):");
const sizes = out.map((r) => r.bytes ?? 0).sort((a, b) => a - b);
console.log(`  min ${sizes[0]}  median ${sizes[Math.floor(sizes.length / 2)]}  max ${sizes.at(-1)}`);
