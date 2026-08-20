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
// Postcode/Lat/Lng are deliberately left BLANK for the FIRST-PASS rows below
// rather than transcribed from search summaries - see scripts/geocode-listings.mjs,
// which resolves them from the address via Places + postcodes.io the same way
// it does for Hotels/Activities/Events. A summarized postcode risks being
// subtly wrong (Oakley Street SW3 vs a summary that said SW7); a Places
// lookup on the real street address does not.
//
// SECOND PASS ("very famous only"): sourced from the public ArcGIS feature
// service backing arcgis.com/home/item.html?id=b69ac4493cf64e088f4883c637933e55
// (933 London plaques, all schemes) - services.arcgis.com/WQ9KVmV6xGGMnCiQ/
// arcgis/rest/services/London_Plaques_Updated_2/FeatureServer/0. That service
// already carries the postcode as part of its Address field, so those rows
// have Postcode filled in directly rather than left for Places to resolve -
// there is no ambiguity to resolve when the source dataset already states it.
// Filtered hard to names anyone would recognise without a Wikipedia link;
// the source has hundreds of scientifically/historically significant but
// NOT famous names that are deliberately excluded here. `scheme` is set per
// row from the source's Organisatn field - not every plaque is English
// Heritage's own; several predate it (London County Council, Greater London
// Council), which EH's own scheme history treats as the same continuous
// lineage it now administers.
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
  // Not one of the 27 area guides yet - added anyway per the standing rule
  // that sheet content isn't limited to areas with a guide page already.
  "Vauxhall":           { zone: "1–2", district: "South" },
  "Walthamstow":        { zone: "3",   district: "East" },
  "Charlton":           { zone: "3–4", district: "South" },
  "Peckham":            { zone: "2",   district: "South" },
  "Cricklewood":        { zone: "3",   district: "North" },
  "Crouch End":         { zone: "3",   district: "North" },
  "Clerkenwell":        { zone: "1",   district: "Central" },
  "Lewisham":           { zone: "2–3", district: "South" },
  "Lambeth":            { zone: "1–2", district: "South" },
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

  // =================== SECOND PASS: "very famous only" ===================
  // Sourced from the ArcGIS feature service, see header note. Address and
  // Postcode below are split from the source's single Address field, not
  // re-researched - the source is the authority on both.
  {
    ...base, slug: "wodehouse-dunraven-street", name: "P.G. Wodehouse's Mayfair Home",
    subject: "P.G. Wodehouse (1881–1975), writer, creator of Jeeves and Wooster",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "17 Dunraven Street", postcode: "W1K 7EG",
    whyGo: "Wodehouse lived here before the Jeeves and Wooster novels made him one of the most quoted comic writers in English.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "nightingale-south-street", name: "Florence Nightingale's Mayfair Home",
    subject: "Florence Nightingale (1820–1910), founder of modern nursing",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "10 South Street", postcode: "W1K 1DE",
    whyGo: "Nightingale lived here for the last decades of her life, having already reformed nursing practice after the Crimean War.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (London County Council)",
    scheme: "London County Council",
  },
  {
    ...base, slug: "turing-warrington-crescent", name: "Alan Turing's Birthplace",
    subject: "Alan Turing (1912–1954), mathematician and codebreaker",
    hood: "Paddington", borough: "Westminster", areaGuide: "paddington-area-guide",
    address: "2 Warrington Crescent", postcode: "W9 1ER",
    whyGo: "Turing was born here - the father of theoretical computer science and the codebreaker whose work at Bletchley Park is credited with shortening the Second World War.",
    opSummary: "A private residential building (now a hotel) - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "mary-shelley-chester-square", name: "Mary Shelley's Belgravia Home",
    subject: "Mary Shelley (1797–1851), author of Frankenstein",
    hood: "Belgravia", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "24 Chester Square", postcode: "SW1W 9HS",
    whyGo: "Shelley spent her last years here, decades after writing Frankenstein at 18 - a very different London chapter from the Gothic summer that made her famous.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "percy-shelley-poland-street", name: "Percy Bysshe Shelley's Soho Home",
    subject: "Percy Bysshe Shelley (1792–1822), Romantic poet",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "15 Poland Street", postcode: "W1F 8QE",
    whyGo: "Shelley lodged here as a young radical, years before Ozymandias - a Soho address for one of Romantic poetry's biggest names.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "tennyson-upper-belgrave-street", name: "Lord Tennyson's Belgravia Home",
    subject: "Alfred, Lord Tennyson (1809–1892), Poet Laureate",
    hood: "Belgravia", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "9 Upper Belgrave Street", postcode: "SW1X 8BD",
    whyGo: "Tennyson stayed here during his decades as Poet Laureate - The Charge of the Light Brigade and In Memoriam both date from his career.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "gielgud-cowley-street", name: "Sir John Gielgud's Westminster Home",
    subject: "Sir John Gielgud (1904–2000), actor",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "16 Cowley Street", postcode: "SW1P 3LZ",
    whyGo: "One of the defining Shakespearean actors of the 20th century, later known to a much younger audience for Arthur - a plaque a short walk from Westminster Abbey.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "beckett-paultons-square", name: "Samuel Beckett's Chelsea Home",
    subject: "Samuel Beckett (1906–1989), playwright and novelist",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "48 Paultons Square", postcode: "SW3 5DT",
    whyGo: "Beckett lived here before Waiting for Godot - a Nobel laureate's London address shared with Patrick Blackett, another plaque at the same number.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "nureyev-victoria-road", name: "Rudolf Nureyev's Kensington Home",
    subject: "Rudolf Nureyev (1938–1993), ballet dancer",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "27 Victoria Road", postcode: "W8 5RF",
    whyGo: "Nureyev's 1961 defection from the Soviet Union made global headlines - his London home plaque sits in one of Kensington's quieter residential streets.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "bacon-reece-mews", name: "Francis Bacon's Studio",
    subject: "Francis Bacon (1909–1992), painter",
    hood: "South Kensington", borough: "Kensington and Chelsea", areaGuide: "south-kensington-area-guide",
    address: "7 Reece Mews", postcode: "SW7 3HE",
    whyGo: "Bacon's studio here - famously chaotic, now reconstructed in Dublin's Hugh Lane Gallery - is where he painted for the last three decades of his life.",
    opSummary: "A private mews building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "wilde-tite-street", name: "Oscar Wilde's Chelsea Home",
    subject: "Oscar Wilde (1854–1900), writer and wit",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "34 Tite Street", postcode: "SW3 4JA",
    whyGo: "Wilde lived here with his wife Constance while writing The Picture of Dorian Gray and his best-known plays, before his 1895 trials and imprisonment.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (London County Council)",
    scheme: "London County Council",
  },
  {
    ...base, slug: "twain-tedworth-square", name: "Mark Twain's Chelsea Home",
    subject: "Mark Twain (Samuel Langhorne Clemens, 1835–1910), writer",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "23 Tedworth Square", postcode: "SW3 5DR",
    whyGo: "Twain lived here during one of his London periods, by then already the author of Tom Sawyer and Huckleberry Finn.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (London County Council)",
    scheme: "London County Council",
  },
  {
    ...base, slug: "dickens-doughty-street", name: "Charles Dickens's Bloomsbury Home",
    subject: "Charles Dickens (1812–1870), novelist",
    hood: "Bloomsbury", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "48 Doughty Street", postcode: "WC1N 2LX",
    whyGo: "Dickens wrote Oliver Twist and Nicholas Nickleby here - the only one of his London homes still standing, now the Charles Dickens Museum.",
    opSummary: "Now the Charles Dickens Museum - a paid museum with set opening hours, not just a street plaque.",
    source: "ArcGIS London Plaques feature service (London County Council)",
    scheme: "London County Council",
  },
  {
    ...base, slug: "marx-dean-street", name: "Karl Marx's Soho Home",
    subject: "Karl Marx (1818–1883), philosopher and economist",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "28 Dean Street", postcode: "W1D 3RY",
    whyGo: "Marx lived here in poverty with his family while writing much of Das Kapital - a few doors from where he and Engels regularly met.",
    opSummary: "Above what is now a restaurant - the plaque is at first-floor level.",
    source: "ArcGIS London Plaques feature service (Greater London Council)",
    scheme: "Greater London Council",
  },
  {
    ...base, slug: "mozart-ebury-street", name: "Mozart's Belgravia Home",
    subject: "Wolfgang Amadeus Mozart (1756–1791), composer",
    hood: "Belgravia", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "180 Ebury Street", postcode: "SW1W 8UP",
    whyGo: "Mozart composed his first symphony here in 1764, aged eight, during his family's 15-month stay in London.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (London County Council)",
    scheme: "London County Council",
  },
  {
    ...base, slug: "gresley-kings-cross", name: "Sir Nigel Gresley's Plaque, King's Cross Station",
    subject: "Sir Nigel Gresley (1876–1941), railway locomotive engineer",
    hood: "King's Cross", borough: "Camden", areaGuide: "kings-cross-area-guide",
    address: "Platform 8, King's Cross Station, Euston Road", postcode: "N1 9AG",
    whyGo: "Gresley designed the Flying Scotsman and the world-speed-record-holding Mallard - the plaque is on Platform 8, the platform his locomotives ran from.",
    opSummary: "Inside the station on the platform itself - accessible without a ticket during station opening hours.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "grimaldi-exmouth-market", name: "Joseph Grimaldi's Islington Home",
    subject: "Joseph Grimaldi (1778–1837), the original \"Joey\" clown",
    hood: "Islington", borough: "Islington", areaGuide: "islington-area-guide",
    address: "56 Exmouth Market", postcode: "EC1R 4QE",
    whyGo: "Grimaldi essentially invented the modern circus/pantomime clown - British clowns are still nicknamed \"Joey\" after him, and his grave nearby is a small park named for him.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "fields-upper-street", name: "Gracie Fields's Islington Home",
    subject: "Dame Gracie Fields (1898–1979), singer and entertainer",
    hood: "Islington", borough: "Islington", areaGuide: "islington-area-guide",
    address: "72a Upper Street", postcode: "N1 0NY",
    whyGo: "One of the biggest British entertainers of the 1930s, on Islington's main shopping street - a plaque worth combining with an Upper Street stop anyway.",
    opSummary: "A private/commercial building on a busy shopping street.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },
  {
    ...base, slug: "day-lewis-crooms-hill", name: "Cecil Day-Lewis's Greenwich Home",
    subject: "Cecil Day-Lewis (1904–1972), Poet Laureate",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "6 Crooms Hill", postcode: "SE10 8HL",
    whyGo: "Day-Lewis lived here as Poet Laureate - Crooms Hill is one of Greenwich's prettiest streets, running alongside the park.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "ArcGIS London Plaques feature service (English Heritage)",
  },

  // ============ THIRD PASS: hidden gems (first non-plaque type) ============
  // Filtered against a "would a savvy Londoner nod at this" bar, not a
  // generic listicle scrape - cross-checked against src/data/activities.json
  // first and dropped anything already covered there (Neal's Yard, Sky
  // Garden, Sir John Soane's Museum, Leighton House, Kyoto Garden, St Dunstan
  // in the East, London's Roman Amphitheatre, Barbican Conservatory, Peckham
  // Levels and Battersea Power Station were all already Activities rows).
  {
    ...base, slug: "ye-olde-mitre", name: "Ye Olde Mitre", type: "hidden-gem", scheme: "",
    subject: "A pub built in 1546 down an alley with no street sign",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "1 Ely Court, Ely Place", postcode: "EC1N 6SJ",
    whyGo: "Founded in 1546 for the Bishop of Ely's household staff, tucked down a narrow passage off Hatton Garden with nothing marking the entrance - most people who work nearby never find it. A preserved cherry tree trunk inside is said to mark where Elizabeth I danced with Sir Christopher Hatton.",
    opSummary: "No sign on the street - look for the narrow gap between the buildings on Hatton Garden opposite number 8. Two tiny wood-panelled rooms, low ceilings, gets busy after work.",
    source: "Historic England listing, Wikipedia, and multiple London pub-history blogs cross-checked",
  },
  {
    ...base, slug: "london-mithraeum", name: "Temple of Mithras (London Mithraeum)", type: "hidden-gem", scheme: "",
    subject: "A Roman temple, discovered in 1954, now beneath Bloomberg's HQ",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "12 Walbrook", postcode: "EC4N 8AA",
    whyGo: "Roman Londoners worshipped Mithras here around 240 AD; the ruins were rediscovered during 1954 building work and drew such crowds that the Prime Minister had to weigh in. Now sunk seven metres below Bloomberg's building, with a free reconstruction of temple worship - dimmed lights, chanting, atmospheric smoke.",
    opSummary: "Free, but timed-entry tickets must be booked online in advance - it sells out, especially weekends. Closed Sundays and Mondays.",
    source: "Wikipedia, London Museum, and Bloomberg's own site cross-checked",
  },
  {
    ...base, slug: "cloth-fair-st-bartholomew", name: "Cloth Fair & St Bartholomew the Great", type: "hidden-gem", scheme: "",
    subject: "London's oldest parish church (1123) on one of its oldest surviving streets",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "West Smithfield / Cloth Fair",
    whyGo: "St Bartholomew the Great was founded in 1123 and is the City's oldest parish church, with a Norman interior used in dozens of films. Cloth Fair, right beside it, has some of the only houses in the City to survive the 1666 Great Fire.",
    opSummary: "The church charges a small entry fee for visitors (free for worship); Cloth Fair itself is a public street, walkable any time.",
    source: "Multiple London hidden-gems roundups cross-checked against the church's own history",
  },
  {
    ...base, slug: "st-alphage-ruins-salters-garden", name: "St Alphage Ruins & Salters' Garden", type: "hidden-gem", scheme: "",
    subject: "Medieval church ruins and a fragment of the Roman city wall, wedged between Barbican towers",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "St Alphage Garden, London Wall", postcode: "EC2Y 5DE",
    whyGo: "A tiny public garden holds the ruins of St Alphage London Wall church alongside a real stretch of the Roman and medieval city wall, crenellated in 1477 - genuinely ancient London hiding in the concrete geometry of the Barbican.",
    opSummary: "Free, always open, easy to walk straight past - it's set back from London Wall itself, reached via Fore Street.",
    source: "Historic England listing, Wikipedia, London Gardens Trust inventory cross-checked",
  },
  {
    ...base, slug: "shad-thames", name: "Shad Thames", type: "hidden-gem", scheme: "",
    subject: "A cobbled Victorian warehouse street once nicknamed \"the larder of London\"",
    hood: "Bermondsey", borough: "Southwark", areaGuide: "bermondsey-area-guide",
    address: "Shad Thames",
    whyGo: "These 1873 warehouses stored the grain, spices and tea that fed Victorian London - the elevated iron walkways crossing the street once moved goods between buildings without disturbing traffic below. Derelict by the 1970s, restored by Terence Conran in the 1980s; the walkways are now balconies, but the cobbled Victorian streetscape is intact.",
    opSummary: "A public street, walkable any time, best in late afternoon light. A few minutes from Tower Bridge.",
    source: "Wikipedia, secretldn.com, and Anderson Rose's local history piece cross-checked",
  },
  {
    ...base, slug: "trinity-buoy-wharf", name: "Trinity Buoy Wharf", type: "hidden-gem", scheme: "",
    subject: "London's only lighthouse, a shipping-container art village, and a Victorian steamship museum",
    hood: "Canary Wharf", borough: "Tower Hamlets", areaGuide: "canary-wharf-area-guide",
    address: "64 Orchard Place", postcode: "E14 0JW",
    whyGo: "A genuinely odd little peninsula at the mouth of the Lea: London's only lighthouse (used to test navigation lights, not to guide ships), a village of creative studios built from shipping containers, and the SS Robin, a preserved 1890 steamship.",
    opSummary: "Free to walk around; the lighthouse's Longplayer sound installation is open weekend afternoons. A fair walk or a short bus ride from Canary Wharf itself - not directly on the Jubilee line.",
    source: "theworkingline.com East London hidden gems roundup, cross-checked against Trinity Buoy Wharf's own site",
  },
  {
    ...base, slug: "cecil-court", name: "Cecil Court", type: "hidden-gem", scheme: "",
    subject: "An antiquarian bookshop alley, reputedly one inspiration for Diagon Alley",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "Cecil Court",
    whyGo: "A pedestrian alley between Charing Cross Road and St Martin's Lane lined almost entirely with independent antiquarian and specialist bookshops - rare first editions, maps, theatre memorabilia. Its narrow shopfronts and Victorian character are often cited as a real-world echo of Diagon Alley.",
    opSummary: "A public street, shops keep normal daytime hours and are closed Sundays for the most part - check individual shops.",
    source: "fullsuitcase.com and multiple London hidden-gems roundups cross-checked",
  },
  {
    ...base, slug: "trafalgar-square-smallest-police-station", name: "Trafalgar Square's \"Smallest Police Station\"", type: "hidden-gem", scheme: "",
    subject: "A hollowed-out lamppost built as a covert police observation post in 1926",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Trafalgar Square",
    whyGo: "Tucked into the square's southeast corner, this booth was built in 1926 from a hollowed-out ornamental lamppost so up to two officers could quietly watch the square during demonstrations. It's often billed as \"Britain's smallest police station\", though it never technically had that status.",
    opSummary: "Free, visible from the street, easy to miss entirely if you don't know to look for it - it looks like a lamppost.",
    source: "ianvisits.co.uk (which specifically corrects the myth), historic-uk.com and Tripadvisor cross-checked",
  },
  {
    ...base, slug: "peace-pagoda-battersea-park", name: "Peace Pagoda, Battersea Park", type: "hidden-gem", scheme: "",
    subject: "A 1985 Buddhist peace pagoda gifted to London, on the Thames path",
    hood: "Battersea", borough: "Wandsworth", areaGuide: "battersea-area-guide",
    address: "Battersea Park", postcode: "SW11 4NJ",
    whyGo: "Built by Buddhist monks and nuns of the Nipponzan Myohoji order and unveiled in 1985, this gilded pagoda sits right on the river inside Battersea Park - a striking landmark most people walking or cycling the Thames path have never actually stopped for.",
    opSummary: "Free, always accessible within the park's opening hours. Best approached along the riverside path.",
    source: "myadventuresacrosstheworld.com and multiple Battersea guides cross-checked",
  },
  {
    ...base, slug: "battersea-flower-station", name: "Battersea Flower Station", type: "hidden-gem", scheme: "",
    subject: "A flower shop that opens into a long, hidden garden-centre corridor",
    hood: "Battersea", borough: "Wandsworth", areaGuide: "battersea-area-guide",
    address: "320 Battersea Park Road", postcode: "SW11 3BX",
    whyGo: "Looks like an ordinary flower shop from the street; walk through and it opens into a long outdoor corridor of plants, bunting and fairy lights - a garden centre that was shut off to the public for 30 years before reopening. A second entrance exists on Winders Road.",
    opSummary: "Free to browse, normal shop hours. A genuinely photogenic detour rather than a destination in itself.",
    source: "batterseaflowerstation.co.uk (own site) and Sarah Pratley's \"London's Secret Spots\" piece",
  },
  {
    ...base, slug: "devonshire-mews-west", name: "Devonshire Mews West", type: "hidden-gem", scheme: "",
    subject: "A quiet, ivy-clad Marylebone mews, essentially tourist-free",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "Devonshire Mews West", postcode: "W1G 6QE",
    whyGo: "One of Marylebone's best-kept mews streets - cobbles, climbing ivy, converted coach houses - a couple of minutes off the high street but with almost none of its foot traffic.",
    opSummary: "A private residential street; walkable and photographable, but treat it as someone's front door, not an attraction.",
    source: "lurotbrand.co.uk mews directory cross-checked",
  },
  {
    ...base, slug: "kynance-mews", name: "Kynance Mews", type: "hidden-gem", scheme: "",
    subject: "A wisteria-clad cobbled mews, a village pocket inside South Kensington",
    hood: "South Kensington", borough: "Kensington and Chelsea", areaGuide: "south-kensington-area-guide",
    address: "Kynance Mews", postcode: "SW7 4QP",
    whyGo: "Converted stables on a cobbled cul-de-sac, walls thick with wisteria in late spring - the closest South Kensington gets to a country village lane, a few minutes from the museums.",
    opSummary: "A private residential street; walkable and photographable, but treat it as someone's front door, not an attraction. Wisteria peaks late April to May.",
    source: "Wikipedia and lurotbrand.co.uk mews directory cross-checked",
  },

  // ============ FOURTH PASS: street art (second non-plaque type) ============
  // Sourced from graffitistreet.com's 2026 "surviving works" survey, cross-
  // checked against Londonist, MyArtBroker and mocomuseum.com. Banksy's
  // street work is genuinely transient - pieces get removed, painted over,
  // relocated into museums, or protected behind perspex - so every row notes
  // whether it is out on the street (can vanish without warning) or already
  // preserved (glass/perspex, or moved indoors). "London doesn't work" is
  // NOT a Banksy/Robbo attribution error: it began as a solo Banksy rat in
  // 2004, King Robbo added his own tag as one move in their years-long
  // "graffiti war", and the surviving piece carries both names - a genuine
  // joint artefact of the feud, not a misattribution.
  {
    ...base, slug: "banksy-flag-blinded-statue", name: "Banksy's Flag-Blinded Statue", type: "street-art", scheme: "",
    subject: "A bronze-effect figure stepping off its plinth, face obscured by a flag - confirmed by Banksy in April 2026",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Waterloo Place",
    whyGo: "Appeared overnight in April 2026 and was confirmed as Banksy's own within a day - a suited figure stepping off its plinth with its face wrapped in a flag, widely read as a comment on blind patriotism. The newest and most-visited piece on this list.",
    opSummary: "Out in the open on a public street - drew huge crowds on arrival and its long-term fate (left in place, protected, or removed) was still unclear as of this write-up. Check it's still there before making a special trip.",
    source: "The Art Newspaper, Wikipedia (Banksy statue), graffitistreet.com cross-checked",
  },
  {
    ...base, slug: "banksy-royal-courts-protester", name: "Banksy's Royal Courts Protester", type: "street-art", scheme: "",
    subject: "A stencil on the Royal Courts of Justice, appeared September 2025",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "Royal Courts of Justice, Strand",
    whyGo: "A protest-themed stencil that appeared on the wall of the Royal Courts of Justice itself - a piece commenting on protest law, placed on one of the most symbolically loaded buildings Banksy could have picked.",
    opSummary: "On a government building's exterior wall - visibility and preservation status can change fast on pieces like this. Check before visiting.",
    source: "graffitistreet.com 2026 survey, cross-checked against news coverage of the piece's appearance",
  },
  {
    ...base, slug: "banksy-stargazing-children-centre-point", name: "Banksy's Stargazing Children, Centre Point", type: "street-art", scheme: "",
    subject: "A 2025 piece near St Giles Square / Centre Point",
    hood: "Soho", borough: "Camden", areaGuide: "soho-area-guide",
    address: "St Giles Square, near Centre Point",
    whyGo: "One of two \"Stargazing Children\" pieces that appeared in 2025 - this one near the foot of Centre Point, at the northern tip of Soho where it meets St Giles.",
    opSummary: "Street-level, out in the open. As with all recent Banksy pieces, confirm it's still there before a special trip.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-stargazing-children-bayswater", name: "Banksy's Stargazing Children, Bayswater", type: "street-art", scheme: "",
    subject: "The second \"Stargazing Children\" piece, appeared December 2025",
    hood: "Bayswater", borough: "Westminster", areaGuide: "paddington-area-guide",
    address: "Queen's Mews, Bayswater",
    whyGo: "The Bayswater half of a pair of related pieces that appeared within months of each other in 2025 - worth knowing about even if you only make it to one.",
    opSummary: "On a residential mews. Confirm it's still there before visiting - very recent pieces are the least predictable.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-marble-arch", name: "Banksy's \"Despair Ends, Tactics Begin\"", type: "street-art", scheme: "",
    subject: "A 2019 piece near Marble Arch",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "Marble Arch",
    whyGo: "Appeared in April 2019 near Marble Arch, at the junction of Oxford Street and Park Lane - one of the older pieces on this list to have survived this long in place.",
    opSummary: "Street-level, out in the open at a very high-footfall junction.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-notting-hill-graffiti-painter", name: "Banksy's Graffiti Painter (after Velázquez)", type: "street-art", scheme: "",
    subject: "A 2008 piece riffing on Velázquez, on Portobello Road",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "Acklam Road & Portobello Road",
    whyGo: "A 2008 piece at the junction of Acklam Road and Portobello Road, riffing on a Velázquez composition with a figure caught mid-graffiti - one of the better-known survivors from Banksy's most prolific Notting Hill years.",
    opSummary: "Street-level on a well-known corner - worth combining with a Portobello Market visit.",
    source: "graffitistreet.com 2026 survey, cross-checked against Londonist",
  },
  {
    ...base, slug: "banksy-chelsea-elephants", name: "Banksy's Elephants", type: "street-art", scheme: "",
    subject: "Two elephant heads reaching toward each other from blocked windows",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "Edith Terrace & Edith Grove", postcode: "SW10 0TQ",
    whyGo: "Two elephant heads stencilled reaching toward one another from a pair of bricked-up windows - one of the more visually striking and best-preserved pieces still on a public street.",
    opSummary: "Street-level, out in the open on a residential corner.",
    source: "graffitistreet.com 2026 survey, cross-checked against mocomuseum.com",
  },
  {
    ...base, slug: "banksy-robbo-rat", name: "Banksy/Robbo's \"I Love London\" Rat", type: "street-art", scheme: "",
    subject: "A 2004 Banksy rat, later altered by rival artist King Robbo - a physical record of their feud",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Chiswell Street",
    whyGo: "Started life in 2004 as a Banksy rat holding a placard reading \"London Doesn't Work\". Rival graffiti artist King Robbo later reworked the placard with his own tag and a heart, as one move in a years-long \"graffiti war\" between the two - the surviving piece is a genuine joint artefact, not a misattribution, and Banksy repainted a memorial version after Robbo was hospitalised.",
    opSummary: "Street-level, out in the open - one of the older survivors, so check current condition before a special trip.",
    source: "Wikipedia (King Robbo), Alamy/Flickr documentation, culturalwednesday.co.uk cross-checked",
  },
  {
    ...base, slug: "banksy-cannon-street-rat", name: "Banksy's Cannon Street Rat", type: "street-art", scheme: "",
    subject: "An early-2000s rat stencil on a railway bridge",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Cannon Street railway bridge",
    whyGo: "One of Banksy's earliest surviving London rats, on the railway bridge over Cannon Street - a reminder of how much of his early-2000s stencil work has simply vanished since, making survivors like this one worth seeking out.",
    opSummary: "On a railway bridge structure, viewable from the street.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-basquiat-ferris-wheel", name: "Banksy's Basquiat Ferris Wheel", type: "street-art", scheme: "",
    subject: "One of two 2017 Basquiat tribute pieces in the Beech Street tunnel",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Beech Street tunnel, Barbican",
    whyGo: "Painted in 2017 to coincide with a Basquiat exhibition at the Barbican, reworking Basquiat's crown motif - among the best-preserved Banksy pieces in London precisely because it was protected not long after it appeared.",
    opSummary: "Inside a road tunnel, protected - one of the more reliably-still-there pieces on this list.",
    source: "graffitistreet.com 2026 survey, cross-checked against culturalwednesday.co.uk",
  },
  {
    ...base, slug: "banksy-basquiat-stop-and-search", name: "Banksy's Basquiat \"Stop and Search\"", type: "street-art", scheme: "",
    subject: "The second 2017 Basquiat tribute piece in the same tunnel",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Beech Street tunnel, Barbican",
    whyGo: "The second of the pair of 2017 Basquiat-tribute pieces in the same tunnel - a police officer frisking a crowned Basquiat-style figure, a pointed comment on how the artist himself was treated by police in life.",
    opSummary: "Inside the same protected road tunnel as the Ferris Wheel piece - visit both together.",
    source: "graffitistreet.com 2026 survey, cross-checked against culturalwednesday.co.uk",
  },
  {
    ...base, slug: "banksy-guard-dog", name: "Banksy's Guard Dog", type: "street-art", scheme: "",
    subject: "A 2013 piece in the former Cargo courtyard, Shoreditch",
    hood: "Shoreditch", borough: "Hackney", areaGuide: "shoreditch-area-guide",
    address: "Rivington Street (former Cargo courtyard)",
    whyGo: "One of several Banksy pieces clustered around the former Cargo nightclub's courtyard on Rivington Street - Shoreditch's Banksy density rivals anywhere else in London.",
    opSummary: "Street-level in a courtyard off Rivington Street. Combine with the other Cargo-courtyard and Art'otel pieces nearby.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-his-masters-voice", name: "Banksy's \"His Master's Voice\"", type: "street-art", scheme: "",
    subject: "A 2003 piece, one of the oldest survivors in the former Cargo courtyard",
    hood: "Shoreditch", borough: "Hackney", areaGuide: "shoreditch-area-guide",
    address: "Rivington Street (former Cargo courtyard)",
    whyGo: "One of the oldest pieces on this list, dating to 2003 - a dog listening to a gramophone-style speaker, a play on the old HMV logo.",
    opSummary: "Street-level in the same courtyard as Guard Dog - visit them together.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-knife-fork-rat", name: "Banksy's Knife-and-Fork Rat", type: "street-art", scheme: "",
    subject: "A 2004 rat piece, now part of the Art'otel London Hoxton",
    hood: "Shoreditch", borough: "Hackney", areaGuide: "shoreditch-area-guide",
    address: "Art'otel London Hoxton, Rivington Street",
    whyGo: "The Art'otel London Hoxton was built to deliberately preserve two Banksy pieces on its site - a rat setting a table with a knife and fork - rather than paint over them, which is why both have survived so cleanly.",
    opSummary: "Structurally preserved as part of the hotel building - among the most reliably-still-there pieces on this whole list.",
    source: "graffitistreet.com 2026 survey, cross-checked against the earlier search noting Art'otel's preservation",
  },
  {
    ...base, slug: "banksy-tv-out-window", name: "Banksy's \"TV Out Window\"", type: "street-art", scheme: "",
    subject: "The second preserved 2004 piece at the Art'otel London Hoxton",
    hood: "Shoreditch", borough: "Hackney", areaGuide: "shoreditch-area-guide",
    address: "Art'otel London Hoxton, Rivington Street",
    whyGo: "The second of the two pieces the Art'otel was built around - a figure throwing a television out of a window, preserved on the same building as the Knife-and-Fork Rat.",
    opSummary: "Structurally preserved as part of the hotel building - visit alongside the Knife-and-Fork Rat.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-pink-car", name: "Banksy's Pink Car", type: "street-art", scheme: "",
    subject: "An early-2000s piece at the Old Truman Brewery, Brick Lane",
    hood: "Shoreditch", borough: "Tower Hamlets", areaGuide: "shoreditch-area-guide",
    address: "Old Truman Brewery, Brick Lane",
    whyGo: "One of the early-2000s survivors at the Old Truman Brewery, right on Brick Lane - easy to combine with the market, the vintage shops and the curry houses on the same street.",
    opSummary: "On the Truman Brewery site, street-visible.",
    source: "graffitistreet.com 2026 survey",
  },
  {
    ...base, slug: "banksy-tonbridge-street-rat", name: "Banksy's Rat, The Standard Hotel", type: "street-art", scheme: "",
    subject: "An early-2000s rat holding a placard, on the side of The Standard hotel",
    hood: "King's Cross", borough: "Camden", areaGuide: "kings-cross-area-guide",
    address: "10 Argyle Street", postcode: "WC1H 8EG",
    whyGo: "A classic rat-with-placard stencil on the side of The Standard hotel, a short walk from King's Cross and St Pancras stations - one of the most convenient pieces on this list for anyone arriving by train.",
    opSummary: "On the exterior of the hotel building, street-visible at any time.",
    source: "blocal-travel.com and graffitistreet.com cross-checked",
  },
  {
    ...base, slug: "banksy-fishing-boy", name: "Banksy's Fishing Boy", type: "street-art", scheme: "",
    subject: "A 2008 piece on the Thames Path at Bermondsey Wall",
    hood: "Bermondsey", borough: "Southwark", areaGuide: "bermondsey-area-guide",
    address: "Thames Path, Bermondsey Wall",
    whyGo: "A 2008 piece right on the Thames Path, showing a boy fishing - part of a small cluster of riverside Banksy pieces along this stretch of the south bank.",
    opSummary: "Outdoors on the riverside path, exposed to weather - one to see while it lasts.",
    source: "graffitistreet.com 2026 survey",
  },

  // ========== FIFTH PASS: filming locations (fourth and final type) ==========
  // NOT restricted to areas with a guide already - see the "don't restrict to
  // existing area guides" standing rule. Vauxhall's MI6 building has no
  // matching guide and ships with areaGuide left blank rather than being
  // dropped or force-fitted into a nearby one.
  //
  // Cross-checked against activities.json and hiddenLondon.json first.
  // Several famous "filming location" landmarks (Platform 9¾, the National
  // Gallery, Somerset House, Piccadilly Circus, the Old Royal Naval College)
  // were DELIBERATELY LEFT OUT here - they're major standalone attractions
  // that deserve a proper Activities row of their own (hours, price, booking)
  // rather than the thin filming-location treatment, and Activities doesn't
  // have them yet. Worth a future Activities pass, not this one.
  //
  // A few rows dual-cover a building that's already a Restaurant or Hotel
  // entry (Nobu, the Savoy) - same pattern as the Handel/Hendrix plaques:
  // the film angle is a genuinely different reason to feature the same
  // address, not a duplicate.
  {
    ...base, slug: "notting-hill-blue-door", name: "Notting Hill's Blue Door", type: "filming-location", scheme: "",
    subject: "Notting Hill (1999) - William Thacker's flat",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "280 Westbourne Park Road",
    whyGo: "The most photographed front door in west London. Screenwriter Richard Curtis owned the real house; when the door was auctioned for charity the new owners repainted it a different colour, but tourists were so confused they painted it blue again.",
    opSummary: "A private residential building - viewable from the street only. Be considerate; people live here.",
    source: "movie-locations.com Notting Hill location list, cross-checked against Trainline and Hooked on Houses",
  },
  {
    ...base, slug: "notting-hill-travel-bookshop", name: "Notting Hill's \"Travel Bookshop\"", type: "filming-location", scheme: "",
    subject: "Notting Hill (1999) - William's bookshop",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "142 Portobello Road",
    whyGo: "The film's travel bookshop was actually an antiques arcade dressed for filming - the real bookshop that partly inspired the story, on Blenheim Crescent nearby, closed in 2011 and is now a gift shop that leans into the connection.",
    opSummary: "Now a shop at street level - browsable, not a museum.",
    source: "movie-locations.com and Trainline's Notting Hill location guide cross-checked",
  },
  {
    ...base, slug: "love-actually-st-lukes-mews", name: "Love Actually's Cue-Card Doorstep", type: "filming-location", scheme: "",
    subject: "Love Actually (2003) - Mark's silent declaration",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "27 St Luke's Mews",
    whyGo: "The doorstep where Mark holds up handwritten cue cards to declare his love for Juliet without saying a word - one of the most quoted scenes of the film, on a genuinely pretty pastel mews.",
    opSummary: "A private residential mews - viewable from the street only.",
    source: "Trainline's Love Actually location guide, cross-checked against Country & Town House",
  },
  {
    ...base, slug: "paddington-alices-antiques", name: "Paddington's Mr Gruber's Shop (Alice's Antiques)", type: "filming-location", scheme: "",
    subject: "Paddington (2014) - Mr Gruber's antique shop",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "86 Portobello Road",
    whyGo: "A real, long-running antiques shop that played Mr Gruber's shop in the Paddington films - genuinely worth a browse in its own right, film connection aside.",
    opSummary: "A working antiques shop with normal daytime hours.",
    source: "Trainline's Paddington filming-locations guide",
  },
  {
    ...base, slug: "notting-hill-coronet-cinema", name: "Notting Hill's Coronet Theatre", type: "filming-location", scheme: "",
    subject: "Notting Hill (1999) - William's cinema scene",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "103 Notting Hill Gate",
    whyGo: "A former cinema, now a theatre, where William watches a sci-fi film early in the story - a handsome Victorian building on Notting Hill Gate itself.",
    opSummary: "Now a working theatre with its own programme and box office hours.",
    source: "movie-locations.com Notting Hill location list",
  },
  {
    ...base, slug: "sherlock-north-gower-street", name: "Sherlock's 221B (North Gower Street)", type: "filming-location", scheme: "",
    subject: "BBC Sherlock - 221B Baker Street exterior and Speedy's Cafe",
    hood: "Bloomsbury", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "187 North Gower Street",
    whyGo: "The BBC series filmed its 221B exterior here rather than on the real, much busier Baker Street - the flat above a genuine sandwich bar, Speedy's, which leaned into the connection and is still trading.",
    opSummary: "Speedy's Cafe is a real, working sandwich bar with normal daytime hours - go in and get a coffee, not just a photo.",
    source: "Londonist's BBC Sherlock location guide, cross-checked against bakerstreet.fandom.com",
  },
  {
    ...base, slug: "paddington-chalcot-crescent", name: "Paddington's Brown Family Home", type: "filming-location", scheme: "",
    subject: "Paddington (2014/2017) - 32 Windsor Gardens exterior",
    hood: "Camden Town", borough: "Camden", areaGuide: "camden-area-guide",
    address: "Chalcot Crescent, Primrose Hill",
    whyGo: "The fictional \"32 Windsor Gardens\" was actually filmed on this pastel-painted Primrose Hill crescent - one of the most Instagrammed residential streets in London even without the film connection.",
    opSummary: "A private residential street - viewable from the street only, and popular enough that being considerate of residents matters.",
    source: "Trainline's Paddington filming-locations guide, cross-checked against almostginger.com",
  },
  {
    ...base, slug: "love-actually-grosvenor-chapel", name: "Love Actually's Wedding Chapel", type: "filming-location", scheme: "",
    subject: "Love Actually (2003) - Juliet and Peter's wedding",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "24 South Audley Street (Grosvenor Chapel)",
    whyGo: "A working 18th-century chapel, tucked just off South Audley Street, used for the wedding that opens Mark and Juliet's storyline.",
    opSummary: "An active place of worship - respect service times; open to visitors outside them.",
    source: "GoodToKnow's Love Actually location guide",
  },
  {
    ...base, slug: "love-actually-ema-house", name: "Love Actually's Office (EMA House)", type: "filming-location", scheme: "",
    subject: "Love Actually (2003) - Harry and Sarah's workplace",
    hood: "Shoreditch", borough: "Hackney", areaGuide: "shoreditch-area-guide",
    address: "Tabernacle Street at Clere Street",
    whyGo: "The office building where Alan Rickman and Emma Thompson's characters work - an unassuming Shoreditch corner most passersby would never connect to the film.",
    opSummary: "A commercial office building - viewable from the street only.",
    source: "GoodToKnow's Love Actually location guide",
  },
  {
    ...base, slug: "notting-hill-nobu-park-lane", name: "Notting Hill's Dinner Date (Nobu Old Park Lane)", type: "filming-location", scheme: "",
    subject: "Notting Hill (1999) - William and Anna's restaurant date",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "19 Old Park Lane",
    whyGo: "Where William takes Anna Scott to dinner - Nobu Old Park Lane is a genuine, still-trading restaurant (already on this site as a place to eat), and the film scene is a different reason to know the address, not a duplicate of that listing.",
    opSummary: "A working, bookable restaurant - see the Restaurants section for how to book.",
    source: "movie-locations.com Notting Hill location list",
  },
  {
    ...base, slug: "notting-hill-savoy-proposal", name: "Notting Hill's Proposal Scene (The Savoy)", type: "filming-location", scheme: "",
    subject: "Notting Hill (1999) - William's press-conference proposal",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "1 Savoy Hill (The Savoy)",
    whyGo: "William proposes to Anna at a press conference staged here - the Savoy is already on this site as a place to stay; the film scene is the reason to know it beyond the room rate.",
    opSummary: "A working luxury hotel - see the Hotels section for how to book a stay.",
    source: "movie-locations.com Notting Hill location list",
  },
  {
    ...base, slug: "bond-rules-restaurant", name: "Bond's Favourite Restaurant (Rules)", type: "filming-location", scheme: "",
    subject: "Spectre (2015) - James Bond's go-to restaurant",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "35 Maiden Lane", postcode: "WC2E 7LB",
    whyGo: "Rules is London's oldest restaurant, open since 1798, and was written into Spectre as Bond's own favourite - a rare case of a film using a real restaurant's own reputation rather than dressing up a stand-in.",
    opSummary: "A working, bookable restaurant with its own long history independent of Bond.",
    source: "New York Habitat's James Bond London locations piece",
  },
  {
    ...base, slug: "bond-mi6-vauxhall", name: "Bond's MI6 Headquarters (SIS Building)", type: "filming-location", scheme: "",
    subject: "James Bond franchise - the real SIS/MI6 building",
    hood: "Vauxhall", borough: "Lambeth", areaGuide: "",
    address: "85 Vauxhall Cross",
    whyGo: "The genuine home of the UK's Secret Intelligence Service, on the river at Vauxhall Cross, has appeared as MI6 headquarters in almost every Bond film since GoldenEye - one of very few Bond locations that's exactly what it's pretending to be.",
    opSummary: "A working government building - viewable from the river or the street only, no public access.",
    source: "a&o Hostels and New York Habitat James Bond location roundups cross-checked",
  },
  {
    ...base, slug: "skyfall-four-seasons-canary-wharf", name: "Skyfall's \"Shanghai\" Pool (Four Seasons Canary Wharf)", type: "filming-location", scheme: "",
    subject: "Skyfall (2012) - the rooftop pool standing in for Shanghai",
    hood: "Canary Wharf", borough: "Tower Hamlets", areaGuide: "canary-wharf-area-guide",
    address: "Westferry Circus",
    whyGo: "Daniel Craig's Shanghai hotel pool scene was actually filmed at the Four Seasons in Canary Wharf - a very London building standing in for the other side of the world.",
    opSummary: "A working hotel - the pool is for guests, not a public sight.",
    source: "MI6-HQ.com and thejamesbonddossier.com Skyfall location coverage cross-checked",
  },
  {
    ...base, slug: "bridgerton-rangers-house", name: "Bridgerton House (Ranger's House)", type: "filming-location", scheme: "",
    subject: "Bridgerton (2020-) - the Bridgerton family home exterior",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "Chesterfield Walk (Ranger's House)", postcode: "SE10 8QX",
    whyGo: "An ivy-covered Georgian villa on the edge of Greenwich Park doubles as the Bridgerton family's London home - genuinely one of the prettiest house exteriors in Greenwich even without the show.",
    opSummary: "An English Heritage property with its own paid entry and opening hours (it also houses the Wernher art collection) - check before visiting.",
    source: "getyourguide.com Bridgerton filming-locations roundup",
  },
  {
    ...base, slug: "harry-potter-australia-house", name: "Gringotts Wizarding Bank (Australia House)", type: "filming-location", scheme: "",
    subject: "Harry Potter and the Philosopher's Stone (2001) - Gringotts interior",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "Strand (Australia House)",
    whyGo: "Australia House's ornate banking hall - a real working diplomatic building - was used for Gringotts Wizarding Bank's interior in the first Harry Potter film.",
    opSummary: "A working diplomatic mission - not generally open for casual visits; viewable from the street only.",
    source: "a&o Hostels' Harry Potter/Bond London filming-locations piece",
  },

  // ------- SIXTH PASS: the rest of Banksy's August 2024 animal series -------
  // Nine pieces appeared on nine consecutive days, Aug 5-13 2024. Only two
  // besides the Chelsea elephants (already in the fourth pass) are still
  // free, street-viewable and undamaged: the goat, monkeys, wolf and big cat
  // were removed or stolen; the piranhas moved to the Museum of London and
  // the gorilla's original was pulled from London Zoo and replaced with a
  // replica behind paid admission - none of those four fit "free, self-
  // guided, on the street" any more, so they are deliberately left out.
  // Neither of these two has an area guide yet - added anyway.
  {
    ...base, slug: "banksy-walthamstow-pelicans", name: "Banksy's Pelicans", type: "street-art", scheme: "",
    subject: "Two pelicans reaching for fish above a fish and chip shop - part of the August 2024 animal series",
    hood: "Walthamstow", borough: "Waltham Forest", areaGuide: "",
    address: "Pretoria Avenue",
    whyGo: "Day five of Banksy's nine-day August 2024 animal spree - two pelicans painted above a fish and chip shop, seemingly eyeing up the fish inside. One of only two pieces from that series still on the street undamaged.",
    opSummary: "Street-level, above a working shop. Still present and in good condition as of the most recent surveys.",
    source: "Wikipedia (\"Banksy's London animal series\"), cross-checked against graffitistreet.com and dogonews.com",
  },
  {
    ...base, slug: "banksy-charlton-rhino", name: "Banksy's Rhinoceros", type: "street-art", scheme: "",
    subject: "A rhinoceros appearing to mount a car - the final free-standing survivor of the August 2024 animal series",
    hood: "Charlton", borough: "Greenwich", areaGuide: "",
    address: "Westmoor Street",
    whyGo: "Day eight of the same nine-day series - a large rhino stencilled as though mounting a parked car below it, a cheekier piece than most of the set.",
    opSummary: "Street-level, but has since been tagged with a white dollar sign and a letter - it's a damaged survivor, not a pristine one. Still worth seeing, just don't expect it untouched.",
    source: "Wikipedia (\"Banksy's London animal series\"), cross-checked against graffitistreet.com",
  },

  // ------------------- SEVENTH PASS: more filming locations -------------------
  // Broader spread requested explicitly - not limited to areas already
  // covered. Cross-checked against activities.json/hiddenLondon.json first;
  // St Paul's Cathedral (Fantastic Beasts) and Highgate Cemetery (also
  // Fantastic Beasts) were left out as duplicates/major-landmark cases, same
  // reasoning as the fifth pass.
  {
    ...base, slug: "kingsman-huntsman-savile-row", name: "Kingsman's Tailor Shop (Huntsman)", type: "filming-location", scheme: "",
    subject: "Kingsman: The Secret Service (2014) and sequels - the Kingsman shop exterior",
    hood: "Mayfair", borough: "Westminster", areaGuide: "mayfair-area-guide",
    address: "11 Savile Row",
    whyGo: "Huntsman & Sons, tailoring on this spot since 1849 and once dressed Winston Churchill, is the real shop behind Kingsman's fictional tailors - the exterior in every film is genuine, even though the interior was rebuilt on a soundstage because the real shop was too small to film in.",
    opSummary: "A working bespoke tailor, not a museum - a small gold \"Kingsman\" plaque by the door is the only nod to the films. Expect selfie-taking fans outside.",
    source: "Wikipedia (\"The Kingsman Shop\"), Time Out and Huntsman's own site cross-checked",
  },
  {
    ...base, slug: "bridget-jones-flat-borough-market", name: "Bridget Jones's Flat", type: "filming-location", scheme: "",
    subject: "Bridget Jones's Diary (2001) - Bridget's flat above the Globe Tavern",
    hood: "South Bank", borough: "Southwark", areaGuide: "south-bank-area-guide",
    address: "8 Bedale Street, Borough Market",
    whyGo: "Bridget's flat exterior sits directly above the Globe Tavern on the edge of Borough Market - the interiors were shot at Elstree, but the building, the pub and the market below are all real and still there.",
    opSummary: "A private residential flat above a working pub - viewable from the street/market only.",
    source: "Trainline and Timeout's Bridget Jones location coverage cross-checked",
  },
  {
    ...base, slug: "layer-cake-craig-flat-kensington", name: "Layer Cake's Flat (Daniel Craig)", type: "filming-location", scheme: "",
    subject: "Layer Cake (2004) - the unnamed protagonist's flat, played by Daniel Craig",
    hood: "Kensington", borough: "Kensington and Chelsea", areaGuide: "kensington-area-guide",
    address: "7 Queen's Gate Mews",
    whyGo: "Daniel Craig's character lives here in Guy Ritchie's Layer Cake, a year before Craig was cast as Bond - a nice bit of casting trivia hiding on an ordinary Kensington mews.",
    opSummary: "A private residential mews - viewable from the street only.",
    source: "tokyofox.net and movie-locations.com Layer Cake coverage cross-checked",
  },
  {
    ...base, slug: "layer-cake-west-india-quay", name: "Layer Cake's Rooftop Scene", type: "filming-location", scheme: "",
    subject: "Layer Cake (2004) - the rooftop-dangling scene",
    hood: "Canary Wharf", borough: "Tower Hamlets", areaGuide: "canary-wharf-area-guide",
    address: "West India Quay",
    whyGo: "One of the film's tensest scenes was shot on the docks here - worth knowing if you're already in Canary Wharf for the Skyfall pool a short walk away.",
    opSummary: "A public dockside area, viewable any time.",
    source: "tokyofox.net Layer Cake location coverage",
  },
  {
    ...base, slug: "snatch-sols-pawn-shop", name: "Snatch's Pawn Shop", type: "filming-location", scheme: "",
    subject: "Snatch (2000) - Sol's pawn shop",
    hood: "Bethnal Green", borough: "Tower Hamlets", areaGuide: "hackney-area-guide",
    address: "88 Teesdale Street",
    whyGo: "One of several genuine East End addresses Guy Ritchie used in Snatch - an ordinary Bethnal Green street standing in for the criminal underworld of the film.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: "tokyofoxbeyondthemovies.wordpress.com and movie-locations.com Snatch coverage cross-checked",
  },
  {
    ...base, slug: "snatch-franky-tailor-town-hall", name: "Snatch's Tailor (Bethnal Green Town Hall)", type: "filming-location", scheme: "",
    subject: "Snatch (2000) - Franky Four Fingers's tailor",
    hood: "Bethnal Green", borough: "Tower Hamlets", areaGuide: "hackney-area-guide",
    address: "Cambridge Heath Road at Patriot Square",
    whyGo: "The historic 1910 town hall building - already on this site as the Town Hall Hotel - played the tailor's shop in Snatch. The film angle is a genuinely different reason to know this building beyond staying there.",
    opSummary: "Now a hotel - see the Hotels section for how to book a stay.",
    source: "movie-locations.com Snatch coverage",
  },
  {
    ...base, slug: "snatch-doug-diamond-store", name: "Snatch's Diamond Store", type: "filming-location", scheme: "",
    subject: "Snatch (2000) - Doug the Head's diamond store",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Premier House, 12-13 Hatton Garden",
    whyGo: "Doug the Head's diamond shop in Snatch is on Hatton Garden, London's real diamond district - and his \"local\" in the film is Ye Olde Mitre, already on this site, a couple of doors down.",
    opSummary: "A working commercial building on Hatton Garden - viewable from the street only.",
    source: "movie-locations.com Snatch coverage",
  },
  {
    ...base, slug: "lock-stock-hatchet-harry-cheshire-street", name: "Lock, Stock's Sex Shop (Cheshire Street)", type: "filming-location", scheme: "",
    subject: "Lock, Stock and Two Smoking Barrels (1998) - Hatchet Harry's shop",
    hood: "Shoreditch", borough: "Tower Hamlets", areaGuide: "shoreditch-area-guide",
    address: "42-44 Cheshire Street",
    whyGo: "Guy Ritchie's breakout film used this Shoreditch street for Hatchet Harry's business - one of several East London corners across his early films that still look almost identical today.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: "tokyofox.net Lock Stock location coverage",
  },
  {
    ...base, slug: "killing-eve-floris-jermyn-street", name: "Killing Eve's Perfumer (Floris)", type: "filming-location", scheme: "",
    subject: "Killing Eve (2018-) - Villanelle visits Floris",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "89 Jermyn Street",
    whyGo: "Floris is a genuine royal-warrant perfumer that's traded on Jermyn Street since 1730 - Villanelle's visit in Killing Eve used the real shop, not a set, which is unusual for the show.",
    opSummary: "A working shop with normal retail hours - worth a browse regardless of the show.",
    source: "Londonist's Killing Eve location coverage, cross-checked against findthatlocation.com",
  },
  {
    ...base, slug: "killing-eve-mi6-warwick-house-street", name: "Killing Eve's Old MI6 Office", type: "filming-location", scheme: "",
    subject: "Killing Eve (2018-) - Eve and Bill's original office, off Trafalgar Square",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "4 Warwick House Street",
    whyGo: "A narrow street just off Trafalgar Square used for Eve and Bill's original MI6 office in series one - easy to walk straight past without noticing it's there.",
    opSummary: "A private/commercial building - viewable from the street only.",
    source: "findthatlocation.com Killing Eve location guide",
  },
  {
    ...base, slug: "four-weddings-charles-flat-highbury", name: "Four Weddings and a Funeral's Flat", type: "filming-location", scheme: "",
    subject: "Four Weddings and a Funeral (1994) - Charles's flat",
    hood: "Islington", borough: "Islington", areaGuide: "islington-area-guide",
    address: "22 Highbury Terrace", postcode: "N5 1UP",
    whyGo: "Hugh Grant's character lives here in the film that made Richard Curtis's name before he wrote Notting Hill and Love Actually - a handsome terrace on the northwest corner of Highbury Fields.",
    opSummary: "A private residential building - viewable from the street only.",
    source: "movie-locations.com and almostginger.com Four Weddings location coverage cross-checked",
  },
  {
    ...base, slug: "dark-knight-farmiloe-clerkenwell", name: "Gotham City Police Station (Farmiloe Building)", type: "filming-location", scheme: "",
    subject: "Batman Begins (2005) and The Dark Knight Rises (2012) - Gotham City Police Department interiors",
    hood: "Clerkenwell", borough: "Islington", areaGuide: "",
    address: "28-36 St John Street",
    whyGo: "A grand Victorian former lead-manufacturing warehouse used for Gotham's police HQ interiors across two Batman films - one of London's most-filmed derelict buildings before its own restoration.",
    opSummary: "A private commercial building - viewable from the street only.",
    source: "ScreenRant and tokyofox.net Dark Knight location coverage cross-checked",
  },
  {
    ...base, slug: "dark-knight-rises-greenwich-cafe", name: "The Dark Knight Rises's Italian Cafe (Old Royal Naval College)", type: "filming-location", scheme: "",
    subject: "The Dark Knight Rises (2012) - Alfred spots Bruce and Selina",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "Old Royal Naval College",
    whyGo: "The riverside colonnades here stood in for a Florence street cafe in the film's final scene - a different Greenwich landmark angle from the Bridgerton connection already on this site.",
    opSummary: "Free grounds, open daily; the buildings themselves have their own separate opening hours and some charge for entry.",
    source: "ScreenRant's Dark Knight Rises location coverage",
  },
  {
    ...base, slug: "bohemian-rhapsody-air-studios-hampstead", name: "Bohemian Rhapsody's Rehearsal Studio (Air Studios)", type: "filming-location", scheme: "",
    subject: "Bohemian Rhapsody (2018) - the band rehearsing before Live Aid",
    hood: "Hampstead", borough: "Camden", areaGuide: "hampstead-area-guide",
    address: "Lyndhurst Road",
    whyGo: "A genuine working recording studio, converted from a church, used for the film's rehearsal scenes - Air Studios has recorded film scores and major albums for decades, film connection aside.",
    opSummary: "A working commercial recording studio - not open to casual visitors, viewable from the street only.",
    source: "movie-locations.com Bohemian Rhapsody location coverage",
  },
  {
    ...base, slug: "imitation-game-lethaby-holborn", name: "The Imitation Game's MI6 (Lethaby Building)", type: "filming-location", scheme: "",
    subject: "The Imitation Game (2014) - MI6 headquarters interiors",
    hood: "Holborn", borough: "Camden", areaGuide: "bloomsbury-area-guide",
    address: "Southampton Row at Theobald's Road",
    whyGo: "A Central Saint Martins building doubled as MI6's wartime headquarters for Benedict Cumberbatch's Alan Turing to walk through - a working art-school building most passersby would never connect to the film.",
    opSummary: "A working educational building - viewable from the street only.",
    source: "thecinemaholic.com and moviemaps.org Imitation Game location coverage cross-checked",
  },
  {
    ...base, slug: "shaun-of-the-dead-crouch-end", name: "Shaun of the Dead's Corner Shop", type: "filming-location", scheme: "",
    subject: "Shaun of the Dead (2004) - Shaun's regular Coke-and-Cornetto run",
    hood: "Crouch End", borough: "Haringey", areaGuide: "",
    address: "96 Weston Park",
    whyGo: "Still a genuine, working corner shop (now a Londis) - the one Simon Pegg's character walks past a zombie apocalypse without noticing, one of several Crouch End addresses used across the film.",
    opSummary: "A working convenience shop with normal daily hours.",
    source: "Trainline's Shaun of the Dead location guide, cross-checked against Flickr documentation",
  },

  // -------------- EIGHTH PASS: the rest of the 2024 animal series --------------
  // Goat, Wolf, Big Cat and Monkeys are NOT included - all four are fully
  // gone (removed for building works, stolen, taken down same-day, or
  // removed by TfL) with nothing left to see anywhere, per instruction: if
  // it was removed with no replacement, don't add a row for it at all.
  // Piranhas moved rather than vanished, so it's filed at its new home - the
  // museum, not the original street corner - per instruction: if it moved,
  // add the new location, not the old one with a "moved" caveat.
  {
    ...base, slug: "banksy-piranhas-london-museum", name: "Banksy's Piranhas (at the London Museum)", type: "street-art", scheme: "",
    subject: "Day seven of the August 2024 animal series - a school of fish swimming inside a glass-panelled police telephone box",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "London Museum, West Smithfield",
    whyGo: "Banksy painted a school of piranhas onto the glass panels of a real police telephone box near St Paul's, turning it into what looked like a fish tank. The City of London Corporation donated the box to the new London Museum, where it goes on permanent public display.",
    opSummary: "The London Museum's new Smithfield building opens 28 November 2026 - check the museum is open and the piece is on display before visiting; it's a museum object now, not a street piece.",
    source: "Smithsonian Magazine, ArtNews and Londonist coverage of the museum donation, cross-checked against the museum's own 2026 opening announcement",
  },
  {
    ...base, slug: "banksy-london-zoo-gorilla", name: "Banksy's Gorilla (original REMOVED, replica in place)", type: "street-art", scheme: "",
    subject: "Day nine of the August 2024 animal series - the finale, a gorilla lifting the zoo's shutter",
    hood: "Camden Town", borough: "Camden", areaGuide: "camden-area-guide",
    address: "London Zoo, Regent's Park",
    whyGo: "The finale of the nine-day series - a gorilla appearing to lift the zoo's roller shutter to free a sea lion and several birds, on the actual entrance gate of London Zoo.",
    opSummary: "The ORIGINAL was removed by the zoo for safekeeping once crowds became unmanageable. A replica now stands in its place with a nearby sign reading \"Banksy woz ere\" and an apology to disappointed fans. Seeing the replica requires paid admission to London Zoo - it is no longer a free street piece.",
    source: "BBC News, ArtNews and Euronews coverage of the removal and replica, cross-checked",
  },

  // -------------------- NINTH PASS: 28 Days/Weeks Later --------------------
  {
    ...base, slug: "28-days-later-westminster-bridge", name: "28 Days Later's Empty Westminster Bridge", type: "filming-location", scheme: "",
    subject: "28 Days Later (2002) - Jim's walk through a deserted London",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Westminster Bridge",
    whyGo: "The single most iconic shot of the film - Cillian Murphy's character crossing a totally empty Westminster Bridge toward Parliament. No CGI: the crew held up early-morning traffic for brief windows over several days to get the streets genuinely empty.",
    opSummary: "A public bridge, always accessible - obviously never empty like the film today.",
    source: "ScreenRant and Time Out's \"how the bridge scene was filmed\" pieces, cross-checked",
  },
  {
    ...base, slug: "28-days-later-horse-guards-parade", name: "28 Days Later's Horse Guards Parade Scene", type: "filming-location", scheme: "",
    subject: "28 Days Later (2002) - Jim wandering through deserted central London",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Horse Guards Parade",
    whyGo: "Jim trudges through here and up the Mall to the Duke of York Steps, past useless drifting banknotes - part of the same empty-London sequence as the Westminster Bridge shot.",
    opSummary: "A public parade ground, always accessible outside ceremonial events.",
    source: "ScreenRant's 28 Days Later location coverage",
  },
  {
    ...base, slug: "28-days-later-centre-point", name: "28 Days Later's Car Alarm Scene (Centre Point)", type: "filming-location", scheme: "",
    subject: "28 Days Later (2002) - Jim sets off a car alarm at St Giles Circus",
    hood: "Soho", borough: "Camden", areaGuide: "soho-area-guide",
    address: "St Giles Circus, Tottenham Court Road",
    whyGo: "The same spot where a Banksy piece appeared in 2025 - the film sequence has Jim detour east past the Bank of England before setting off a car alarm here, a different reason to know this corner than the street art.",
    opSummary: "A busy public junction, viewable any time.",
    source: "ScreenRant's 28 Days Later location coverage",
  },
  {
    ...base, slug: "28-weeks-later-south-quay-footbridge", name: "28 Weeks Later's Isle of Dogs (South Quay Footbridge)", type: "filming-location", scheme: "",
    subject: "28 Weeks Later (2007) - \"District 1\", the quarantine zone",
    hood: "Canary Wharf", borough: "Tower Hamlets", areaGuide: "canary-wharf-area-guide",
    address: "South Quay Footbridge",
    whyGo: "The Isle of Dogs plays \"District 1\", the film's US-military quarantine zone - its high-rises and water on three sides made it a genuinely plausible containment site, and this footbridge features in a key chase.",
    opSummary: "A public footbridge, always accessible.",
    source: "latlong.net and railwaymoviedatabase.com 28 Weeks Later location coverage cross-checked",
  },
  {
    ...base, slug: "28-weeks-later-greenwich-foot-tunnel", name: "28 Weeks Later's Greenwich Foot Tunnel", type: "filming-location", scheme: "",
    subject: "28 Weeks Later (2007) - a chase sequence beneath the Thames",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "Greenwich Foot Tunnel",
    whyGo: "The Victorian pedestrian tunnel under the Thames, already an atmospheric spot in its own right, gets used for a tense sequence in the sequel - worth combining with a normal Greenwich-to-Island Gardens walk under the river.",
    opSummary: "Free and open 24 hours (lifts have restricted hours) - a genuine way to cross the river on foot, film connection aside.",
    source: "railwaymoviedatabase.com 28 Weeks Later location coverage",
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
