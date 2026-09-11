// Shared types for walking routes. One file per route lives in ./routes and is
// registered below - that split exists so several routes can be written at the
// same time without three people editing one file.
export type RouteMapStop = {
  stop: string;
  name: string;
  note: string;
  latitude: number;
  longitude: number;
  articleAnchor?: string;
  /** Drawn on the connecting line. Alternatives and detours sit off it. */
  onRoute?: boolean;
};

export type RouteConnection = {
  slug: string;
  label: string;
  /** The place both routes touch, named the same way in both articles. */
  where: string;
  detail: string;
};

import { stops as southBankWalk } from "./routes/south-bank-walk";
import { stops as cityOfLondonWalk } from "./routes/city-of-london-walk";
import { stops as westminsterWalk } from "./routes/westminster-walk";
import { stops as coventGardenWalk } from "./routes/covent-garden-walk";
import { stops as kingsCrossCamdenCanalWalk } from "./routes/kings-cross-camden-canal-walk";
import { stops as canaryWharfGreenwichWalk } from "./routes/canary-wharf-greenwich-walk";
import { stops as chelseaBelgraviaPlaquesWalk } from "./routes/chelsea-belgravia-plaques-walk";
import { stops as shoreditchSpitalfieldsWalk } from "./routes/shoreditch-spitalfields-walk";
import { stops as wappingCanaryWharfWalk } from "./routes/wapping-canary-wharf-walk";
import { stops as regentsParkMaryleboneWalk } from "./routes/regents-park-marylebone-walk";
import { stops as hampsteadHeathPrimroseHillWalk } from "./routes/hampstead-heath-primrose-hill-walk";
import { stops as fitzroviaMayfairWalk } from "./routes/fitzrovia-mayfair-walk";
import { stops as nottingHillColourfulHouses } from "./routes/notting-hill-colourful-houses";

export const routeMaps: Record<string, RouteMapStop[]> = {
  "fitzrovia-mayfair-walk": fitzroviaMayfairWalk,
  "notting-hill-colourful-houses": nottingHillColourfulHouses,
  "regents-park-marylebone-walk": regentsParkMaryleboneWalk,
  "hampstead-heath-primrose-hill-walk": hampsteadHeathPrimroseHillWalk,
  "south-bank-walk": southBankWalk,
  "city-of-london-walk": cityOfLondonWalk,
  "westminster-walk": westminsterWalk,
  "covent-garden-walk": coventGardenWalk,
  "kings-cross-camden-canal-walk": kingsCrossCamdenCanalWalk,
  "canary-wharf-greenwich-walk": canaryWharfGreenwichWalk,
  "chelsea-belgravia-plaques-walk": chelseaBelgraviaPlaquesWalk,
  "shoreditch-spitalfields-walk": shoreditchSpitalfieldsWalk,
  "wapping-canary-wharf-walk": wappingCanaryWharfWalk,
};

export const routeConnections: Record<string, RouteConnection[]> = {
  "wapping-canary-wharf-walk": [
    {
      slug: "canary-wharf-greenwich-walk",
      label: "Canary Wharf to Greenwich under the river",
      where: "Crossrail Place",
      detail:
        "This walk ends at the roof garden where that one starts. Carry on south through the foot tunnel. 11 stops, 6.5km.",
    },
  ],
  "canary-wharf-greenwich-walk": [
    {
      slug: "wapping-canary-wharf-walk",
      label: "Wapping to Canary Wharf along the docks",
      where: "Crossrail Place",
      detail:
        "Finishes at the roof garden where this one starts, so walk it first from St Katharine Docks. 11 stops, 6.5km.",
    },
  ],
  "south-bank-walk": [
    {
      slug: "city-of-london-walk",
      label: "The City of London: Bank to Tower Bridge",
      where: "Tower Bridge",
      detail:
        "Cross the bridge and walk it in reverse, or start it properly at Bank. 11 stops, 3km.",
    },
  ],
  "city-of-london-walk": [
    {
      slug: "south-bank-walk",
      label: "The South Bank: Westminster to Tower Bridge",
      where: "Tower Bridge",
      detail:
        "Cross to the south bank and walk it westwards to Westminster. 11 stops, 3km.",
    },
  ],
  "covent-garden-walk": [
    {
      slug: "south-bank-walk",
      label: "The South Bank: Westminster to Tower Bridge",
      where: "Waterloo Bridge",
      detail:
        "Somerset House is at the north end of the bridge. Cross it and you are at stop 4. 11 stops, 3km.",
    },
    {
      slug: "westminster-walk",
      label: "Westminster: the bridge to Trafalgar Square",
      where: "Trafalgar Square",
      detail:
        "Ends two minutes from where this one starts, so the pair run back to back. 11 stops, 4km.",
    },
  ],
  "westminster-walk": [
    {
      slug: "covent-garden-walk",
      label: "Covent Garden: Leicester Square to Somerset House",
      where: "Trafalgar Square",
      detail:
        "Starts two minutes north of where this one finishes. 11 stops, 2km.",
    },
  ],
};
