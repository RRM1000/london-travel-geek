import type { RouteMapStop } from "../routeMaps";

// Coordinates from OSM Nominatim. Stop 1 is pinned at Selfridges, stop 3 at
// the Piccadilly end of Old Bond Street (so Google Maps walks the full length
// of Bond Street), stop 5 on the Quadrant at Air Street, and stop 8 on Floral
// Street's western half. Those four are points on a street, not mapped
// features, so they are approximate.
export const stops: RouteMapStop[] = [
  {
    stop: "1",
    name: "Oxford Street",
    note: "Start at Selfridges and walk east under the lights.",
    latitude: 51.515177,
    longitude: -0.15239,
    articleAnchor: "#1-oxford-street",
    onRoute: true,
  },
  {
    stop: "2",
    name: "South Molton Street",
    note: "The pedestrian cut from Bond Street station to Brook Street.",
    latitude: 51.513666,
    longitude: -0.147824,
    articleAnchor: "#2-south-molton-street",
    onRoute: true,
  },
  {
    stop: "3",
    name: "Bond Street",
    note: "A different design most years. Walk it to Piccadilly.",
    latitude: 51.508131,
    longitude: -0.140042,
    articleAnchor: "#3-bond-street",
    onRoute: true,
  },
  {
    stop: "4",
    name: "St James's Market",
    note: "The Spirits over a pedestrian square, two minutes off Piccadilly Circus.",
    latitude: 51.509118,
    longitude: -0.133252,
    articleAnchor: "#4-st-jamess-market",
    onRoute: true,
  },
  {
    stop: "5",
    name: "Regent Street and the Spirits",
    note: "The angels over the Quadrant, from Piccadilly Circus north.",
    latitude: 51.51005,
    longitude: -0.1364,
    articleAnchor: "#5-regent-street-and-the-spirits-of-christmas",
    onRoute: true,
  },
  {
    stop: "6",
    name: "Carnaby Street and Kingly Court",
    note: "Switch-on Wednesday 4 November 2026. Kingly Court for dinner.",
    latitude: 51.51301,
    longitude: -0.138669,
    articleAnchor: "#6-carnaby-street-and-kingly-court",
    onRoute: true,
  },
  {
    stop: "7",
    name: "Seven Dials",
    note: "Canopies of light hung from the sundial pillar.",
    latitude: 51.513754,
    longitude: -0.126905,
    articleAnchor: "#7-seven-dials",
    onRoute: true,
  },
  {
    stop: "8",
    name: "Floral Street",
    note: "A narrow cobbled street under the Covent Garden lights.",
    latitude: 51.512136,
    longitude: -0.124969,
    articleAnchor: "#8-floral-street",
    onRoute: true,
  },
  {
    stop: "9",
    name: "Covent Garden: the tree and the Market Building",
    note: "Switch-on Thursday 12 November 2026. Tree on the West Piazza.",
    latitude: 51.511979,
    longitude: -0.122741,
    articleAnchor: "#9-covent-garden-the-tree-and-the-market-building",
    onRoute: true,
  },
  {
    stop: "10",
    name: "Trafalgar Square",
    note: "The Norwegian tree, lit in early December.",
    latitude: 51.50845,
    longitude: -0.12845,
    articleAnchor: "#10-trafalgar-square",
    onRoute: true,
  },
];
