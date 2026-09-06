// One-off: process and place the 5 September 2026 Notting Hill / Kensington walk.
//
// Frames are numbered by capture order (the contact sheets in the scratchpad use
// the same numbering), so a mapping entry reads as "frame 22 goes here, called
// that". Sizing follows what is already in src/assets/articles: 2000px on the
// long edge, quality 82, which lands the existing files around 500KB.
//
// sharp strips metadata unless told otherwise, which is the behaviour we want:
// every one of these carries GPS from the phone, and photographs of residential
// streets should not ship the coordinates of the doorstep they were taken from.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = "src/assets/articles";
const LONG_EDGE = 2000;

const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
const frame = (n) => path.join(SRC, files[n - 1]);

// frame -> [article slug, filename]
const PLAN = {
  // The new guide to the pastel streets.
  23: ["notting-hill-colourful-houses", "hillgate-place-corner.jpg"],
  19: ["notting-hill-colourful-houses", "farmer-street-terrace.jpg"],
  20: ["notting-hill-colourful-houses", "farmer-street-ivy-house.jpg"],
  21: ["notting-hill-colourful-houses", "hillgate-street.jpg"],
  22: ["notting-hill-colourful-houses", "hillgate-place-pink-house.jpg"],
  24: ["notting-hill-colourful-houses", "hillgate-place-pale-terrace.jpg"],
  25: ["notting-hill-colourful-houses", "hillgate-place-blue-and-green.jpg"],
  26: ["notting-hill-colourful-houses", "hillgate-place-terrace.jpg"],
  27: ["notting-hill-colourful-houses", "jameson-street-pink-corner.jpg"],
  15: ["notting-hill-colourful-houses", "lansdowne-road.jpg"],
  17: ["notting-hill-colourful-houses", "elgin-crescent.jpg"],
  9:  ["notting-hill-colourful-houses", "lancaster-road.jpg"],
  16: ["notting-hill-colourful-houses", "rosmead-garden-gate.jpg"],

  // Filming locations - the blue door, and the two rival "bookshops".
  11: ["london-filming-locations", "notting-hill-blue-door.jpg"],
  12: ["london-filming-locations", "notting-hill-bookshop-blenheim-crescent.jpg"],
  13: ["london-filming-locations", "travel-bookshop-142-portobello-road.jpg"],

  // Notting Hill area guide.
  4:  ["notting-hill-area-guide", "portobello-market-acklam-road.jpg"],
  6:  ["notting-hill-area-guide", "portobello-vintage-under-the-westway.jpg"],
  14: ["notting-hill-area-guide", "portobello-road-union-jack.jpg"],
  18: ["notting-hill-area-guide", "the-distillery-portobello-road.jpg"],

  // Markets.
  1:  ["best-london-markets", "portobello-road-market-crowd.jpg"],
  8:  ["best-london-markets", "portobello-green-record-stall.jpg"],

  // Kensington.
  28: ["kensington-area-guide", "churchill-arms-flowers.jpg"],
  29: ["kensington-area-guide", "holland-park-formal-garden.jpg"],
  30: ["kensington-area-guide", "holland-park-belvedere.jpg"],

  // South Kensington.
  34: ["south-kensington-area-guide", "launceston-place-mews.jpg"],
  33: ["south-kensington-area-guide", "launceston-place.jpg"],
  36: ["south-kensington-area-guide", "exhibition-road-dining.jpg"],
  37: ["south-kensington-area-guide", "victoria-and-albert-museum-entrance.jpg"],
  38: ["south-kensington-area-guide", "brompton-oratory.jpg"],

  // Plaques.
  32: ["london-blue-plaques", "ts-eliot-blue-plaque.jpg"],
};

let done = 0;
for (const [n, [slug, name]] of Object.entries(PLAN)) {
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  const meta = await sharp(frame(+n)).metadata();
  // Portrait frames are resized on height so a tall photo does not end up 2000px
  // deep and three times the file size of everything around it.
  const portrait = (meta.orientation ?? 1) >= 5 ? meta.width < meta.height : meta.height > meta.width;
  await sharp(frame(+n))
    .rotate()
    .resize(portrait ? { height: LONG_EDGE } : { width: LONG_EDGE })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`frame ${String(n).padStart(2)} -> ${slug}/${name}  ${kb}KB`);
  done++;
}
console.log(`\n${done} placed, ${files.length - done} left over`);
