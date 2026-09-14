import type { RouteMapStop } from "../routeMaps";

// Coordinates are Londonist's own pins for each work (their Banksy map, last
// updated 1 May 2026), cross-checked by reverse geocoding: every one resolves
// to the street the article names.
//
// Two legs are ridden, not walked: stop 2 to 3 is the Central line from
// Tottenham Court Road to Bank, and stop 7 to 8 is the Weaver line from
// Liverpool Street to Stoke Newington. The dashed line still joins the stops in
// order, so across those two legs it is a straight line, not a street route.
export const stops: RouteMapStop[] = [
  {
    stop: "1",
    name: "Blind Patriotism",
    note: "The April 2026 statue on Waterloo Place. Behind fencing, free, always.",
    latitude: 51.506878,
    longitude: -0.132431,
    articleAnchor: "#1-blind-patriotism-waterloo-place",
    onRoute: true,
  },
  {
    stop: "2",
    name: "Stargazing Children",
    note: "St Giles Square at Centre Point. Behind perspex, damaged, still visible.",
    latitude: 51.51611,
    longitude: -0.130139,
    articleAnchor: "#2-stargazing-children-centre-point",
    onRoute: true,
  },
  {
    stop: "+",
    name: "London Transport Museum",
    note: "The Croydon clock rat, indoors. Ticketed, daily 10am-6pm.",
    latitude: 51.511979,
    longitude: -0.121202,
    articleAnchor: "#the-detour-the-rat-in-the-london-transport-museum",
  },
  {
    stop: "3",
    name: "The Cannon Street rat",
    note: "Steelyard Passage, under the station on the Thames Path. Faded. Central line to Bank.",
    latitude: 51.509389,
    longitude: -0.090914,
    articleAnchor: "#3-the-cannon-street-rat",
    onRoute: true,
  },
  {
    stop: "4",
    name: "The Basquiat pair",
    note: "Two 2017 murals in the Beech Street tunnel under the Barbican.",
    latitude: 51.520855,
    longitude: -0.094043,
    articleAnchor: "#4-the-basquiat-pair-beech-street",
    onRoute: true,
  },
  {
    stop: "+",
    name: "London Museum",
    note: "The piranhas police box, from 28 November 2026. Free entry.",
    latitude: 51.5185,
    longitude: -0.103897,
    articleAnchor: "#the-detour-the-piranhas-at-the-london-museum",
  },
  {
    stop: "5",
    name: "The I Love London rat",
    note: "Chiswell Street. The best-preserved of the early rats.",
    latitude: 51.521038,
    longitude: -0.091486,
    articleAnchor: "#5-the-i-love-london-rat-chiswell-street",
    onRoute: true,
  },
  {
    stop: "6",
    name: "The Foundry pair",
    note: "A rat and a thrown TV from 2004, on the front of art'otel Hoxton.",
    latitude: 51.526219,
    longitude: -0.083246,
    articleAnchor: "#6-the-foundry-pair-artotel-hoxton",
    onRoute: true,
  },
  {
    stop: "7",
    name: "The Pink Car",
    note: "Ely's Yard, Old Truman Brewery. Weathered, in a perspex box.",
    latitude: 51.521055,
    longitude: -0.073417,
    articleAnchor: "#7-the-pink-car-old-truman-brewery",
    onRoute: true,
  },
  {
    stop: "8",
    name: "The Royal Family",
    note: "Stoke Newington Church Street, since 2001. Weaver line to Stoke Newington.",
    latitude: 51.561867,
    longitude: -0.080576,
    articleAnchor: "#8-the-royal-family-stoke-newington",
    onRoute: true,
  },
];
