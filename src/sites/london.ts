import type { SiteConfig } from "./types";

export const londonSite: SiteConfig = {
  id: "london",
  theme: "editorial",
  name: "London Travel Geek",
  shortName: "LTG",
  description:
    "Practical, carefully researched London travel guides for getting around, exploring top neighbourhoods and making more of every day.",
  accentLabel: "The No-Fluff Travel Handbook",
  navigation: [
    {
      label: "Eat & Drink",
      href: "/topics/food-and-drink/",
      description: "Where to actually eat, researched list by list.",
      imageKey: "eat",
      // Nine, not the twelve this used to carry. The panel was twice the
      // height of the Areas one and the cuisine list could never be complete
      // anyway - the last link does that job.
      children: [
        { label: "Where to eat in London", href: "/articles/eat-in-london-guide/" },
        { label: "Best street food", href: "/articles/best-street-food-london/" },
        { label: "Best Indian restaurants", href: "/articles/best-indian-restaurants-london/" },
        { label: "Best pizza", href: "/articles/best-pizza-london/" },
        { label: "Best fish and chips", href: "/articles/best-fish-and-chips-london/" },
        { label: "Best Sunday roasts", href: "/articles/best-sunday-roast-london/" },
        { label: "Best afternoon tea", href: "/articles/best-afternoon-tea-london/" },
        { label: "Cheap eats", href: "/articles/cheap-eats-london/" },
        { label: "All food & drink guides", href: "/topics/food-and-drink/" },
      ],
    },
    {
      label: "Things to Do",
      href: "/topics/things-to-do/",
      description: "Museums, views, music and the parts of London people miss.",
      imageKey: "doing",
      children: [
        { label: "Free things to do", href: "/free/" },
        { label: "Best museums", href: "/articles/best-museums-london/" },
        { label: "Best views", href: "/articles/best-views-london/" },
        { label: "Immersive experiences", href: "/articles/immersive-experiences-london/" },
        { label: "Best live music venues", href: "/articles/best-live-music-venues-london/" },
        { label: "Best cabaret", href: "/articles/best-cabaret-london/" },
        { label: "Hidden London", href: "/articles/hidden-london-secret-places/" },
        { label: "London with children", href: "/articles/london-with-children/" },
        { label: "All things to do", href: "/topics/things-to-do/" },
      ],
      // Filtered to the current month at build time. This is where the site's
      // freshest and most-searched work lives, and the nav had no idea it
      // existed.
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
        { label: "Plaques map", href: "/plaques/" },
      ],
    },
    {
      label: "Areas",
      href: "/topics/london-areas/",
      description: "Every neighbourhood worth your time, compared honestly.",
      imageKey: "areas",
      // Twenty-eight area guides exist and the panel was showing three of
      // them. These are the ones people arrive already knowing the name of.
      children: [
        { label: "Best areas to visit", href: "/articles/best-areas-to-visit-london/" },
        { label: "Covent Garden", href: "/articles/covent-garden-area-guide/" },
        { label: "Soho", href: "/articles/soho-area-guide/" },
        { label: "Shoreditch", href: "/articles/shoreditch-area-guide/" },
        { label: "Camden", href: "/articles/camden-area-guide/" },
        { label: "Notting Hill", href: "/articles/notting-hill-area-guide/" },
        { label: "South Bank", href: "/articles/south-bank-area-guide/" },
        { label: "Greenwich", href: "/articles/greenwich-area-guide/" },
        { label: "Westminster", href: "/articles/westminster-area-guide/" },
        { label: "Kensington", href: "/articles/kensington-area-guide/" },
        { label: "The City of London", href: "/articles/city-of-london-area-guide/" },
        { label: "All 28 area guides", href: "/topics/london-areas/" },
      ],
      // The ones worth a journey that nobody types into a search box. Same
      // mechanism as the seasonal rail, with no months, so it always shows.
      secondary: {
        title: "Further out",
        children: [
          { label: "Hampstead", href: "/articles/hampstead-area-guide/" },
          { label: "Richmond", href: "/articles/richmond-area-guide/" },
          { label: "Peckham", href: "/articles/peckham-area-guide/" },
          { label: "Hackney", href: "/articles/hackney-area-guide/" },
          { label: "Stratford", href: "/articles/stratford-area-guide/" },
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
      // together they read as seven unrelated links.
      children: [
        { label: "Start here: which plan fits", href: "/articles/london-itineraries-by-days-and-interests/" },
        { label: "One day — 13 plans by interest", href: "/articles/one-day-london-itineraries-by-interest/" },
        { label: "Three days in London", href: "/articles/three-days-in-london-itinerary/" },
        { label: "Five days in London", href: "/articles/five-days-in-london-itinerary/" },
        { label: "All itineraries", href: "/topics/london-itineraries/" },
      ],
      secondary: {
        title: "Before you go",
        children: [
          { label: "London on a budget", href: "/articles/london-on-a-budget/" },
          { label: "Is the London Pass worth it?", href: "/articles/london-pass-guide/" },
          { label: "Travel SIM & eSIM", href: "/topics/travel-sim-cards/" },
          { label: "Getting around London", href: "/articles/getting-around-london-transport-guide/" },
          { label: "Public toilets", href: "/articles/public-toilets-london/" },
        ],
      },
    },
    {
      // "Getting Around" rather than "Transport": it is the site's own
      // category name, and it says what the reader is trying to do.
      label: "Getting Around",
      href: "/topics/getting-around-london/",
      description: "Oyster, the Tube, buses and every airport - decoded.",
      imageKey: "transport",
      children: [
        { label: "Getting around London", href: "/articles/getting-around-london-transport-guide/" },
        { label: "Oyster card guide", href: "/articles/oyster-card-guide-london/" },
        { label: "Using the Underground", href: "/articles/how-to-use-the-london-underground/" },
        { label: "Fares & travelcards", href: "/articles/london-public-transport-costs-and-fares/" },
        { label: "Buses and trams", href: "/articles/how-to-use-london-buses-and-trams/" },
        { label: "Heathrow to London", href: "/articles/heathrow-airport-to-london/" },
      ],
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
