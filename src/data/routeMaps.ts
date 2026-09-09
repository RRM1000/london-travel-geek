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

export const routeMaps: Record<string, RouteMapStop[]> = {
  "south-bank-walk": southBankWalk,
  "city-of-london-walk": cityOfLondonWalk,
  "westminster-walk": westminsterWalk,
  "covent-garden-walk": coventGardenWalk,
  "kings-cross-camden-canal-walk": kingsCrossCamdenCanalWalk,
  "canary-wharf-greenwich-walk": canaryWharfGreenwichWalk,
};

export const routeConnections: Record<string, RouteConnection[]> = {
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
};
