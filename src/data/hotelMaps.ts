// Hand-authored hotel maps, one list per article, plotted by ArticleLayout for
// any <div data-hotel-map="…"> in the markdown. Pins are coloured by operator.
//
// WHY NOT hotels.json: the sheet has no coordinates yet for seven of these,
// and nothing at all for the two Cheval properties. Every pin below was checked
// on 14 September 2026 against its sourced address - OSM's own object for the
// building where one exists, otherwise the postcode centroid, and Cheval's
// own map pin for the two Cheval sites. Move a pin here, not in the sheet.
export type HotelOperator = "locke" | "native" | "cheval" | "supercity" | "staycity" | "wilde";

export type HotelMapMarker = {
  name: string;
  operator: HotelOperator;
  area: string;
  note: string;
  latitude: number;
  longitude: number;
  articleAnchor?: string;
};

export const hotelOperatorLabels: Record<HotelOperator, string> = {
  locke: "Locke",
  native: "Native",
  cheval: "Cheval",
  supercity: "Supercity",
  staycity: "Staycity",
  wilde: "Wilde",
};

const byArea = "#by-area-and-by-how-you-get-there";
const operators = "#what-the-six-operators-actually-differ-on";

export const hotelMaps: Record<string, HotelMapMarker[]> = {
  "aparthotels-london": [
    {
      name: "Wilde Covent Garden",
      operator: "wilde",
      area: "Covent Garden",
      note: "Adam Street, three minutes from the piazza. A full kitchen with a dishwasher.",
      latitude: 51.509877,
      longitude: -0.122295,
      articleAnchor: byArea,
    },
    {
      name: "Native Mayfair",
      operator: "native",
      area: "Mayfair",
      note: "A mews off Grosvenor Square, three minutes from Bond Street.",
      latitude: 51.512161,
      longitude: -0.154367,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Moorgate",
      operator: "locke",
      area: "City of London",
      note: "The Square Mile empties at weekends, so Saturday is often the cheapest night.",
      latitude: 51.517018,
      longitude: -0.088979,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Cannon Street",
      operator: "locke",
      area: "City of London",
      note: "Kitchenette studios, a shared laundry room and a 24-hour front desk.",
      latitude: 51.512154,
      longitude: -0.093501,
      articleAnchor: byArea,
    },
    {
      name: "Native King's Wardrobe",
      operator: "native",
      area: "City of London",
      note: "Carter Lane by St Paul's, with Counter downstairs and paid parking below.",
      latitude: 51.512973,
      longitude: -0.10072,
      articleAnchor: byArea,
    },
    {
      name: "The Chronicle",
      operator: "supercity",
      area: "City of London",
      note: "Off Fetter Lane. A washer-dryer in every suite.",
      latitude: 51.51682,
      longitude: -0.10969,
      articleAnchor: byArea,
    },
    {
      name: "Cheval Three Quays",
      operator: "cheval",
      area: "Tower Hill",
      note: "On the river between the Tower and Tower Bridge. One to three bedrooms.",
      latitude: 51.508474,
      longitude: -0.079573,
      articleAnchor: operators,
    },
    {
      name: "Leman Locke",
      operator: "locke",
      area: "Whitechapel",
      note: "A couple of minutes from Whitechapel, about twelve to Bond Street without a change.",
      latitude: 51.514487,
      longitude: -0.070821,
      articleAnchor: byArea,
    },
    {
      name: "Buckle Street Studios",
      operator: "locke",
      area: "Whitechapel",
      note: "Next door to Leman Locke, with smaller kitchenettes and a shared laundry.",
      latitude: 51.514474,
      longitude: -0.070392,
      articleAnchor: byArea,
    },
    {
      name: "Locke London Canary Wharf",
      operator: "locke",
      area: "Canary Wharf",
      note: "On the Elizabeth line, with Heathrow under an hour direct.",
      latitude: 51.504231,
      longitude: -0.012437,
      articleAnchor: byArea,
    },
    {
      name: "Cove by Locke Landmark Pinnacle",
      operator: "locke",
      area: "Canary Wharf",
      note: "Kitchenette studios; the one-bedroom apartments get a full kitchen.",
      latitude: 51.502715,
      longitude: -0.02548,
      articleAnchor: byArea,
    },
    {
      name: "Native Bankside",
      operator: "native",
      area: "Bankside",
      note: "Behind the Globe, with its own gym and a washer-dryer in the apartment.",
      latitude: 51.507519,
      longitude: -0.095847,
      articleAnchor: byArea,
    },
    {
      name: "Bermonds Locke",
      operator: "locke",
      area: "Bermondsey",
      note: "Tower Bridge Road, with a washer-dryer in the studio.",
      latitude: 51.499032,
      longitude: -0.079589,
      articleAnchor: byArea,
    },
    {
      name: "Staycity Greenwich High Road",
      operator: "staycity",
      area: "Greenwich",
      note: "A minute from the station, eight from the Cutty Sark. Dishwasher in every apartment.",
      latitude: 51.476137,
      longitude: -0.018529,
      articleAnchor: byArea,
    },
    {
      name: "Staycity Deptford Bridge",
      operator: "staycity",
      area: "Deptford",
      note: "On the DLR one stop from Greenwich, with a dishwasher and a fitness room.",
      latitude: 51.474303,
      longitude: -0.023058,
      articleAnchor: byArea,
    },
    {
      name: "Native Fulham Broadway",
      operator: "native",
      area: "Fulham",
      note: "Zone 2 on the District line, ten minutes from Stamford Bridge.",
      latitude: 51.48348,
      longitude: -0.201158,
      articleAnchor: byArea,
    },
    {
      name: "Templeton Place",
      operator: "supercity",
      area: "Earl's Court",
      note: "District and Piccadilly lines — Heathrow without a change. The cheapest Supercity.",
      latitude: 51.492512,
      longitude: -0.195656,
      articleAnchor: byArea,
    },
    {
      name: "Cheval Gloucester Park",
      operator: "cheval",
      area: "South Kensington",
      note: "Eight minutes from the South Kensington museums, with parking and a cinema room.",
      latitude: 51.494533,
      longitude: -0.183876,
      articleAnchor: operators,
    },
  ],
};
