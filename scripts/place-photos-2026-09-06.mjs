// Place the 6 September Kensington/Chelsea/Belgravia walk.
//
// Several of these REPLACE credited third-party photographs with our own, which
// is the point of the trip: a Flickr photo of the Saatchi Gallery under a CC
// licence is fine, and a photograph we took is better, because it carries no
// attribution line and cannot be withdrawn.
//
// Frame numbers match the contact sheets in the scratchpad and are capture
// order, which is also walking order.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = "src/assets/articles";
const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
const frame = (n) => path.join(SRC, files[n - 1]);

// frame -> [article slug, filename]
const PLAN = {
  // Kensington. Frame 5 REPLACES the hero credited to Eusebius.
  5:  ["kensington-area-guide", "victoria-and-kensington-palace.jpg"],
  4:  ["kensington-area-guide", "sunken-garden-kensington-palace.jpg"],
  2:  ["kensington-area-guide", "kensington-palace-pavilion.jpg"],
  3:  ["kensington-area-guide", "kensington-palace-gardens.jpg"],

  // South Kensington. Replaces the existing Royal Albert Hall exterior.
  6:  ["south-kensington-area-guide", "royal-albert-hall.jpg"],

  // Chelsea. Frame 15 REPLACES the Saatchi Gallery credited to Jim Linwood.
  15: ["chelsea-area-guide", "saatchi-gallery.jpg"],
  11: ["chelsea-area-guide", "bywater-street.jpg"],
  12: ["chelsea-area-guide", "bywater-street-doors.jpg"],
  10: ["chelsea-area-guide", "bywater-street-yellow-house.jpg"],
  9:  ["chelsea-area-guide", "smith-terrace.jpg"],
  13: ["chelsea-area-guide", "markham-square.jpg"],
  14: ["chelsea-area-guide", "duke-of-york-square.jpg"],
  16: ["chelsea-area-guide", "duke-of-york-square-shops.jpg"],
  18: ["chelsea-area-guide", "pavilion-road.jpg"],
  7:  ["chelsea-area-guide", "my-old-dutch-kings-road.jpg"],

  // Bakeries. Frame 17 becomes the hero, replacing a stock photo credited to
  // Valeria Boltneva; frame 19 is Peggy Porschen, which the guide does not
  // currently cover at all.
  17: ["best-bakeries-london", "buns-from-home.jpg"],
  19: ["best-bakeries-london", "peggy-porschen.jpg"],

  // Cycling.
  1:  ["cycling-bike-hire-scooters-london", "santander-cycles-docking-station.jpg"],

  // Belgravia has no guide of its own yet, so these land with the pizza guide
  // and the Chelsea one rather than being held back for a page that may never
  // exist. Eccleston Yards is genuinely good and worth having on file.
  8:  ["best-pizza-london", "pizza-pilgrims-kings-road.jpg"],
  22: ["chelsea-area-guide", "eccleston-yards.jpg"],
  21: ["chelsea-area-guide", "eccleston-yards-tables.jpg"],
  20: ["chelsea-area-guide", "belgravia-corner.jpg"],
};

let done = 0;
for (const [n, [slug, name]] of Object.entries(PLAN)) {
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  const existed = fs.existsSync(dest);
  const meta = await sharp(frame(+n)).metadata();
  const portrait = (meta.orientation ?? 1) >= 5 ? meta.width < meta.height : meta.height > meta.width;
  await sharp(frame(+n))
    .rotate()
    .resize(portrait ? { height: 2000 } : { width: 2000 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest + ".tmp");
  fs.renameSync(dest + ".tmp", dest);
  console.log(
    `frame ${String(n).padStart(2)} -> ${slug}/${name}` +
      `  ${Math.round(fs.statSync(dest).size / 1024)}KB${existed ? "  (REPLACED)" : ""}`,
  );
  done++;
}
console.log(`\n${done} placed, ${files.length - done} left over`);
