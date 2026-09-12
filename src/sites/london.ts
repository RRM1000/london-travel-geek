import type { SiteConfig } from "./types";

export const londonSite: SiteConfig = {
  id: "london",
  theme: "editorial",
  name: "London Travel Geek",
  shortName: "LTG",
  description:
    "Practical, carefully researched London travel guides for getting around, exploring top neighbourhoods and making more of every day.",
  accentLabel: "The No-Fluff Travel Handbook",
  // EIGHT primary links per panel, no more and no fewer, with the eighth being
  // the "All <section>" link. The links render as a two-column grid, so eight
  // is two columns of four - which is the height of the panel image beside
  // them. Nine made one column four deep and the other five, and every panel a
  // different height from the last. Nothing is lost by trimming: the section's
  // topic page lists everything, and that is what the eighth link is for.
  navigation: [
    {
      label: "Eat & Drink",
      href: "/topics/food-and-drink/",
      description: "Where to actually eat, researched list by list.",
      imageKey: "eat",
      // Eight, not the twelve this used to carry. The cuisine list could never
      // be complete anyway - the last link does that job. What stays: the hub,
      // the five consensus-researched guides with the most searched-for
      // subjects, and the budget page.
      children: [
        { label: "Where to eat in London", href: "/articles/eat-in-london-guide/" },
        { label: "Best Indian restaurants", href: "/articles/best-indian-restaurants-london/" },
        { label: "Best pizza", href: "/articles/best-pizza-london/" },
        { label: "Best fish and chips", href: "/articles/best-fish-and-chips-london/" },
        { label: "Best Sunday roasts", href: "/articles/best-sunday-roast-london/" },
        { label: "Best afternoon tea", href: "/articles/best-afternoon-tea-london/" },
        { label: "Best street food", href: "/articles/best-street-food-london/" },
        { label: "All food & drink guides", href: "/topics/food-and-drink/" },
      ],
      // The money pages. Every panel now carries a third column (see the
      // three-column rule in SiteHeader), and this is the strand the eight
      // above cannot hold: the reader who has already chosen where to eat and
      // wants to pay less for it. Four, like every rail.
      secondary: {
        title: "Deals",
        children: [
          { label: "Set lunch & pre-theatre deals", href: "/articles/restaurant-deals-london/" },
          { label: "Restaurant discount cards", href: "/articles/restaurant-discount-cards-london/" },
          { label: "Kids eat free", href: "/articles/kids-eat-free-london/" },
          { label: "Off-peak restaurant apps", href: "/articles/off-peak-restaurant-apps-london/" },
        ],
      },
    },
    {
      label: "Things to Do",
      href: "/topics/things-to-do/",
      description: "Museums, views, music and the parts of London people miss.",
      imageKey: "doing",
      // The widest section on the site, so the eight have to cover ground
      // rather than pile up: free, museums, views, music, shopping, the
      // offbeat, and families. Immersive experiences, cabaret and the blue
      // plaques map came out - they are the narrowest of the eleven, and the
      // topic page opens with all of them.
      children: [
        { label: "Free things to do", href: "/free/" },
        { label: "Best museums", href: "/articles/best-museums-london/" },
        { label: "Best views", href: "/articles/best-views-london/" },
        { label: "Best live music venues", href: "/articles/best-live-music-venues-london/" },
        { label: "Shopping in London", href: "/articles/shopping-in-london/" },
        { label: "Hidden London", href: "/articles/hidden-london-secret-places/" },
        { label: "London with children", href: "/articles/london-with-children/" },
        { label: "All things to do", href: "/topics/things-to-do/" },
      ],
      // Filtered to the current month at build time. This is where the site's
      // freshest and most-searched work lives, and the nav had no idea it
      // existed.
      //
      // Ten entries, but never ten at once: the busiest month is October, where
      // five of these are in season. The rail renders the first four of
      // whatever matches (see inSeason in SiteHeader), which is the number that
      // stands the same height as the eight links and the image. Order matters
      // in October, then - the first four listed are the four that show.
      secondary: {
        title: "This season",
        children: [
          { label: "Halloween in London", href: "/articles/halloween-london/", months: [9, 10] },
          // From September: the big ticketed displays go on sale in early
          // October and the best ones sell out, so surfacing it the month
          // before is the useful moment, not the month of.
          { label: "Bonfire Night", href: "/articles/bonfire-night-london/", months: [9, 10, 11] },
          { label: "Christmas in London", href: "/articles/christmas-in-london/", months: [10, 11, 12] },
          { label: "Winter Wonderland", href: "/articles/hyde-park-winter-wonderland/", months: [10, 11, 12, 1] },
          { label: "London Film Festival", href: "/articles/london-film-festival/", months: [9, 10] },
          { label: "London in the rain", href: "/articles/london-in-the-rain/", months: [1, 2, 11, 12] },
          { label: "Best parks and gardens", href: "/articles/best-parks-gardens-london/", months: [4, 5, 6, 7, 8] },
          { label: "Wimbledon tickets", href: "/articles/wimbledon-tickets-guide/", months: [5, 6, 7, 9] },
          { label: "London Marathon", href: "/articles/london-marathon-guide/", months: [3, 4] },
          { label: "Best canal walks", href: "/articles/best-canal-walks-london/", months: [5, 6, 7, 8] },
        ],
      },
      seasonalFallback: [
        { label: "Best London markets", href: "/articles/best-london-markets/" },
        { label: "Best comedy clubs", href: "/articles/best-comedy-clubs-london/" },
        { label: "Filming locations", href: "/articles/london-filming-locations/" },
      ],
    },
    {
      label: "Areas",
      href: "/topics/london-areas/",
      description: "Every neighbourhood worth your time, compared honestly.",
      imageKey: "areas",
      // Twenty-eight area guides exist and the panel was showing three of
      // them. These are the ones people arrive already knowing the name of -
      // the hub plus one area per part of town, so the seven read as a map of
      // London rather than a list of the West End. Greenwich, Kensington, the
      // City and Notting Hill come out of the panel, not off the site.
      children: [
        { label: "Best areas to visit", href: "/articles/best-areas-to-visit-london/" },
        { label: "Covent Garden", href: "/articles/covent-garden-area-guide/" },
        { label: "Soho", href: "/articles/soho-area-guide/" },
        { label: "Westminster", href: "/articles/westminster-area-guide/" },
        { label: "South Bank", href: "/articles/south-bank-area-guide/" },
        { label: "Shoreditch", href: "/articles/shoreditch-area-guide/" },
        { label: "Camden", href: "/articles/camden-area-guide/" },
        { label: "All 29 area guides", href: "/topics/london-areas/" },
      ],
      // Walks, not more areas. This rail used to be "Further out" - Hampstead,
      // Richmond, Peckham, Hackney - which was a second helping of the column
      // beside it, and all four are one tap away on the page the eighth link
      // points at. The fourteen numbered walking routes had no entry in the
      // menu at all, and they are what a reader standing in an area actually
      // wants next. Three routes plus the tag page that holds the rest; same
      // four-deep cap as every other rail.
      secondary: {
        title: "Walks",
        children: [
          { label: "The South Bank walk", href: "/articles/south-bank-walk/" },
          { label: "The City of London walk", href: "/articles/city-of-london-walk/" },
          { label: "Wapping to Canary Wharf", href: "/articles/wapping-canary-wharf-walk/" },
          { label: "All walking routes", href: "/tags/walks/" },
        ],
      },
    },
    // WHERE TO STAY IS TEMPORARILY OUT OF THE MENU, on the site owner's call
    // 2026-09-06. The section is two pages old and the item read thin beside
    // five mature ones. /stay/ still exists and is still linked from the area
    // guides and the pod guide - this removes the nav entry, not the section.
    //
    // The exact block is saved in the scratchpad and in this commit's parent,
    // so putting it back is a revert rather than a rewrite. Restore it when
    // there are enough stay pages to fill a panel: hostels, cheap rooms, and
    // the constraint pages the Hotels sheet already has columns for.
    {
      label: "Stay",
      href: "/stay/",
      description: "Where to stay, by area and by kind of room.",
      imageKey: "stay",
      // Two questions, not one mixed list - the same split the Plan panel
      // uses. The eight answer "which part of London", so the areas that lost
      // their place to pod hotels and aparthotels get it back: Shoreditch and
      // Bermondsey were both one tap away and both are where the cheaper rooms
      // are. "Which kind of room" moved to the rail, where it reads as a
      // choice rather than as four more area pages.
      children: [
        { label: "Best areas to stay", href: "/articles/best-areas-to-stay-in-london/" },
        { label: "Soho & the West End", href: "/articles/where-to-stay-soho-west-end/" },
        { label: "Covent Garden", href: "/articles/where-to-stay-covent-garden/" },
        { label: "King's Cross & St Pancras", href: "/articles/where-to-stay-kings-cross/" },
        { label: "Shoreditch", href: "/articles/where-to-stay-shoreditch/" },
        // Labelled by the area alone, like Shoreditch and Covent Garden above
        // it: "Bermondsey & London Bridge" was the one label in any panel long
        // enough to wrap onto a second line and stand the whole panel a row
        // deeper than the other five.
        { label: "Bermondsey", href: "/articles/where-to-stay-bermondsey/" },
        { label: "Best hostels", href: "/articles/best-hostels-london/" },
        { label: "All places to stay", href: "/stay/" },
      ],
      // The constraint pages, which is how a reader with a long layover or a
      // tight budget actually searches. Day rooms and windowless rooms had no
      // nav entry at all; pods and aparthotels move here from the column above
      // rather than being listed twice in one panel. Hostels stays on the left
      // - it is the one of the five that is also a way of travelling.
      secondary: {
        title: "By type of room",
        children: [
          { label: "Day rooms (no overnight)", href: "/articles/day-rooms-london/" },
          { label: "Windowless rooms", href: "/articles/windowless-hotel-rooms-london/" },
          { label: "Capsule & pod hotels", href: "/articles/pod-hotels-london/" },
          { label: "Aparthotels", href: "/articles/aparthotels-london/" },
        ],
      },
    },
    {
      label: "Day Trips",
      href: "/articles/day-trips-from-london/",
      description: "Out of London and back in a day, priced and timed.",
      imageKey: "dayTrips",
      // Seven destinations and then the comparison page, which is this
      // section's "All" link - it used to lead the list as "Start here", but
      // every other panel ends with the page that holds the rest, and this one
      // should read the same way. Car hire moved out: it is a transport guide
      // and it sits on the transport topic page the Plan panel links to.
      children: [
        { label: "Harry Potter Studio Tour", href: "/articles/harry-potter-studio-tour/" },
        { label: "Windsor", href: "/articles/windsor-day-trip/" },
        { label: "Oxford", href: "/articles/oxford-day-trip/" },
        { label: "Cambridge", href: "/articles/cambridge-day-trip/" },
        { label: "Bath", href: "/articles/bath-day-trip/" },
        { label: "Stonehenge", href: "/articles/stonehenge-day-trip/" },
        { label: "The Cotswolds", href: "/articles/cotswolds-day-trip/" },
        { label: "All day trips compared", href: "/articles/day-trips-from-london/" },
      ],
      // Car hire was dropped from the column above as a transport guide with no
      // home; this is the home. The rail is the admin a day trip needs before
      // the ticket is bought - how you get there, what the fare costs, the
      // two-for-one you only get by arriving by train, and the entry permit
      // that applies before any of it. The Studio Tour is not here: it already
      // leads the eight.
      secondary: {
        title: "Before you go",
        children: [
          { label: "Hiring a car & driving", href: "/articles/car-hire-driving-uk/" },
          { label: "National Rail 2FOR1", href: "/articles/national-rail-2for1-london-attractions/" },
          { label: "Transport costs & fares", href: "/articles/london-public-transport-costs-and-fares/" },
          { label: "The UK ETA", href: "/articles/uk-eta-guide/" },
        ],
      },
    },
    {
      label: "Plan",
      href: "/topics/london-itineraries/",
      description: "Itineraries built around how much time you really have.",
      imageKey: "plan",
      // Two questions, not one list. The left column answers "how long have I
      // got"; the right answers "what do I need to sort before I fly". Mixed
      // together they read as seven unrelated links. Public toilets was the
      // ninth and answers neither question, so it leaves the panel - it is
      // still in the guides index, in search and in the articles that need it.
      children: [
        { label: "Start here: which plan fits", href: "/articles/london-itineraries-by-days-and-interests/" },
        { label: "One day — 13 plans by interest", href: "/articles/one-day-london-itineraries-by-interest/" },
        { label: "Three days in London", href: "/articles/three-days-in-london-itinerary/" },
        { label: "Five days in London", href: "/articles/five-days-in-london-itinerary/" },
        { label: "London on a budget", href: "/articles/london-on-a-budget/" },
        { label: "Is the London Pass worth it?", href: "/articles/london-pass-guide/" },
        { label: "Travel SIM & eSIM", href: "/topics/travel-sim-cards/" },
        { label: "All itineraries", href: "/topics/london-itineraries/" },
      ],
      // Four, like every other rail. Fares and the Underground how-to are both
      // one click on from the guide that leads this list, and the airport run
      // is the thing a reader needs before either of them.
      secondary: {
        title: "Getting around",
        children: [
          { label: "Getting around London", href: "/articles/getting-around-london-transport-guide/" },
          { label: "Oyster card guide", href: "/articles/oyster-card-guide-london/" },
          { label: "Heathrow to London", href: "/articles/heathrow-airport-to-london/" },
          { label: "All transport guides", href: "/topics/getting-around-london/" },
          // "Getting around London" used to sit here as well as leading the
          // Getting Around panel next door. A nav section underlines when the
          // page is any of its children, so being in two sections underlined
          // both Plan and Getting Around at once. It belongs to the section
          // named after it, and that section is one click away regardless.
        ],
      },
    },
    // "All Guides" is deliberately NOT here. Six top-level items plus the
    // logo and the search field overran the bar at every laptop width, and
    // this was the one carrying no unique destination: every panel already
    // ends with "All <section> guides", and the footer links it too. The
    // mobile menu renders it explicitly, where there is room.
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "All guides", href: "/guides/" },
    { label: "Privacy", href: "/privacy/" },
    { label: "RSS Feed", href: "/rss.xml" },
  ],
};
