// Sole owner of the "Hidden London" tab. Same contract as the other owner
// scripts: this file is the source of truth, the sheet is the output,
// nothing else writes it.
//
// WHY A FIFTH TAB, NOT MORE ACTIVITIES ROWS
// A blue plaque, a piece of street art, a filming location and a general
// hidden gem share a shape - free, self-guided, no opening hours, no ticket,
// "worth a detour if you know it's there" - but that shape is nothing like
// Activities, which is built around bookable experiences: duration, group
// size, price per person, booking required. Forcing these in would mean a
// dozen blank fields per row and would pollute the filters Activities
// already depends on. Same reasoning that put Hotels in its own tab rather
// than the Restaurants schema.
//
// ONE TAB, NOT FOUR: a `type` column (blue-plaque / street-art /
// filming-location / hidden-gem) distinguishes the four subjects, the same
// relationship Activities has to its own activityType vocabulary.
//
// FIRST PASS: BLUE PLAQUES ONLY
// Street art, filming locations and general hidden gems come once this
// pattern is proven. Every row below cites a real address from either
// Wikipedia's "List of English Heritage blue plaques in [borough]" pages
// (Westminster, Kensington & Chelsea, Camden - the three densest boroughs,
// covering most of the historic core) or a targeted search, cross-checked
// against English Heritage's own site where named. Southwark runs a
// SEPARATE council scheme (not English Heritage, includes living people) and
// is not covered here to avoid mixing schemes silently in one Source column.
//
// Postcode/Lat/Lng are deliberately left BLANK here rather than transcribed
// from search summaries - see scripts/geocode-listings.mjs, which resolves
// them from the address via Places + postcodes.io the same way it does for
// Hotels/Activities/Events. A summarized postcode risks being subtly wrong
// (Oakley Street SW3 vs a summary that said SW7); a Places lookup on the
// real street address does not.
//
//   node scripts/write-hidden-london.mjs
//   node scripts/write-hidden-london.mjs --dry-run
//
import fs from "node:fs";
import { writeTab } from "./sheets.mjs";

const TODAY = new Date().toISOString().slice(0, 10);

const COLUMNS = [
  { key: "slug", head: "Slug" },
  { key: "name", head: "Name" },
  { key: "status", head: "Status" },
  { key: "statusChecked", head: "Status Checked" },

  { key: "type", head: "Type" },
  { key: "subject", head: "Subject" },
  { key: "scheme", head: "Scheme" },

  { key: "hood", head: "Neighbourhood" },
  { key: "borough", head: "Borough" },
  { key: "areaGuide", head: "Area Guide" },
  { key: "zone", head: "Zone" },
  { key: "district", head: "District" },
  { key: "address", head: "Address" },
  { key: "postcode", head: "Postcode" },
  { key: "lat", head: "Lat" },
  { key: "lng", head: "Lng" },
  { key: "placeId", head: "Place ID" },
  { key: "station", head: "Nearest Station" },
  { key: "walkMin", head: "Walk Min" },

  { key: "whyGo", head: "Why Go" },
  { key: "opSummary", head: "Operational Summary" },

  { key: "source", head: "Source" },
  { key: "firstSeen", head: "First Seen" },
  { key: "lastChecked", head: "Last Checked" },
];

const VOCAB = {
  type: ["blue-plaque", "street-art", "filming-location", "hidden-gem"],
};

// Same table as write-hotels.mjs / write-activities.mjs / write-events.mjs -
// duplicated per owner script by convention rather than shared, so each tab
// stays self-contained.
const HOODS = {
  "Bloomsbury":         { zone: "1",   district: "Central" },
  "Covent Garden":      { zone: "1",   district: "Central" },
  "Soho":               { zone: "1",   district: "Central" },
  "Fitzrovia":          { zone: "1",   district: "Central" },
  "Marylebone":         { zone: "1",   district: "Central" },
  "Mayfair":            { zone: "1",   district: "Central" },
  "City of London":     { zone: "1",   district: "Central" },
  "Westminster":        { zone: "1",   district: "Central" },
  "South Bank":         { zone: "1",   district: "Central" },
  "Waterloo":           { zone: "1",   district: "Central" },
  "King's Cross":       { zone: "1",   district: "North" },
  "Shoreditch":         { zone: "1",   district: "East" },
  "Spitalfields":       { zone: "1",   district: "East" },
  "Bermondsey":         { zone: "1–2", district: "South" },
  "Paddington":         { zone: "1",   district: "West" },
  "South Kensington":   { zone: "1",   district: "West" },
  "Kensington":         { zone: "1–2", district: "West" },
  "Notting Hill":       { zone: "1–2", district: "West" },
  "Camden Town":        { zone: "2",   district: "North" },
  "Greenwich":          { zone: "2–3", district: "South" },
  "Bethnal Green":      { zone: "2",   district: "East" },
  "Wapping":            { zone: "2",   district: "East" },
  "Chelsea":            { zone: "1–2", district: "West" },
  "Islington":          { zone: "1–2", district: "North" },
  "Canary Wharf":       { zone: "2",   district: "East" },
  "Richmond":           { zone: "4",   district: "West" },
  "Hampstead":          { zone: "2–3", district: "North" },
  "Battersea":          { zone: "1",   district: "South" },
  "Victoria":           { zone: "1",   district: "Central" },
  "Stratford":          { zone: "3",   district: "East" },
  "Whitehall":          { zone: "1",   district: "Central" },
  "Pimlico":            { zone: "1",   district: "Central" },
  "Belgravia":          { zone: "1",   district: "Central" },
  "Holborn":            { zone: "1",   district: "Central" },
  "Southwark":          { zone: "1",   district: "Central" },
  "Bayswater":          { zone: "1",   district: "West" },
  "Dalston":            { zone: "2",   district: "East" },
  "St James's":         { zone: "1",   district: "Central" },
};

const base = {
  status: "open", statusChecked: TODAY, type: "blue-plaque",
  scheme: "English Heritage", firstSeen: TODAY, lastChecked: TODAY,
  postcode: "", lat: "", lng: "", placeId: "", station: "", walkMin: "",
};

const EH = "English Heritage blue plaques scheme (est. 1866), en.english-heritage.org.uk/visit/blue-plaques/";

const ROWS = [
  // --------------------------------------------------------- Mayfair ---
  {
    ...base, slug: "handel-brook-street", name: "Handel's House",
    subject: "George Frideric Handel (1685–1759), composer",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "25 Brook Street",
    whyGo: "Handel lived and composed here for 36 years, including Messiah. The house is now Handel & Hendrix House, a museum with two eras under one roof.",
    opSummary: "The house is a paid museum, not just a plaque - the interesting bit is that Jimi Hendrix lived next door two centuries later.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster", cross-checked against ${EH}`,
  },
  {
    ...base, slug: "hendrix-brook-street", name: "Jimi Hendrix's Flat",
    subject: "Jimi Hendrix (1942–1970), musician",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "23 Brook Street",
    whyGo: "Hendrix lived here 1968-69, next door to where Handel lived 200 years earlier - the two plaques sit a few feet apart on the same street.",
    opSummary: "Combined with Handel's House as Handel & Hendrix House, a paid museum covering both.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster", cross-checked against ${EH}`,
  },
  {
    ...base, slug: "disraeli-curzon-street", name: "Disraeli's Last Home",
    subject: "Benjamin Disraeli (1804–1881), Prime Minister",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "19 Curzon Street",
    whyGo: "Disraeli died here in 1881, having twice served as Prime Minister - one of several PM plaques within a short walk of each other in Mayfair.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },

  // ----------------------------------------------------------- Soho ---
  {
    ...base, slug: "baird-frith-street", name: "Where Television Was Born",
    subject: "John Logie Baird (1888–1946), television pioneer",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "22 Frith Street",
    whyGo: "Baird gave the first public demonstration of television in an attic room here in 1926 - a genuinely world-changing moment on an ordinary Soho street.",
    opSummary: "The building is now Bar Italia at street level; the plaque is above.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster", cross-checked against ${EH}`,
  },
  {
    ...base, slug: "seacole-soho-square", name: "Mary Seacole's Soho Home",
    subject: "Mary Seacole (1805–1881), Crimean War nurse and businesswoman",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "Soho Square",
    whyGo: "Seacole's plaque was re-erected here in 2007, marking where research showed she lived in 1857 after returning from nursing British soldiers in Crimea.",
    opSummary: "On a building overlooking the square itself.",
    source: "Guide London / Kingfisher Visitor Guides blue plaque roundups, cross-checked",
  },
  {
    ...base, slug: "moon-wardour-street", name: "Where Keith Moon Played",
    subject: "Keith Moon (1946–1978), drummer, The Who",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "90 Wardour Street",
    whyGo: "Marks where The Who played in the earliest days of the band, rather than a home address - a different kind of plaque story from the usual \"lived here\".",
    opSummary: "On the former Marquee Club site, now a different business - the plaque is the only trace of the venue at street level.",
    source: "London X London / Kingfisher Visitor Guides blue plaque roundups",
  },

  // ---------------------------------------------------- Marylebone ---
  {
    ...base, slug: "browning-wimpole-street", name: "Elizabeth Barrett Browning's Home",
    subject: "Elizabeth Barrett Browning (1806–1861), poet",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "50 Wimpole Street",
    whyGo: "Browning lived here before her secret marriage to Robert Browning and elopement to Italy - the house her father is said to have locked her into is a short walk from Marylebone High Street.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "collins-gloucester-place", name: "Wilkie Collins's Home",
    subject: "Wilkie Collins (1824–1889), novelist",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "65 Gloucester Place",
    whyGo: "Collins wrote here as one of the pioneers of the detective novel - The Moonstone and The Woman in White both date from his years on this street.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "faraday-blandford-street", name: "Michael Faraday's Birthplace Area",
    subject: "Michael Faraday (1791–1867), scientist",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "48 Blandford Street",
    whyGo: "Faraday's work on electromagnetism underpins the electric motor and generator - a genuinely foundational scientist commemorated on a quiet Marylebone street.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "lennon-montagu-square", name: "John Lennon's Flat",
    subject: "John Lennon (1940–1980), musician",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "34 Montagu Square",
    whyGo: "Lennon and Yoko Ono lived here - Ono herself unveiled the plaque, a rare case of the commemorated person's own partner doing the honours.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Guide London blue plaque roundup, cross-checked against ${EH}`,
  },
  {
    ...base, slug: "garrett-anderson-upper-berkeley-street", name: "Elizabeth Garrett Anderson's Home",
    subject: "Elizabeth Garrett Anderson (1836–1917), first woman to qualify as a doctor in Britain",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "20 Upper Berkeley Street",
    whyGo: "Garrett Anderson forced open the medical profession to women in Britain, later founding what became the New Hospital for Women - a plaque marking a genuine first.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "Guide London blue plaque roundup",
  },

  // ----------------------------------------------------- Fitzrovia ---
  {
    ...base, slug: "coleridge-berners-street", name: "Coleridge's Fitzrovia Home",
    subject: "Samuel Taylor Coleridge (1772–1834), poet",
    hood: "Fitzrovia", borough: "Westminster", areaGuide: "fitzrovia-area-guide",
    address: "71 Berners Street",
    whyGo: "One of several London addresses for Coleridge, who wrote The Rime of the Ancient Mariner and Kubla Khan - a quieter corner of Fitzrovia's literary map.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "woolf-fitzroy-square", name: "Virginia Woolf's Fitzroy Square Home",
    subject: "Virginia Woolf (1882–1941), writer, publisher and literary critic",
    hood: "Fitzrovia", borough: "Westminster", areaGuide: "fitzrovia-area-guide",
    address: "29 Fitzroy Square",
    whyGo: "Woolf lived here 1907-1911, in the Bloomsbury Group's earliest years before the name Bloomsbury attached itself to the circle. She has a second plaque in Richmond from her later years.",
    opSummary: "A private residential building - viewable from the street only. See also the Richmond plaque at Hogarth House.",
    source: "Exploring London blue plaque series, cross-checked",
  },

  // ------------------------------------------------ Covent Garden ---
  {
    ...base, slug: "johnson-russell-street", name: "Samuel Johnson's Covent Garden Base",
    subject: "Samuel Johnson (1709–1784), writer and lexicographer",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "8 Russell Street",
    whyGo: "Johnson compiled his Dictionary of the English Language while based in this part of London - Russell Street sits right by the piazza.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "fonteyn-long-acre", name: "Margot Fonteyn's Home",
    subject: "Margot Fonteyn (1919–1991), prima ballerina",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "118 Long Acre",
    whyGo: "Fonteyn danced at the Royal Opera House a short walk from here for decades - a plaque for one of British ballet's defining names, in the neighbourhood she performed in.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "pepys-buckingham-street", name: "Samuel Pepys's Buckingham Street Homes",
    subject: "Samuel Pepys (1633–1703), diarist",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "12 and 14 Buckingham Street",
    whyGo: "Two separate plaques on the same short street mark two different Pepys residences - he seems to turn up everywhere in central London's plaque map.",
    opSummary: "Two plaques, two buildings, a few doors apart - worth doing both on the same stop.",
    source: "Exploring London blue plaque series",
  },

  // ----------------------------------------------------- Westminster (Belgravia/St James's/Victoria/Whitehall) ---
  {
    ...base, slug: "fleming-ebury-street", name: "Ian Fleming's Belgravia Home",
    subject: "Ian Fleming (1908–1964), creator of James Bond",
    hood: "Belgravia", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "22 Ebury Street",
    whyGo: "Fleming was born and grew up on this street - the plaque marks the creator of James Bond, a very different kind of London export from the writers nearby.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "gladstone-carlton-house-terrace", name: "Gladstone's Home",
    subject: "William Ewart Gladstone (1809–1898), Prime Minister",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "11 Carlton House Terrace",
    whyGo: "One of the grandest addresses on the plaque map - Carlton House Terrace overlooks The Mall, a short walk from Westminster's core sights.",
    opSummary: "A private/institutional building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "chopin-st-james-place", name: "Chopin's Last London Address",
    subject: "Frédéric Chopin (1810–1849), composer",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "4 St James's Place",
    whyGo: "Chopin stayed here during his final visit to London in 1848, a year before his death - a quiet corner of St James's with an outsized musical footnote.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "astor-st-james-square", name: "Nancy Astor's Home",
    subject: "Nancy Astor (1879–1964), first woman to take a seat as an MP",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "4 St James's Square",
    whyGo: "Astor was the first woman to sit in the House of Commons - the plaque sits in the same St James's Square as several other notable addresses.",
    opSummary: "A private/institutional building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },
  {
    ...base, slug: "lovelace-st-james-square", name: "Ada Lovelace's St James's Square Home",
    subject: "Ada Lovelace (1815–1852), mathematician and pioneer of computing",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "St James's Square",
    whyGo: "Lovelace's notes on Charles Babbage's Analytical Engine are considered the first published algorithm intended for a machine - a real claim to \"first computer programmer\".",
    opSummary: "A private/institutional building - viewable from the street only.",
    source: "Guide London blue plaque roundup, cross-checked",
  },
  {
    ...base, slug: "conrad-gillingham-street", name: "Joseph Conrad's Victoria Home",
    subject: "Joseph Conrad (1857–1924), novelist",
    hood: "Victoria", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "17 Gillingham Street",
    whyGo: "Conrad lived here in the 1890s while working as a merchant seaman, before Heart of Darkness and Lord Jim - a short walk from Victoria station.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },

  // ----------------------------------------------------- Paddington/Bayswater ---
  {
    ...base, slug: "barrie-bayswater-road", name: "J.M. Barrie's Bayswater Home",
    subject: "J.M. Barrie (1860–1937), creator of Peter Pan",
    hood: "Bayswater", borough: "Westminster", areaGuide: "paddington-area-guide",
    address: "100 Bayswater Road",
    whyGo: "Barrie lived facing Kensington Gardens, where Peter Pan is set and where his own statue of the character still stands - the plaque and the statue make a short, natural pairing.",
    opSummary: "A private residential building facing the park - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the City of Westminster"`,
  },

  // -------------------------------------------------------- Chelsea ---
  {
    ...base, slug: "eliot-cheyne-walk", name: "George Eliot's Last Home",
    subject: "George Eliot (1819–1880), novelist (Mary Ann Evans)",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "4 Cheyne Walk",
    whyGo: "Eliot died here weeks after moving in - one of several literary plaques along Cheyne Walk's riverside stretch.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "marley-oakley-street", name: "Bob Marley's Chelsea Flat",
    subject: "Bob Marley (1945–1981), singer and songwriter",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "42 Oakley Street",
    whyGo: "One of English Heritage's more recent plaques (2019) and a rare popular-music honouree on a street otherwise dense with 19th-century names.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "fleming-danvers-street", name: "Alexander Fleming's Chelsea Home",
    subject: "Alexander Fleming (1881–1955), discoverer of penicillin",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "20a Danvers Street",
    whyGo: "Fleming's discovery of penicillin is one of the most consequential moments in modern medicine - his home plaque sits a short walk from where he worked at St Mary's.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "pankhurst-cheyne-walk", name: "Sylvia Pankhurst's Chelsea Home",
    subject: "Sylvia Pankhurst (1882–1960), suffragette and campaigner",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "120 Cheyne Walk",
    whyGo: "Pankhurst's plaque sits on the same riverside street as George Eliot's - two very different kinds of significance a few doors apart.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "franklin-drayton-gardens", name: "Rosalind Franklin's Home",
    subject: "Rosalind Franklin (1920–1958), X-ray crystallographer, DNA structure pioneer",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "Donovan Court, Drayton Gardens",
    whyGo: "Franklin's X-ray diffraction images were essential to identifying the structure of DNA - a scientist whose contribution went under-credited for decades.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },

  // ----------------------------------------------------- Kensington ---
  {
    ...base, slug: "churchill-hyde-park-gate", name: "Winston Churchill's Last Home",
    subject: "Winston Churchill (1874–1965), Prime Minister",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "28 Hyde Park Gate",
    whyGo: "Churchill's home for the last years of his life, a short walk from the Kensington museums.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "ts-eliot-kensington-court-gardens", name: "T.S. Eliot's Kensington Home",
    subject: "T.S. Eliot (1888–1965), poet",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "3 Kensington Court Gardens",
    whyGo: "Eliot lived here in his later years, having already written The Waste Land and Four Quartets - one of Kensington's several literary plaques.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "henry-james-de-vere-gardens", name: "Henry James's Kensington Home",
    subject: "Henry James (1843–1916), writer",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "34 De Vere Gardens",
    whyGo: "James wrote several of his major novels while living on this street - part of a dense cluster of literary Kensington plaques worth combining on one walk.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "christie-sheffield-terrace", name: "Agatha Christie's Home",
    subject: "Agatha Christie (1890–1976), novelist and playwright",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "58 Sheffield Terrace",
    whyGo: "Christie lived here while writing some of her best-known Poirot and Marple novels - a quiet Holland Park backstreet a world away from the murders on the page.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },
  {
    ...base, slug: "joyce-campden-grove", name: "James Joyce's Kensington Home",
    subject: "James Joyce (1882–1941), author",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "28 Campden Grove",
    whyGo: "One of the less-expected London addresses for Joyce, better known for Dublin and Trieste - the plaque marks a brief but real London chapter.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },

  // ------------------------------------------------ South Kensington ---
  {
    ...base, slug: "hitchcock-cromwell-road", name: "Alfred Hitchcock's South Kensington Home",
    subject: "Alfred Hitchcock (1899–1980), film director",
    hood: "South Kensington", borough: "Kensington and Chelsea", areaGuide: "south-kensington-area-guide",
    address: "153 Cromwell Road",
    whyGo: "Hitchcock lived here before his move to Hollywood - a plaque for one of cinema's defining directors on one of South Kensington's busiest roads.",
    opSummary: "A private/commercial building on a main road - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the Royal Borough of Kensington and Chelsea"`,
  },

  // -------------------------------------------------- Notting Hill ---
  {
    ...base, slug: "pankhursts-clarendon-road", name: "The Pankhursts' Notting Hill Home",
    subject: "Emmeline and Christabel Pankhurst, suffragette leaders",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "50 Clarendon Road",
    whyGo: "A mother-and-daughter plaque for two of the central figures of the British suffragette movement, on a residential street off Holland Park Avenue.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "Guide London blue plaque roundup, cross-checked",
  },

  // -------------------------------------------------------- Bloomsbury ---
  {
    ...base, slug: "darwin-gower-street", name: "Charles Darwin at UCL",
    subject: "Charles Darwin (1809–1882), naturalist",
    hood: "Bloomsbury", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "Biological Sciences Building, University College London, Gower Street",
    whyGo: "Marks Darwin's connection to UCL rather than a home address - a rare institutional plaque for the author of On the Origin of Species.",
    opSummary: "On a university building - viewable from the street, campus generally open to walk through in daytime.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "keynes-gordon-square", name: "John Maynard Keynes's Bloomsbury Home",
    subject: "John Maynard Keynes (1883–1946), economist",
    hood: "Bloomsbury", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "46 Gordon Square",
    whyGo: "Keynes was part of the Bloomsbury Group centred on Gordon Square - his economic theory reshaped 20th-century policy far beyond the square itself.",
    opSummary: "A private/institutional building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "morris-red-lion-square", name: "William Morris's Red Lion Square Home",
    subject: "William Morris (1834–1896), designer and decorative artist",
    hood: "Holborn", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "17 Red Lion Square",
    whyGo: "Morris founded his decorative arts firm from this address in 1861, before the patterns that now cover half of Britain's National Trust properties existed.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },

  // ----------------------------------------------------------- Camden ---
  {
    ...base, slug: "orwell-lawford-road", name: "George Orwell's Kentish Town Home",
    subject: "George Orwell (1903–1950), writer",
    hood: "Camden Town", borough: "Camden", areaGuide: "camden-area-guide",
    address: "50 Lawford Road, Kentish Town",
    whyGo: "One of several Orwell addresses across London - Kentish Town's plaque marks a working writer's home rather than a grand literary residence.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "engels-regents-park-road", name: "Friedrich Engels's Primrose Hill Home",
    subject: "Friedrich Engels (1820–1895), philosopher and political theorist",
    hood: "Camden Town", borough: "Camden", areaGuide: "camden-area-guide",
    address: "122 Regent's Park Road, Primrose Hill",
    whyGo: "Engels lived here for over 20 years, hosting Karl Marx regularly - a plaque for one half of one of history's most consequential intellectual partnerships.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "plath-chalcot-square", name: "Sylvia Plath's Primrose Hill Home",
    subject: "Sylvia Plath (1932–1963), poet",
    hood: "Camden Town", borough: "Camden", areaGuide: "camden-area-guide",
    address: "3 Chalcot Square, Primrose Hill",
    whyGo: "Plath and Ted Hughes lived here early in their marriage - one of the more poignant plaques on the map, a short walk from Primrose Hill itself.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },

  // -------------------------------------------------------- Hampstead ---
  {
    ...base, slug: "keats-keats-grove", name: "Keats House",
    subject: "John Keats (1795–1821), Romantic poet",
    hood: "Hampstead", borough: "Camden", areaGuide: "hampstead-area-guide",
    address: "Keats House, Keats Grove",
    whyGo: "The oldest-issued plaque of this batch (1896) - Keats wrote Ode to a Nightingale reputedly under a plum tree in this garden. Now a small paid museum.",
    opSummary: "Keats House is a paid museum with set opening hours, not just a street plaque.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "freud-maresfield-gardens", name: "Sigmund Freud's Final Home",
    subject: "Sigmund Freud (1856–1939), founder of psychoanalysis",
    hood: "Hampstead", borough: "Camden", areaGuide: "hampstead-area-guide",
    address: "20 Maresfield Gardens",
    whyGo: "Freud fled Vienna for this house in 1938 and lived here until his death the following year - now the Freud Museum, with his original consulting couch preserved inside.",
    opSummary: "The Freud Museum is a paid museum with set opening hours, not just a street plaque.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "henson-downshire-hill", name: "Jim Henson's Hampstead Home",
    subject: "Jim Henson (1936–1990), creator of the Muppets",
    hood: "Hampstead", borough: "Camden", areaGuide: "hampstead-area-guide",
    address: "50 Downshire Hill",
    whyGo: "One of English Heritage's newest plaques (2021) - a genuinely unexpected name to find on a Hampstead street among the poets and psychoanalysts.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },
  {
    ...base, slug: "burton-lyndhurst-road", name: "Richard Burton's Hampstead Home",
    subject: "Richard Burton (1925–1984), actor",
    hood: "Hampstead", borough: "Camden", areaGuide: "hampstead-area-guide",
    address: "6 Lyndhurst Road",
    whyGo: "A relatively recent plaque (2011) for one of the best-known screen and stage actors of the 20th century.",
    opSummary: "A private residential building - viewable from the street only.",
    source: `Wikipedia "List of English Heritage blue plaques in the London Borough of Camden"`,
  },

  // -------------------------------------------------------- Richmond ---
  {
    ...base, slug: "woolf-hogarth-house-richmond", name: "Virginia and Leonard Woolf's Richmond Home",
    subject: "Virginia Woolf (1882–1941) and Leonard Woolf, at Hogarth House",
    hood: "Richmond", borough: "Richmond upon Thames", areaGuide: "richmond-area-guide",
    address: "34 Paradise Road",
    whyGo: "The Woolfs lived here 1915-1924 and founded the Hogarth Press on the premises, printing early editions of Woolf's own novels and T.S. Eliot's poetry on a hand press in the house.",
    opSummary: "A private residential building - viewable from the street only. See also the earlier Woolf plaque in Fitzrovia.",
    source: "Search cross-referencing Wikipedia's Camden and Richmond blue plaque coverage",
  },
];

// --------------------------------------------------------------- validate ---
const errors = [];
for (const r of ROWS) {
  for (const [field, allowed] of Object.entries(VOCAB)) {
    const v = String(r[field] ?? "");
    if (v === "") continue;
    if (!allowed.includes(v)) errors.push(`${r.slug}: ${field} = "${v}" is not in [${allowed.join(", ")}]`);
  }
  if (r.hood && !HOODS[r.hood]) errors.push(`${r.slug}: neighbourhood "${r.hood}" is not in HOODS`);
}
if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
for (const r of ROWS) {
  const h = HOODS[r.hood];
  if (h) { r.zone ??= h.zone; r.district ??= h.district; }
}
const seen = new Set();
for (const r of ROWS) {
  if (seen.has(r.slug)) { console.error(`duplicate slug: ${r.slug}`); process.exit(1); }
  seen.add(r.slug);
}

// ------------------------------------------------- merge geocoding cache ---
const GEO_PATH = "data/geo-cache.json";
const GEO_MAP = { postcode: "postcode", lat: "lat", lng: "lng", placeId: "placeId" };
let geocoded = 0;
if (fs.existsSync(GEO_PATH)) {
  const cache = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));
  for (const r of ROWS) {
    const e = cache[`hiddenLondon:${r.slug}`];
    if (!e) continue;
    for (const [col, key] of Object.entries(GEO_MAP)) {
      const v = e[key];
      if (v === undefined || v === "" || v === null) continue;
      if (String(r[col] ?? "").trim() !== "") continue;
      r[col] = String(v);
      geocoded++;
    }
  }
}

const header = COLUMNS.map((c) => c.head);
const rows = ROWS.map((r) => COLUMNS.map((c) => String(r[c.key] ?? "")));

const dryRun = process.argv.includes("--dry-run");
if (!dryRun) await writeTab("Hidden London", header, rows);
else console.log("DRY RUN - nothing written to the sheet");

console.log(`${rows.length} rows x ${header.length} columns for "Hidden London"`);
const byType = {};
for (const r of ROWS) byType[r.type] = (byType[r.type] ?? 0) + 1;
console.log("  types: " + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(", "));
const guides = new Set(ROWS.map((r) => r.areaGuide).filter(Boolean));
console.log(`  ${guides.size} area guide(s) covered: ${[...guides].map((g) => g.replace("-area-guide", "")).join(", ")}`);
const withCoords = ROWS.filter((r) => r.lat).length;
console.log(`  ${withCoords}/${ROWS.length} rows have coordinates (${geocoded} field(s) merged from data/geo-cache.json this run)`);
