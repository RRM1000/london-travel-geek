// Most-read ordering for the topic/section pages, from the analytics snapshot
// in data/analytics/latest.json (GA4 page views and GSC clicks over a
// trailing 28-day window - see scripts that write that file for how it is
// pulled). This file only reads it; nothing here calls an API.
import analytics from "../../data/analytics/latest.json";

interface Ga4PageRow {
  path: string;
  current?: { views?: number };
}

interface GscPageRow {
  clicks?: number;
}

const ga4Pages: Ga4PageRow[] = (analytics as any)?.ga4?.pages ?? [];
const gscPages: Record<string, GscPageRow> = (analytics as any)?.gsc?.pages ?? {};

const viewsByPath = new Map<string, number>();
for (const row of ga4Pages) {
  const views = row.current?.views;
  if (typeof views === "number" && views > 0) viewsByPath.set(row.path, views);
}

// GA4 views first, GSC clicks as the fallback (a page can be too new or too
// quiet to show up in GA4 but still be pulling search clicks), 0 otherwise.
export function articleScore(articleId: string): number {
  const path = `/articles/${articleId}/`;
  const views = viewsByPath.get(path);
  if (views) return views;
  const clicks = gscPages[path]?.clicks;
  if (typeof clicks === "number" && clicks > 0) return clicks;
  return 0;
}
