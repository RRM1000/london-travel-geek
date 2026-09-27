// Seasonal pins for the topic/section pages (src/pages/topics/[category].astro).
// While a slug's window is current, that guide is pulled to the top of its
// section in an "In season" strip - see groupArticles in ../lib/topicGroups.
//
// Windows are month/day pairs within a single calendar year; none of the
// entries below cross a year boundary (New Year's Eve stops at 31 Dec rather
// than running into January), so inSeasonWindow does not need to handle wrap.
// Every slug here must exist as a published article - the topics page checks
// that at build time and silently drops anything that does not, but keep the
// list itself honest rather than relying on that.
export interface SeasonalWindow {
  slug: string;
  startMonth: number; // 1-12
  startDay: number;
  endMonth: number;
  endDay: number;
}

export const SEASONAL_WINDOWS: SeasonalWindow[] = [
  { slug: "london-film-festival", startMonth: 9, startDay: 1, endMonth: 10, endDay: 18 },
  { slug: "halloween-london", startMonth: 9, startDay: 20, endMonth: 10, endDay: 31 },
  { slug: "mcm-comic-con-london", startMonth: 10, startDay: 1, endMonth: 10, endDay: 25 },
  { slug: "bonfire-night-london", startMonth: 10, startDay: 1, endMonth: 11, endDay: 5 },
  { slug: "christmas-in-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "christmas-markets-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "ice-skating-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "christmas-lights-walk-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "hyde-park-winter-wonderland", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "christmas-shows-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "christmas-day-restaurants-london", startMonth: 11, startDay: 1, endMonth: 12, endDay: 26 },
  { slug: "new-years-eve-london", startMonth: 12, startDay: 1, endMonth: 12, endDay: 31 },
  { slug: "london-marathon-guide", startMonth: 3, startDay: 1, endMonth: 4, endDay: 30 },
  { slug: "wimbledon-tickets-guide", startMonth: 6, startDay: 1, endMonth: 7, endDay: 15 },
];

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// The slug a monthly "Things to do" guide uses, from a 0-based month index.
export const monthlyGuideSlug = (monthIndex: number) =>
  `things-to-do-in-london-in-${MONTH_NAMES[monthIndex]}`;

const inWindow = (w: SeasonalWindow, month: number, day: number) => {
  const now = month * 100 + day;
  const start = w.startMonth * 100 + w.startDay;
  const end = w.endMonth * 100 + w.endDay;
  return now >= start && now <= end;
};

// Every slug currently in season, fixed windows plus the monthly guides.
// A monthly guide comes into season 10 days before its month starts, so a
// reader searching in late September already finds the October guide.
export function activeSeasonalSlugs(today: Date = new Date()): string[] {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const slugs = SEASONAL_WINDOWS.filter((w) => inWindow(w, month, day)).map((w) => w.slug);

  const daysInCurrentMonth = new Date(today.getFullYear(), month, 0).getDate();
  slugs.push(monthlyGuideSlug(today.getMonth()));
  if (day > daysInCurrentMonth - 10) {
    const nextMonthIndex = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    slugs.push(monthlyGuideSlug(nextMonthIndex));
  }
  return slugs;
}
