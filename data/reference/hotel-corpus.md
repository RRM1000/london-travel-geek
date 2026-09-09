# The hotel corpus: how a property gets onto the shortlist

How `data/hotel-candidates-from-guides.json` and `data/consensus/hotels*.json`
are built, what each pass is worth, and the traps that have actually bitten.

Written 9 September 2026, after the first full run across eleven hotel topics.

## The rule the whole thing hangs off

> "I don't want data coming from the booking websites, obviously. It needs to
> come from guides and especially bloggers." - Rob

Booking engines rank by inventory and commission. A hotel appearing on
Booking.com, Hotels.com, Expedia, Tripadvisor, Agoda or Hostelworld tells you
it pays them, not that anyone rates it. They are refused at the door by
`scripts/seed-sources.mjs`.

Brand sites are out for the same reason: premierinn.com listing its own hotels
is not a recommendation.

**Hotels.com has exactly one job, and it is the opposite one.** Once a property
has been *named* by a real source, Hotels.com answers "does it exist and can it
be booked", because one that cannot be booked there can never carry an
affiliate link. Validator, never a source. (Its typeahead answers curl with a
CAPTCHA, so this check needs the browser and is currently unrun.)

And the standing rule that governs what you may then *write*: see
`sheet-is-not-the-market` in memory. The sheet is a curated shortlist. It is
never evidence about what an area does or does not have.

## The topics

Eleven corpora, one file each in `data/serp/` and `data/consensus/`:

| Topic | What it is for |
|---|---|
| `hotels` | the general "best hotels in London" pool |
| `hotels-budget` | the cheap end |
| `hostels` | dorms and backpacker beds |
| `hotels-shoreditch` | ─┐ |
| `hotels-soho` | │ |
| `hotels-covent-garden` | ├ one per where-to-stay area guide |
| `hotels-kings-cross` | │ |
| `hotels-south-kensington` | │ |
| `hotels-bermondsey` | ─┘ |
| `hotels-boutique` | the independent/design cut |
| `hotels-family` | family rooms, interconnecting, cots |

Area corpora exist because the where-to-stay guides are area guides. A general
"best hotels in London" list is Mayfair-heavy and says nothing about King's
Cross.

## The pipeline

```bash
# 1. SERP discovery - see "Finding sources" below, this part is manual
# 2. write data/serp/<topic>.txt as `Source name|url` lines
node scripts/seed-sources.mjs --topic=<topic> --file=data/serp/<topic>.txt
node scripts/consensus.mjs <topic> --fetch
# 3. clean + diff against the sheet (the scratchpad scripts; see below)
```

`consensus.mjs` scores a name by how many **independent sources** name it.
Deliberately blunt: anything cleverer would encode my taste, which is the thing
being corrected.

## Finding sources: SERP-first, and the search engines keep closing

The rule (`data/serp/README.md`) is: run the search the reader runs, and take
what the SERP gives you. The word "blog" in the query pulls the independents
above the mastheads, which is the point.

**What works, as of 9 September 2026:**

| Route | State |
|---|---|
| `WebSearch` tool | crashes Claude Code here - see the `no-parallel-websearch-agents` memory |
| DuckDuckGo html endpoint via curl | **dead.** Returns a page with zero result links. Not a CAPTCHA - it looks like "no sources found" |
| Bing via curl | **dead.** Serves curl a dictionary-definition page for "best" |
| **DuckDuckGo in the browser pane** | **works.** This is the route |

The browser route, one query at a time:

```js
// navigate to https://duckduckgo.com/?q=<query>&ia=web then:
[...document.querySelectorAll('a[data-testid="result-title-a"], a.result__a')]
  .map(a => a.href)
  .filter(u => /^https?:/.test(u) && !BLOCKED.test(u))
```

Batch four queries per `browser_batch` call. Exclude `londontravelgeek.co.uk`
from results or the corpus cites us citing ourselves.

## The trap that matters most: AI SEO farms

`lamplitlondon.com` ranked in five of the eight area searches. It looks
excellent. It is a machine.

The tells, in the order they are worth checking:

1. **No named human.** "The Lamplit Editors", "First Time in London Team". A
   blogger has a name. Weak on its own - some real outlets use a desk byline -
   but it is the first thing to look at.
2. **Every guide is the same length.** "5 PLACES", "4 PLACES", "6 PLACES" on
   every card, 4-7 items each, ~1,000 words each. Humans write uneven lists.
3. **Raw keyword slugs sitting beside written titles.** Lamplit's index has
   `alice in wonderland afternoon tea london` and `big mamma london` next to
   `A Day Trip to Bath from London`. That mix is programmatic keyword targeting
   with an editorial veneer over the top.
4. **Complete grid coverage.** Every neighbourhood, every occasion, every
   season, all published at once. A real blog has gaps and favourites.
5. **A "how we choose" page that protests too much.** "We visit anonymously,
   pay our own way, and recommend on merit alone."

Note what does **not** catch it: the name array is clean. Lamplit's Shoreditch
page names One Hundred Shoreditch, The Hoxton, Boundary, Mondrian and M by
Montcalm - all real, all plausible, all correct. This is the
`content-farm-passes-clean-name-array` memory. You cannot detect a farm from
its output; you have to look at the site.

**The aggregator shape** is separate and easier: a `<city>_<area>` URL template
across the whole world. `luxuryhotel.guide/london_soho/`,
`boutiquehotel.guru/london_bermondsey/`, `new-hotels-guide.com/london_soho/`,
`explorecities.com/hotels-in-south-kensington/`. If the same page exists for
Prague, it is a database with a stylesheet.

Excluded on 9 Sept 2026, recorded in every `data/serp/hotels-*.txt` header:
lamplitlondon.com, explorecities.com, luxuryhotel.guide, boutiquehotel.guru,
new-hotels-guide.com, where-stay.com, choosewhere.com, hotelradar.co.uk,
pmahotels.org, taketravelinfo.com, myboutiquehotel.com, dyme.earth,
bestboutiquehotelsworldwide.com, theluxuryeditor.com, blog.hotelslash.com.

Verified as real and kept: allaroundlondon.com (Dan, ~2,000 words, "honest
picks from a local"), stubborntravel.com (Jules, 3,281 words), loveandlondon.com
(Jessica Dante), candaceabroad.com, anywhereweroam.com, sunnyinlondon.com,
tjtakesthetrain.com, thelondonmother.net, thatsup.co.uk.

## Counting: a blog is one voice, however many pages it writes

Love and London has five accommodation pages. Each was scoring as a separate
source, which briefly promoted her byline and a photo caption to
"four-source candidates".

**`namedBy` counts distinct DOMAINS.** The page names stay in `sources` so the
trail is auditable. This is trap 8 from the `consensus-collection-traps` memory
in its most literal form.

## The other passes, and what each is actually worth

### Web guides and blogs - the load-bearing one

Eleven corpora, ~60 sources. This produces essentially all of the signal.

### Video - almost worthless for hotels, one good accident

`scripts/video-research.mjs` reads **chapters**, because a "best Italian in
London" video is a listicle and each chapter is a restaurant. **Hotel videos
are not listicles.** They are single-property reviews, so the chapters are
"Suite Tour", "Breakfast", "The Spa", and the property name is in the title.

A title-based extractor was written (`scratchpad/hotel-video.mjs`) and run
across three topics and ~88 creators. Titles turn out to be clickbait: "I
Stayed in Britain's CHEAPEST Capsule Hotel" names nothing. It surfaced
Claridge's, the Dorchester, Wombats, Z Covent Garden and little else.

YouTube also 429s the caption endpoint persistently, so transcripts are not
available.

**Its one real result** was a pointer, not a name: Love and London's "Don't stay
in these areas in London" (Sept 2026) points at that site's accommodation
section, which is now five sources in the corpus. Worth running once per topic
area for exactly that reason - to find the blogger behind the video.

### Community - high value, but not through the last30days engine

Two routes were tried on the same three topics.

**`/last30days` (Reddit + YouTube + TikTok + Instagram + HN + Polymarket +
GitHub): found one usable thread.** Across three runs and ~130 items, exactly
one was about London hotels. The relevance floor cannot tell an accommodation
question from r/london general chatter, so it kept "East London Mosquito
Invasion" and dropped nothing better in its place. Reddit also 429'd it after
~14 items every run, and TikTok/Instagram are behind a paid tier (HTTP 402).

**arctic-shift directly: found 41.** Reddit's own JSON returns 403 to curl;
`arctic-shift.photon-reddit.com` does not, and it is what the engine falls back
to anyway. Search the subs where accommodation questions get answered, keep the
threads whose *title* is about staying somewhere, then read the comments -
comments are where properties get named.

```
https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&after=<date>&before=<date>&limit=100&query=<q>
https://arctic-shift.photon-reddit.com/api/comments/search?link_id=<post id>&limit=100
```

**arctic-shift rate-limits hard and fails silently.** An unthrottled run
returned zero for 11 of 15 subreddits and looked like an empty window rather
than a blocked one. Throttle every call (1.2s) and retry with backoff; a full
15-subreddit sweep takes ~30 minutes and belongs in the background.

Subs worth searching: `london`, `AskLondon`, `uktravel`, `TravelUK`,
`unitedkingdom`, `travel`, `solotravel`, `backpacking`, `Shoestring`,
`hostels`, `FATTravel`, `awardtravel`, `hotels`, `TravelHacks`, `Europetravel`.
`r/FATTravel` is the one nobody thinks of and it is the best of them for the
top end.

**Never regex property names out of comment bodies.** The first attempt
returned "Harry Fucking Potter" and "People suck". Match *known* names into the
text instead, and read the rest by eye.

### What the community pass is really for

Not finding new hotels - it found three the guides had missed. **Checking the
sheet.** Of the seventeen properties named in the r/FATTravel thread "Which of
London's best hotels are worth the price?", fourteen were already ours. That is
the best independent confirmation the sheet has had.

## Junk filtering, in the order the problems appeared

Every filter below exists because something got through:

- **Section headings** - "Stays", "Mid-range", "Budget:"
- **Nav furniture** - "Leave a reply", "You may also like", "Subscribe"
- **Other cities** - Nomadic Mick's London post lists Amsterdam, Malaga,
  Barcelona. Trap 12.
- **Prose fragments** - "Great for", "Walking distance", "Perfect for"
- **Author bylines and photo captions** - "Jessica Dellow", "Gorgeous room"
- **Cross-link headlines** - "8 Best London Hostels for Budget Travellers"
- **FAQ headings** - anything ending in `?`, anything starting "How/What/Why"
- **Trailing colons** - "Price:", "Old Compton Street:" are subheadings
- **The area itself** - a Shoreditch guide says "Shoreditch" constantly
- **Landmarks** - an area guide walks you past the Royal Opera House and Apple
  Market between the hotels

The last two only bite on area corpora, which is why they were not in the
general pass.

## What is still outstanding

- **The Hotels.com existence check** over the multi-source candidates. Blocked
  on a CAPTCHA; needs the browser. Rob has said not to bother for now.
- **Every candidate still needs a human decision.** The file is a shortlist to
  research, not a list to paste into the sheet.
- The sheet corrections in `data/closed-hotels.json` are Rob's own action.
