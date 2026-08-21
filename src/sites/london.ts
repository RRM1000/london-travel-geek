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
      children: [
        { label: "Where to eat in London", href: "/articles/eat-in-london-guide/" },
        { label: "Best Indian restaurants", href: "/articles/best-indian-restaurants-london/" },
        { label: "Best Sunday roasts", href: "/articles/best-sunday-roast-london/" },
        { label: "All food & drink guides", href: "/topics/food-and-drink/" },
      ],
    },
    {
      label: "Areas",
      href: "/topics/london-areas/",
      description: "Every neighbourhood worth your time, compared honestly.",
      imageKey: "areas",
      children: [
        { label: "Best areas to visit", href: "/articles/best-areas-to-visit-london/" },
        { label: "Notting Hill", href: "/articles/notting-hill-area-guide/" },
        { label: "Shoreditch", href: "/articles/shoreditch-area-guide/" },
        { label: "Greenwich", href: "/articles/greenwich-area-guide/" },
        { label: "All area guides", href: "/topics/london-areas/" },
      ],
    },
    {
      label: "Plan",
      href: "/topics/london-itineraries/",
      description: "Itineraries built around how much time you really have.",
      imageKey: "plan",
      children: [
        { label: "Itineraries by days & interests", href: "/articles/london-itineraries-by-days-and-interests/" },
        { label: "One day in London", href: "/articles/one-day-london-itineraries-by-interest/" },
        { label: "Three days in London", href: "/articles/three-days-in-london-itinerary/" },
        { label: "Five days in London", href: "/articles/five-days-in-london-itinerary/" },
        { label: "Travel SIM & eSIM", href: "/topics/travel-sim-cards/" },
      ],
    },
    {
      label: "Transport",
      href: "/topics/getting-around-london/",
      description: "Oyster, the Tube, buses and every airport - decoded.",
      imageKey: "transport",
      children: [
        { label: "Getting around London", href: "/articles/getting-around-london-transport-guide/" },
        { label: "Oyster card guide", href: "/articles/oyster-card-guide-london/" },
        { label: "Using the Underground", href: "/articles/how-to-use-the-london-underground/" },
        { label: "Fares & travelcards", href: "/articles/london-public-transport-costs-and-fares/" },
        { label: "Heathrow to London", href: "/articles/heathrow-airport-to-london/" },
      ],
    },
    { label: "All Guides", href: "/guides/" },
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "All guides", href: "/guides/" },
    { label: "Privacy", href: "/privacy/" },
    { label: "RSS Feed", href: "/rss.xml" },
  ],
};
