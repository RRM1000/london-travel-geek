// Hand-authored hotel maps, one list per article, plotted by ArticleLayout for
// any <div data-hotel-map="…"> in the markdown. Each pin is coloured by its
// category, and the article decides what the categories are: the aparthotels
// map colours by operator, the hostels map by dorm bathrooms exactly as the
// guide's own comparison table gives them. A new category needs a label below
// and a .hotel-map-key--/.hotel-map-marker-- colour in ArticleLayout.
//
// WHY NOT hotels.json: the sheet has no coordinates yet for most of these, and
// no row at all for the two Cheval properties or three of the four St
// Christopher's hostels. Every pin below was checked on 14 September 2026
// against its sourced address - OSM's own object for the building where one
// exists, otherwise the postcode centroid, and Cheval's own map pin for the two
// Cheval sites. The hostel pins are all OSM objects, each within 150 m of its
// postcode centroid and, where the operator publishes a map pin, within 20 m of
// that. Move a pin here, not in the sheet.
export type HotelMapCategory =
  // aparthotels-london, by operator
  | "locke"
  | "native"
  | "cheval"
  | "supercity"
  | "staycity"
  | "wilde"
  // best-hostels-london, by dorm bathrooms
  | "ensuite"
  | "some-ensuite"
  | "shared"
  | "unpublished";

export type HotelMapMarker = {
  name: string;
  category: HotelMapCategory;
  area: string;
  note: string;
  latitude: number;
  longitude: number;
  articleAnchor?: string;
};

// Shown in the popup as "{label} · {area}".
export const hotelCategoryLabels: Record<HotelMapCategory, string> = {
  locke: "Locke",
  native: "Native",
  cheval: "Cheval",
  supercity: "Supercity",
  staycity: "Staycity",
  wilde: "Wilde",
  ensuite: "En-suite dorms",
  "some-ensuite": "Some en-suite",
  shared: "Shared dorm bathrooms",
  unpublished: "Dorm bathrooms not published",
};

const byArea = "#by-area-and-by-how-you-get-there";
const operators = "#what-the-six-operators-actually-differ-on";
// The three St Christopher's sites without a heading of their own share this one.
const stChristophers = "#st-christophers--four-sites-and-they-are-not-the-same-hostel";

export const hotelMaps: Record<string, HotelMapMarker[]> = {
  "aparthotels-london": [
    {
      name: "Wilde Covent Garden",
      category: "wilde",
      area: "Covent Garden",
      note: "Adam Street, three minutes from the piazza. A full kitchen with a dishwasher.",
      latitude: 51.509877,
      longitude: -0.122295,
      articleAnchor: byArea,
    },
    {
      name: "Native Mayfair",
      category: "native",
      area: "Mayfair",
      note: "A mews off Grosvenor Square, three minutes from Bond Street.",
      latitude: 51.512161,
      longitude: -0.154367,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Moorgate",
      category: "locke",
      area: "City of London",
      note: "The Square Mile empties at weekends, so Saturday is often the cheapest night.",
      latitude: 51.517018,
      longitude: -0.088979,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Cannon Street",
      category: "locke",
      area: "City of London",
      note: "Kitchenette studios, a shared laundry room and a 24-hour front desk.",
      latitude: 51.512154,
      longitude: -0.093501,
      articleAnchor: byArea,
    },
    {
      name: "Native King's Wardrobe",
      category: "native",
      area: "City of London",
      note: "Carter Lane by St Paul's, with Counter downstairs and paid parking below.",
      latitude: 51.512973,
      longitude: -0.10072,
      articleAnchor: byArea,
    },
    {
      name: "The Chronicle",
      category: "supercity",
      area: "City of London",
      note: "Off Fetter Lane. A washer-dryer in every suite.",
      latitude: 51.51682,
      longitude: -0.10969,
      articleAnchor: byArea,
    },
    {
      name: "Cheval Three Quays",
      category: "cheval",
      area: "Tower Hill",
      note: "On the river between the Tower and Tower Bridge. One to three bedrooms.",
      latitude: 51.508474,
      longitude: -0.079573,
      articleAnchor: operators,
    },
    {
      name: "Leman Locke",
      category: "locke",
      area: "Whitechapel",
      note: "A couple of minutes from Whitechapel, about twelve to Bond Street without a change.",
      latitude: 51.514487,
      longitude: -0.070821,
      articleAnchor: byArea,
    },
    {
      name: "Buckle Street Studios",
      category: "locke",
      area: "Whitechapel",
      note: "Next door to Leman Locke, with smaller kitchenettes and a shared laundry.",
      latitude: 51.514474,
      longitude: -0.070392,
      articleAnchor: byArea,
    },
    {
      name: "Locke London Canary Wharf",
      category: "locke",
      area: "Canary Wharf",
      note: "On the Elizabeth line, with Heathrow under an hour direct.",
      latitude: 51.504231,
      longitude: -0.012437,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Landmark Pinnacle",
      category: "locke",
      area: "Canary Wharf",
      note: "Kitchenette studios; the one-bedroom apartments get a full kitchen.",
      latitude: 51.502715,
      longitude: -0.02548,
      articleAnchor: byArea,
    },
    {
      name: "Native Bankside",
      category: "native",
      area: "Bankside",
      note: "Behind the Globe, with its own gym and a washer-dryer in the apartment.",
      latitude: 51.507519,
      longitude: -0.095847,
      articleAnchor: byArea,
    },
    {
      name: "Bermonds Locke",
      category: "locke",
      area: "Bermondsey",
      note: "Tower Bridge Road, with a washer-dryer in the studio.",
      latitude: 51.499032,
      longitude: -0.079589,
      articleAnchor: byArea,
    },
    {
      name: "Staycity Greenwich High Road",
      category: "staycity",
      area: "Greenwich",
      note: "A minute from the station, eight from the Cutty Sark. Dishwasher in every apartment.",
      latitude: 51.476137,
      longitude: -0.018529,
      articleAnchor: byArea,
    },
    {
      name: "Staycity Deptford Bridge",
      category: "staycity",
      area: "Deptford",
      note: "On the DLR one stop from Greenwich, with a dishwasher and a fitness room.",
      latitude: 51.474303,
      longitude: -0.023058,
      articleAnchor: byArea,
    },
    {
      name: "Native Fulham Broadway",
      category: "native",
      area: "Fulham",
      note: "Zone 2 on the District line, ten minutes from Stamford Bridge.",
      latitude: 51.48348,
      longitude: -0.201158,
      articleAnchor: byArea,
    },
    {
      name: "Templeton Place",
      category: "supercity",
      area: "Earl's Court",
      note: "District and Piccadilly lines — Heathrow without a change. The cheapest Supercity.",
      latitude: 51.492512,
      longitude: -0.195656,
      articleAnchor: byArea,
    },
    {
      name: "Cheval Gloucester Park",
      category: "cheval",
      area: "South Kensington",
      note: "Eight minutes from the South Kensington museums, with parking and a cinema room.",
      latitude: 51.494533,
      longitude: -0.183876,
      articleAnchor: operators,
    },
  ],
  // In the comparison table's order. The category is that table's "Dorm
  // bathrooms" column; a blank there is "unpublished" unless the hostel's own
  // section states the arrangement.
  "best-hostels-london": [
    {
      name: "Wombat's City Hostel",
      category: "ensuite",
      area: "Wapping",
      note: "Dock Street, ten minutes' walk from Tower Bridge. Every dorm has its own shower and toilet.",
      latitude: 51.510486,
      longitude: -0.068158,
      articleAnchor: "#wombats-city-hostel--book-this-one",
    },
    {
      name: "St Christopher's Village",
      category: "some-ensuite",
      area: "London Bridge",
      note: "Two minutes from Borough Market. Oasis is a female-only floor with its own bathrooms and key card.",
      latitude: 51.502763,
      longitude: -0.091632,
      articleAnchor: stChristophers,
    },
    {
      name: "St Christopher's Liverpool Street",
      category: "shared",
      area: "Liverpool Street",
      note: "Above the Flying Horse. Female-only dorms, female-only bathrooms and air conditioning.",
      latitude: 51.520402,
      longitude: -0.08504,
      articleAnchor: stChristophers,
    },
    {
      name: "The Walrus",
      category: "unpublished",
      area: "Waterloo",
      note: "A bar with a hostel above it, five minutes from Waterloo — earplugs come with the rate.",
      latitude: 51.50004,
      longitude: -0.114454,
      articleAnchor: "#the-walrus",
    },
    {
      name: "St Christopher's The Inn",
      category: "shared",
      area: "London Bridge",
      note: "Above the pub on Borough High Street, with female-only dorms.",
      latitude: 51.503631,
      longitude: -0.090956,
      articleAnchor: stChristophers,
    },
    {
      // OSM has no object for this hostel, so the pin is Belushi's, the bar
      // downstairs at the hostel's own 13-15 Shepherd's Bush Green - 3 m from
      // St Christopher's own map pin.
      name: "St Christopher's Shepherd's Bush",
      category: "some-ensuite",
      area: "Shepherd's Bush",
      note: "Above Belushi's, with en-suite rooms available as well as shared bathrooms.",
      latitude: 51.504116,
      longitude: -0.218116,
      articleAnchor: stChristophers,
    },
    {
      name: "Clink 261",
      category: "shared",
      area: "King's Cross",
      note: "Ten minutes from King's Cross St Pancras. A shared bathroom on every room type, and strict 18+.",
      latitude: 51.52901,
      longitude: -0.120071,
      articleAnchor: "#clink-261--the-kings-cross-one-that-is-actually-open",
    },
    {
      name: "Generator London King's Cross",
      category: "shared",
      area: "Bloomsbury",
      note: "Five minutes from Russell Square. A party hostel, from £11 a bed in a large dorm.",
      latitude: 51.526329,
      longitude: -0.124507,
      articleAnchor: "#generator-london-kings-cross--the-cheapest-and-it-says-why",
    },
    {
      // OSM still names this building YHA London St Pancras. It is 79-81
      // Euston Road, 6 m from the pin on Kabannas' own map link.
      name: "Kabannas London St Pancras",
      category: "some-ensuite",
      area: "King's Cross",
      note: "Three minutes from St Pancras International, and no longer a YHA. Nest rooms are en-suite, from £130.",
      latitude: 51.528804,
      longitude: -0.126384,
      articleAnchor: "#kabannas-london-st-pancras--the-one-that-used-to-be-yha",
    },
    {
      name: "YHA London Central",
      category: "shared",
      area: "Fitzrovia",
      note: "Five minutes from Oxford Circus. All ages welcome, with unlimited continental breakfast.",
      latitude: 51.520601,
      longitude: -0.142444,
      articleAnchor: "#yha-london-central--the-sensible-one-and-the-family-one",
    },
    {
      name: "Astor Hyde Park",
      category: "ensuite",
      area: "South Kensington",
      note: "Opposite the Royal Albert Hall. En-suite dorms from £22, for ages 18 to 39.",
      latitude: 51.500365,
      longitude: -0.179672,
      articleAnchor: "#astor-hyde-park--the-best-building-with-a-catch",
    },
    {
      name: "Astor Victoria",
      category: "unpublished",
      area: "Pimlico",
      note: "Branded Victoria, addressed Pimlico — a walk to the coach station. Large mixed dorms from £18.",
      latitude: 51.490239,
      longitude: -0.137588,
      articleAnchor: "#astor-victoria--for-the-coach-station",
    },
    {
      name: "Palmers Lodge Swiss Cottage",
      category: "some-ensuite",
      area: "Swiss Cottage",
      note: "An 1882 Victorian mansion with en-suite Deluxe rooms — and car parking.",
      latitude: 51.545413,
      longitude: -0.176149,
      articleAnchor: "#palmers-lodge-swiss-cottage--the-mansion",
    },
    {
      name: "Safestay London Kensington Holland Park",
      category: "some-ensuite",
      area: "Holland Park",
      note: "Inside Holland Park itself, in the East Wing of a Jacobean house. Female dorms are en-suite.",
      latitude: 51.502834,
      longitude: -0.201911,
      articleAnchor: "#safestay-london-kensington-holland-park--inside-the-park",
    },
    {
      name: "Barmy Badger Backpackers",
      category: "some-ensuite",
      area: "Earl's Court",
      note: "A family-run house with dogs living on site. Two female-only dorms are en-suite.",
      latitude: 51.493496,
      longitude: -0.195913,
      articleAnchor: "#barmy-badger-backpackers--the-small-one",
    },
    {
      name: "Onefam Notting Hill",
      category: "shared",
      area: "Bayswater",
      note: "A short walk from Notting Hill Gate, with a free dinner most evenings.",
      latitude: 51.513289,
      longitude: -0.193046,
      articleAnchor: "#onefam-notting-hill--the-social-one-with-a-caveat",
    },
    {
      name: "Urbany Hostel London",
      category: "shared",
      area: "Bayswater",
      note: "On the same garden square as Onefam. Guests aged 18 to 40 only.",
      latitude: 51.513441,
      longitude: -0.191706,
      articleAnchor: "#urbany-hostel-london--read-the-age-line-first",
    },
    {
      name: "Park Villa",
      category: "some-ensuite",
      area: "Bow",
      note: "A Georgian villa two minutes from Mile End station. Half the rooms are en-suite.",
      latitude: 51.526879,
      longitude: -0.03652,
      articleAnchor: "#park-villa--georgian-small-and-out-east",
    },
  ],
};
