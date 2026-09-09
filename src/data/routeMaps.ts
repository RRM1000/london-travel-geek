// Hand-authored, unlike restaurantMaps.ts which is generated from the sheet.
// Walking routes are not restaurant rows: the stops are churches, markets,
// viewpoints and a bridge, none of which belong in the Restaurants v2 tab.
//
// `stop` is a label rather than an index on purpose. Where a route offers a
// choice between places that do the same job - the three City viewpoints are
// five minutes apart and you would only go up one - they share a number, and
// the map shows one numbered pin per option.
export type RouteMapStop = {
  stop: string;
  name: string;
  note: string;
  latitude: number;
  longitude: number;
  articleAnchor?: string;
  /** Drawn on the connecting line. Alternatives sit off it. */
  onRoute?: boolean;
};

export const routeMaps: Record<string, RouteMapStop[]> = {
  "city-of-london-walk": [
    {
      stop: "1",
      name: "Bank junction",
      note: "Where seven streets meet. The Royal Exchange, the Bank, Mansion House.",
      latitude: 51.51343,
      longitude: -0.086975,
      articleAnchor: "#1-bank-junction",
      onRoute: true,
    },
    {
      stop: "2",
      name: "Bank of England Museum",
      note: "Free. Weekdays only, 10am–5pm.",
      latitude: 51.514467,
      longitude: -0.087621,
      articleAnchor: "#2-the-bank-of-england-museum",
      onRoute: true,
    },
    {
      stop: "3",
      name: "Leadenhall Market",
      note: "Victorian ironwork. Lanes open all hours, traders weekdays.",
      latitude: 51.512728,
      longitude: -0.083395,
      articleAnchor: "#3-leadenhall-market",
      onRoute: true,
    },
    {
      stop: "4",
      name: "Lloyd's building",
      note: "Rogers's inside-out tower, in the middle of the cluster.",
      latitude: 51.512965,
      longitude: -0.082407,
      articleAnchor: "#4-the-tower-cluster",
      onRoute: true,
    },
    {
      stop: "5",
      name: "Horizon 22",
      note: "Free, booked. Level 58 — the highest free view in the city.",
      latitude: 51.514478,
      longitude: -0.082973,
      articleAnchor: "#5-a-view-from-the-top",
      onRoute: true,
    },
    {
      stop: "5",
      name: "Sky Garden",
      note: "Free ticket, book weeks ahead. 20 Fenchurch Street.",
      latitude: 51.51127,
      longitude: -0.08354,
      articleAnchor: "#5-a-view-from-the-top",
    },
    {
      stop: "5",
      name: "The Garden at 120",
      note: "Free, no booking at all. Closed bank holidays.",
      latitude: 51.51226,
      longitude: -0.080825,
      articleAnchor: "#5-a-view-from-the-top",
    },
    {
      stop: "6",
      name: "The Monument",
      note: "311 steps. Open daily, ticketed.",
      latitude: 51.510946,
      longitude: -0.086449,
      articleAnchor: "#6-the-monument",
      onRoute: true,
    },
    {
      stop: "7",
      name: "St Dunstan in the East",
      note: "The bombed church that became a garden. Free.",
      latitude: 51.509678,
      longitude: -0.082496,
      articleAnchor: "#7-st-dunstan-in-the-east",
      onRoute: true,
    },
    {
      stop: "8",
      name: "All Hallows by the Tower",
      note: "Roman pavement in the crypt. Free, open seven days.",
      latitude: 51.509394,
      longitude: -0.079301,
      articleAnchor: "#8-all-hallows-by-the-tower",
      onRoute: true,
    },
    {
      stop: "9",
      name: "Tower of London",
      note: "Book ahead. The one paid ticket on the route.",
      latitude: 51.508217,
      longitude: -0.076188,
      articleAnchor: "#9-the-tower-of-london",
      onRoute: true,
    },
    {
      stop: "10",
      name: "Tower Bridge",
      note: "Free to walk across. Ticketed for the high walkways.",
      latitude: 51.505517,
      longitude: -0.075366,
      articleAnchor: "#10-tower-bridge",
      onRoute: true,
    },
    {
      stop: "11",
      name: "St Katharine Docks",
      note: "The marina. Where to eat at the end, and open weekends.",
      latitude: 51.506541,
      longitude: -0.07165,
      articleAnchor: "#11-st-katharine-docks",
      onRoute: true,
    },
  ],
};
