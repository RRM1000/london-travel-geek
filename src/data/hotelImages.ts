// One photo per property for the "Book a …" cards, keyed by hotels.json slug.
//
// Every entry reuses a photo a guide already carries, and each was checked
// on 14 September 2026: the picture shows the room its caption describes, and
// no other property's page uses the same image. That second check exists
// because it failed once - one living room had been filed as both Native
// Bankside and Native Mayfair - so a property whose only photo is in doubt is
// left out rather than guessed. A slug with no entry renders a card without an
// image, which is the right result for it.
//
// Prefer the room, kitchen or living area. A bathroom is not a card photo.
import type { ImageMetadata } from "astro";

import wildeCoventGarden from "../assets/articles/aparthotels-london/wilde-covent-garden-studio.jpg";
import bermondsLocke from "../assets/articles/aparthotels-london/bermonds-locke-studio.jpg";
import buckleStreetStudios from "../assets/articles/aparthotels-london/buckle-street-studios-bedroom.jpg";
import chevalGloucesterPark from "../assets/articles/aparthotels-london/cheval-gloucester-park-bedroom.jpg";
import chevalThreeQuays from "../assets/articles/aparthotels-london/cheval-three-quays-living-area.jpg";
import coveCannonStreet from "../assets/articles/aparthotels-london/cove-cannon-street-studio.jpg";
import coveLandmarkPinnacle from "../assets/articles/aparthotels-london/cove-landmark-pinnacle-studio.jpg";
import lemanLocke from "../assets/articles/aparthotels-london/leman-locke-studio.jpg";
import nativeFulham from "../assets/articles/aparthotels-london/native-fulham-studio.jpg";
import nativeKingsWardrobe from "../assets/articles/aparthotels-london/native-kings-wardrobe-kitchen.jpg";
import staycityDeptford from "../assets/articles/aparthotels-london/staycity-deptford-bridge-bedroom.jpg";
import staycityGreenwich from "../assets/articles/aparthotels-london/staycity-greenwich-high-road-bedroom.jpg";
import templetonPlace from "../assets/articles/aparthotels-london/templeton-place-studio.jpg";
import theChronicle from "../assets/articles/aparthotels-london/the-chronicle-bedroom.jpg";
import lockeBrokenWharf from "../assets/articles/where-to-stay-shoreditch/locke-at-broken-wharf-room.jpg";

export type HotelImage = { src: ImageMetadata; alt: string };

export const hotelImages: Record<string, HotelImage> = {
  "wilde-aparthotels-covent-garden": { src: wildeCoventGarden, alt: "A studio at Wilde Covent Garden" },
  "bermonds-locke": { src: bermondsLocke, alt: "A studio at Bermonds Locke, with the kitchenette along the back wall" },
  "buckle-street-studios": { src: buckleStreetStudios, alt: "A room at Buckle Street Studios" },
  "cheval-gloucester-park": { src: chevalGloucesterPark, alt: "A bedroom at Cheval Gloucester Park" },
  "cheval-three-quays": { src: chevalThreeQuays, alt: "The living area of an apartment at Cheval Three Quays" },
  "cove-cannon-street": { src: coveCannonStreet, alt: "A studio at Cove Cannon Street, with the kitchenette in the same room" },
  "cove-landmark-pinnacle": { src: coveLandmarkPinnacle, alt: "A studio at Cove Landmark Pinnacle" },
  "leman-locke": { src: lemanLocke, alt: "A studio at Leman Locke" },
  "native-fulham-broadway": { src: nativeFulham, alt: "A studio at Native Fulham Broadway" },
  "native-kings-wardrobe": { src: nativeKingsWardrobe, alt: "The kitchenette at Native King's Wardrobe" },
  "staycity-deptford-bridge": { src: staycityDeptford, alt: "A bedroom at Staycity Deptford Bridge" },
  "staycity-greenwich-high-road": { src: staycityGreenwich, alt: "A bedroom at Staycity Greenwich High Road" },
  "supercity-templeton-place": { src: templetonPlace, alt: "A studio at Templeton Place" },
  "supercity-chronicle": { src: theChronicle, alt: "A bedroom at The Chronicle" },
  "locke-at-broken-wharf": { src: lockeBrokenWharf, alt: "A room at Locke at Broken Wharf, looking across the river to the Globe" },
};
