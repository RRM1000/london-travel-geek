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

1. **No named human.** "The Lamplit Editors", "our editorial team". A
   blogger has a name. Weak on its own - some real outlets use a desk byline -
   but it is the first thing to look at. **Check the author archive before you
   act on it.** An earlier draft of this file cited firsttimeinlondon.com as an
   example on the strength of a "First Time in London Team" byline; the site
   has a named author with an archive of uneven, first-person posts, and it is
   a legitimate source. A desk byline on the article is a prompt to go looking,
   not a verdict.
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

The second sweep, over the remaining areas and categories, added:
small-hotels-guide.com, uniquehotels.me, hotelierschoice.com, taglinetoday.com,
trillionairedaily.com, londoninfoguide.com, hotels-with-balcony.com,
my-uk-stay.com, mybruneistay.com, londonstays.net, aparthotel.io,
spahotelsguide.com, dogfriendlyhotels.me. Two more were refused for a different
reason: `belgravialdn-staging.preflight.site` is somebody's unpublished staging
site, and `stow-away.co.uk` is a Waterloo hotel writing about where to stay in
Waterloo - a brand site, same rule as premierinn.com.

The `<city>_<area>` template family is worth naming as a family, because it
keeps reappearing under new domains: luxuryhotel.guide, boutiquehotel.guru,
small-hotels-guide.com, new-hotels-guide.com, uniquehotels.me and
hotels-with-balcony.com all serve the same page shape for every neighbourhood
of every city. One check catches all of them: swap London for Prague in the URL
and see if the page still exists.

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

## Areas with no hotel guides at all

Worth recording as a result rather than a gap. Running the SERP for every
remaining area on 9 Sept 2026 returned **nothing usable** for Hampstead,
Richmond, Hackney, Wapping, Battersea, Stratford and Peckham - not thin
coverage, but no dedicated "best hotels in X" guide of any kind. The search
returns the local paper, the heath, a pub and the borough council.

That is a true fact about London rather than a failure of the method: those
areas have few hotels and nobody writes a hotel guide to them. The sheet still
carries rows there, and should - they just cannot be corroborated this way, and
any claim about them has to rest on something else.

Two more came back thin for the same reason in a milder form: Kensington
returned two sources and Fitzrovia one, once the template farms were stripped.

A separate case is the City of London, where the SERP returned only the general
"best hotels in London" lists we already hold. There is no distinct City corpus
to build; the area is covered by the general one.

## Ways the extractor loses names silently

All three of these look like "the source had nothing to say". None of them is.

**1. Section headings that clear the fallback gate.** `extractNames` reads
`<h2>`/`<h3>` first and only widens to list items, table cells and `<strong>`
when the headings yield fewer than eight usable names. Santorini Dave puts every
hotel name in `<strong>` and heads his pages with eleven section labels -
"Grand Luxury Hotels", "Getting Around from Marylebone", "The Tube", "Buses",
"Common Mistakes". Eleven clears the gate, so the `<strong>` harvest never runs,
and the eleven labels are then binned by the diff. A page naming nine hotels
records as zero. `SECTION_LABEL` had no hotel-domain words in it, which is why
"Grand Luxury Hotels" counted as a venue.

Santorini Dave is a source in six corpora, so this one bug was suppressing names
across most of the sheet's coverage.

**2. A pipe suffix pushing a name over the headline limit.** `isHeadline`
rejects anything of nine words or more, on the reasonable theory that a venue
name is short. The Hotel Journal heads each item "10. Four Seasons Hotel London
at Tower Bridge | Tower Bridge" - the ` | Area` suffix takes it to ten words and
the entry disappears. `collect` splits on a spaced dash and a comma but not on a
pipe.

**3. Names that exist only in link anchor text.** anywhereweroam.com's Notting
Hill page returned fifty names, every one furniture: the properties are named
only inside the booking-link anchors, which the heading and `<strong>` harvests
never reach. The page names seven hotels and the corpus recorded none of them.
Watch for a source that returns a lot of names, all of them wrong - that is
this failure, not a thin page.

**4. Paid bot licensing, which is not a 403.** telegraph.co.uk answers every
user agent with **HTTP 402 Payment Required** and "not authorized... without a
valid TollBit Token". It is seeded in six hotel corpora and returns nothing in
all of them. There is no UA that fixes this and it should not be worked around;
the Telegraph has simply priced bots out. Leave the URL in the source file so
the refusal shows up in every run rather than being quietly forgotten.

The same is true of `visitlondon.com` (Cloudflare managed challenge) and
`guide.michelin.com`. All three are legitimate editorial sources we cannot
read. Where one matters - visitlondon's accessible-hotels page is the most
specific source in that topic - read it in the browser and record the findings
by hand, marked as such, rather than pretending the corpus saw it.

## Considered and deliberately not added

Recorded because a later corpus pass will find these again and the reasoning
will not be obvious from the name.

**London Backpackers, Hendon.** The single highest-scoring London hostel thread
in the community pass is a detailed first-person harassment allegation against
two members of staff, said to have been reported to management and the police.
It is an unverified account by one person. We are not adding the hostel and we
are not repeating the allegation on the site - a serious accusation about a
named business, sourced to one anonymous post, is not something we can stand
behind either way. If it ever earns a row it needs real evidence first.
Note also a separate, older "London Backpackers" at Piccadilly which has since
closed. Different property. Do not merge them.

**OYO.** Named in the community pass as a chain to avoid when a listing looks
too cheap - "dirt, noise, automatic locks that don't work and sketchy people
hanging round". One voice, but it matches the brand's general reputation and
there is no reason to chase it.

**The No.8, Willesden Green.** One mention, negative: "the price is low but
quality is too, poor ventilation". Also renamed - it now trades as hotelmuse.com.

**St James Backpackers.** Genuinely contested on one mention each way -
recommended once, "Avoid St James" once. Not enough either way.

**Royal National Hotel.** Recommended twice inside comments carrying the same
stay22 affiliate link with campaign parameters, one of them downvoted to -1.
Marketing wearing traveller clothes. Recorded so it is not mistaken for a real
recommendation next time.

**Harrow Guest House and Dolphin Inn, Paddington.** One mention each, and the
Harrow recommendation carries its own finder's caveat that it has three Google
reviews. Too thin.

Two that are NOT hostels but are the real answer to the question people were
asking, and we have no coverage of either:

- **University rooms let over the summer** - LSE Bankside House, Passfield Hall,
  Imperial, and UniversityRooms.com as the aggregator. Four independent people.
- **Zedwell's capsules** at Piccadilly Circus, GBP 30-45, named by five people as
  the alternative to a dorm. We hold Zedwell rows already; what is missing is
  the framing that puts them in front of someone searching for a hostel.

## What is still outstanding

- **The Hotels.com existence check** over the multi-source candidates. Blocked
  on a CAPTCHA; needs the browser. Rob has said not to bother for now.
- **Every candidate still needs a human decision.** The file is a shortlist to
  research, not a list to paste into the sheet.
- The sheet corrections in `data/closed-hotels.json` are Rob's own action.
