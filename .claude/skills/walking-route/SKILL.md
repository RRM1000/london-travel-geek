---
name: walking-route
description: Build a numbered London walking-route guide - an article of numbered stops in walking order with a Leaflet map, a Google Maps link and a day-by-day breakdown of what is open. Use when asked to create, add or write a walking route or walk for an area (South Bank, Westminster, a canal stretch, Canary Wharf to Greenwich), when asked to turn an area guide's suggested route into its own page, or when a route needs stops, a map or a Maps link. Covers the research standard, the map wiring, the SEO handoff and the area-guide integration.
---

# Walking route builder

One article shape, one file per route, one rule about search. Five routes exist and
they were all built this way: `city-of-london-walk`, `south-bank-walk`,
`westminster-walk`, `covent-garden-walk`, `kings-cross-camden-canal-walk`,
`canary-wharf-greenwich-walk`.

Read `src/content/articles/city-of-london-walk.md` and
`src/content/articles/south-bank-walk.md` before writing. They are the models.

## The rule this whole thing exists to protect

> The route is not the value. The day-by-day is.

Anyone can list eleven landmarks along a river. What no other page reliably carries
is **what is actually open when you get there**. Borough Market is shut on Mondays
and sits at stop nine of eleven. The Bank of England Museum is free and closed at
weekends. The National Theatre shuts on Sundays. Shakespeare's Globe cannot be
walked into at all. Every one of those came from an operator's own site, and every
one changes whether a reader's day works.

If a route cannot carry that layer, it does not need to exist — the area guide's
short version is enough.

---

## 1. Research before writing

**Facts come from operators, not memory.** Write a fetch script into `scratchpad/`
with the Write tool (never a heredoc — see [[heredoc-mangles-scripts]]) and pull
opening hours, closure days and prices from official sites. Strip scripts and
styles, then regex for day names and times.

Things that repeatedly turn out to be wrong if assumed:

- Markets have closure days. Borough is shut Mondays; Greenwich Market is **not**,
  despite what half the internet says.
- "Free museum" and "free attraction inside it" are different — the National
  Maritime Museum is free while the Royal Observatory is ticketed.
- Combined tickets rarely cover what people assume. The Greenwich day pass does not
  include the Painted Hall, which is a different organisation.
- Arts buildings close one day a week more often than attractions do.
- Seasonal venues reopen annually rather than trading through. Between the Bridges
  says "now open for 2026" on its own homepage.

**When a site blocks you**, try in this order: plain fetch with a browser
user-agent → a different path on the same domain → the operator's API if the page
is client-rendered → the browser tool. `hrp.org.uk` returns 403 to everything;
`rct.uk` needs JS for prices; Canal & River Trust's notices page is client-rendered
but `/api/stoppage/notices?waterway=RE` is not, and it carries live towpath
closures worth more than anything on the marketing pages.

**If a fact cannot be verified, leave the subject out of the copy entirely and ask
the user for it.** Never write "we could not find this" on the page, and never
guess. See [[ask-dont-publish-gaps]].

## 2. Coordinates

Geocode with OSM Nominatim, one request per second, descriptive user-agent:

```
https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<address>
```

Check every `display_name` is actually in the right area — a bare venue name will
happily return the wrong city. For things Nominatim cannot find (a stretch of
towpath, a tunnel rotunda) use Overpass or read the point off the OSM way, and say
in your report which coordinates are approximate.

To state a distance, measure it. Stitching the OSM towpath ways gave 1,941 m for
King's Cross to Camden, which is a fact; "about a mile and a half" is a guess that
happened to be close.

## 3. The route data file

One file per route at `src/data/routes/<slug>.ts`. **Never edit
`src/data/routeMaps.ts` to add stops** — it only imports and registers. That split
exists so several routes can be written at the same time without three agents
fighting over one file.

```ts
import type { RouteMapStop } from "../routeMaps";

export const stops: RouteMapStop[] = [
  {
    stop: "1",
    name: "Bank junction",
    note: "Where seven streets meet. One short clause, not a sentence.",
    latitude: 51.51343,
    longitude: -0.086975,
    articleAnchor: "#1-bank-junction",
    onRoute: true,
  },
];
```

- `onRoute: true` puts a stop on the dashed line and in the Google Maps URL.
- **Omit `onRoute`** for detours and alternatives. They render hollow and sit off
  the line. Use it when a route offers a choice between places doing the same job
  (the City's three free viewpoints all share `stop: "5"`) or an optional side trip
  (Leake Street is `stop: "+"`).

Register it in `routeMaps.ts` with an import line and a map entry. If routes join
up, add both directions to `routeConnections` naming the place they touch.

## 4. Anchors — the trap that has bitten every route

`articleAnchor` must match the heading Astro generates, which is the slugified
heading text **including the number**:

| Heading | Anchor |
|---|---|
| `## 1. Bank junction` | `#1-bank-junction` |
| `## 8. The Millennium Bridge and Shakespeare's Globe` | `#8-the-millennium-bridge-and-shakespeares-globe` |
| `## 9. Southwark Cathedral and Borough Market` | `#9-southwark-cathedral-and-borough-market` |

Apostrophes vanish; `and` stays. Verify by listing the built page's `h2` ids
against your anchor values rather than by eye.

## 5. The Google Maps link

Directly under the map block:

```
**[Open the whole route in Google Maps →](URL)** — all eleven stops in walking order, set to walking directions, which is the version to put on your phone.
```

```
https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG%7CLAT,LNG&travelmode=walking
```

**The hard limit is origin + 9 waypoints + destination = 11 points.** Only
`onRoute` stops go in. Four routes have landed on exactly 11, which is not a
coincidence — 11 is the number of stops this format holds. Generate the URL from
the route file so the two cannot drift apart.

Google routes through the Greenwich Foot Tunnel correctly; it does not always
label waypoints the way you named them. Test the URL before publishing if the route
does anything unusual.

## 6. The article

Frontmatter as the models: `title`, `seoTitle` (include "Walking Route" and "Map", and keep it to 55 characters or the build fails),
`description`, `heroImage`, `heroImageAlt`, `publishedAt`, `sites: [london]`,
`canonicalSite: london`, `category: "London areas"`, `tags`, `draft: false`, and 5–6
`faq` entries. Sections in this order:

1. Opening — what most people get wrong about this stretch.
2. `## The route` — the `<details>` map block (copy the markup exactly), the Google
   Maps link, then a cost/open table of every stop.
3. `## 1.` … `## 11.` — one section per stop, `##` not `###`.
4. `## Where to eat` — two or three places actually on the route, then a handoff to
   the area guide. Do not recommend somewhere fifteen minutes off it and then
   explain how far away it is.
5. `## The best day to go` — a day table, then what closes, then what does not.
   Make the positive case for the quiet day rather than only warning about it.
6. `## Getting there and back`, `## What to do with the rest of the day`.

One GetYourGuide widget is not needed by hand — `scripts/balance-gyg-widgets.mjs`
places them from word count. **Run it after the article exists**, not before.

## 7. The SEO rule — do this or do not build the route

An area guide almost always already has a `## Suggested N-hour walking route`, and
a themed page (`london-walks-along-the-thames`, `best-canal-walks-london`) often
has a section on the same stretch. **Two pages must not chase one phrase.**

- **The area guide**: convert `## Suggested … walking route` into `## Walking
  routes`, with the full route linked as a lead paragraph and the old numbered list
  demoted to `### The short version, if you only have N hours`. Use exactly that
  heading: `src/lib/splitAreaGuideBody.ts` recognises it and moves the section,
  with Common mistakes, below the generated sections as the page's closing note.
  Any other wording strands it mid-page.
- **A themed page whose heading is the exact-match phrase**: either keep the
  heading and compress the body to a summary plus a prominent handoff (the canal
  page), or rename the heading and move the exact phrase into the anchor text
  pointing at the new page (the Thames page's Canary Wharf section became "Under
  the river: the docks to the Observatory").
- **Itinerary articles** that describe the same walk in a paragraph need a one-line
  handoff, not a rewrite.

Then grep for the route's landmarks across all articles and check nothing else
duplicates it.

## 8. Area guide integration

In the `area:` frontmatter block, right after `bestDay:`:

```yaml
  walkingRoute:
    slug: "south-bank-walk"
    label: "Westminster to Tower Bridge"
    detail: "11 stops · 3km · 2–3 hours"
```

That renders a band across the foot of the At a glance card at the top of the page,
which is where someone deciding how to spend the day will see it. `label` is the
route, not the article title. A route spanning two areas goes in both guides.

## 9. Expect to find errors in the area guide

Every route so far has turned up factual mistakes on the guide it links to —
eleven across four guides. They are found because this is the first time anyone has
checked those claims against an operator.

**Fix them, and say so.** An article stating the market opens daily next to a guide
saying it shuts on Mondays is worse than either alone. Watch for a guide
contradicting *itself* — Westminster gave Horse Guards as Mon/Wed/Fri in one place
and Monday-to-Saturday forty lines later.

Do not hand-edit the italic facts strip under a restaurant heading; that is
generated by `scripts/sync-article-facts.mjs` from the sheet.

## 10. Before you finish

```bash
npm run build            # must pass
npm run audit:links      # the route must not be an orphan or a dead end
npm run audit:dates      # dated claims that will read as current after they lapse
node scripts/balance-gyg-widgets.mjs
```

Then check the rendered page, not the markdown: pins numbered in order, the dashed
line passing through every on-route stop, popup anchors jumping to the right
sections. The line uses `smoothFactor: 0` because Leaflet's default simplification
silently drops near-collinear vertices — it lost two stops on the South Bank's
river bend before that was set.

Hand the user a clickable preview link, once, when the page is first created. See
[[show-the-rendered-page]].

## Photographs

Borrow from the area guide's folder to publish, and say which you borrowed so the
owner can supply originals. When they arrive, `scripts/photo-gps.mjs` reads GPS and
capture time straight out of the EXIF, which places frames on a route far more
reliably than filenames — on both walks shot so far, capture order turned out to be
walking order. Re-encoding through sharp strips that EXIF, which is the behaviour
you want. See [[photos-fact-check-the-entry]].
