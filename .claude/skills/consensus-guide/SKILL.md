---
name: consensus-guide
description: Build or refresh a London consensus guide - an article ranked by how many independent sources name each venue, not by our own opinion. Use when asked to research, build, update or refresh a "best X in London" guide (pizza, Indian, steak, pies, breakfast, seafood, music venues), when asked to collect sources or record consensus evidence for a topic, or when a topic config exists in data/topics/. Covers source collection, recording, the evidence build, the article and the house voice.
---

# Consensus guide builder

One method, one article shape, one config file per topic. The method never changes.
The config carries what differs between pizza and seafood.

## The rule this whole system exists to protect

> A hand-typed source count is a claim. A derived one is a measurement.

You collect sources. The pipeline counts them. Never type a count, a tier, or a
value into a derived column, and never write into `Restaurants v2` — it is rebuilt
from an array in `scripts/write-restaurants-v2.mjs` and anything typed into a cell
is destroyed on the next build. The only human-owned tab is `Overrides`.

---

# Part 1 — Collection

Collection is where guides break. Article structure is judgement and gets fixed by
reading; collection errors are silent, mechanical, and survive into print. Every
rule below was paid for.

## 1. Read the topic config

`data/topics/<topic>.json` names the award bodies and editorial lists worth
checking, the sub-type axis, and anything already known missing. If there is no
config, create one from `data/topics/pizza.json` and **stop for review before
collecting**.

## 2. Collect, in tier order

Awards first, because they cost nothing to fetch and carry the most weight.

1. **Award bodies** — judged, dated rankings. Fetch the primary site.
2. **Editorial lists** — mastheads with editors.
3. **Independent blogs and specialists.**
4. **Video** — YouTube and TikTok, counted per CREATOR. **Not optional.**
5. **Community** — Reddit and forum threads, counted per THREAD. **Not optional.**

Record what each source *called* the venue, not just that it named it.

> **TIERS D AND E ARE NOT OPTIONAL, AND THIS RULE USED TO SAY THEY WERE.**
> The old wording - "optional", "skip when awards and editorial already cover
> the topic" - produced **40 of 48 topics with no video, social or community
> source at all**. Only the first eight ever got the full treatment.
>
> The floor: **two** independent social voices for a topic with a judged award,
> **three** where none exists. `node scripts/audit-source-mix.mjs` enforces it.
>
> **A topic with no award needs MORE social, not less.** Breakfast had five
> sources, all mastheads, for a meal with no award anywhere in Britain - so the
> guide was five writers agreeing with each other, and the whole cheap end of
> London was invisible because none of the five went below about £15.
>
> It changes results, not just coverage. Dim sum went from ZERO venues named by
> three sources to five. Terry's Café went from absent to joint most-cited in
> the breakfast guide.
>
> The opposite failure is real too: pizza finished 64% video with zero Reddit.
> Video is the weakest tier per source and the easiest to over-collect, so the
> same script flags a topic where social passes 70% of voices.

## 3. The seventeen traps

Check every one before recording. The first seven cost real accuracy on pizza,
the next four on seafood and Sunday roast, and the last six on fish and chips,
Chinese, bakeries, Turkish and afternoon tea.

**1. Read `data/sources.json` for the tier. Never invent a scheme.**
Six tiers, A–F. **D is video** — any YouTube or TikTok channel, whatever the
audience. **C is an independent blog or single-subject specialist.** Tiering
creators by follower count is wrong. F is the venue's own site: weight 0, never
counted, excluded at collection.

**2. Syndication resolves to the originating body — and then does not also count
as a source.** Where an outlet or creator repeats another body's ranking, the
award is the source. Filing an award under the reporting outlet's URL collapses a
judged ranking into that outlet's own guide and destroys the signal. If you write
"SYNDICATION" in a quote, that mention must not also be counted as an independent
opinion — a visit that mentions an award is a source; a post that only relays the
result is not.

**3. `hostOf()` does not lowercase the channel handle.**
`youtube.com/@JOLLY` and `youtube.com/@jolly` count as two independent sources.
Match the casing already in `data/sources.json`.

**4. Check `data/name-aliases.json` before recording a name.**
Sources spell one venue several ways, and a residency gets filed under its host
pub. "Crisp Pizza" / "Crisp W6" / "Crisp Pizza at The Marlborough" filed as three
weakly-supported venues instead of the strongest in the set. Add the alias, and
record in the same file what you deliberately did **not** merge, and why.

**5. Never record a URL you reconstructed.**
A display name is not a handle. Three TikTok sources on pizza had guessed URLs and
were dropped. A missing citation beats a fabricated channel that counts as real.

**6. Hunt for the primary results page before declaring a gap.**
`/previous-winners` stopped at 2024, so the guide published a caveat saying the
2025 awards were unreadable. The full results were on the same site at
`/the-uks-best-pizza`. That false caveat hid six venues' tier-A awards and let an
invented detail reach the page. Read the site nav and try obvious slugs before
writing that something is missing. If it is genuinely missing, ask — do not
publish the gap.

**7. A citation count is only evidence for its own topic.**
`evidence.json` records `topics`. A venue cited under `markets` or `italian` must
not have that count printed in a pizza guide. Check `topics.includes(<topic>)`
before printing any count.

**8. A source that extracted only page chrome still counts in your corpus total.**
Hot Dinners was recorded on the seafood corpus with seven names — `Offers`, `Test
Drives`, `Staying in` — and zero venues, while being counted as one of sixteen
sources. DesignMyNight had two: `Rewards` and `Jobs`. The published figure
"16 sources" was inflated by two sources that contributed nothing, and 28 real
restaurants with an address and a paragraph each were simply missing. **Print the
name list for every source before you print a source count.** If a source's names
are all navigation, the extractor did not find the page's structure — go back and
find it.

**9. Decode HTML entities before anything looks at a name.**
`norm()` keeps only `[a-z0-9]`, so `&nbsp;The Golden Tooth` normalises to
`nbspthegoldentooth` and becomes a second, permanently one-source venue sitting
beside the real record. 53 venues were split this way across the whole corpus, and
fixing it moved counts in topics nobody was working on — Blacklock's steak count
went 4 → 6. `build-evidence.mjs` now decodes at ingest; if you write your own
extractor, decode there too.

**10. An extended list is not the main list.**
The Estrella Damm Top 50 Gastropubs publishes 1–50 and a separate 51–100 extension
on the same page, and the extension is where three of the best-known London roast
pubs sit. `#60` and `#60 of the top 50` are different claims. Label the extension
in the quote, and make the verifier enforce it: a rank above the list's length that
does not say "extended" is an error.

**11. Time Out's lists are RANKED, and the blurb label changes between them.**
Its seafood guide numbers 1–20 and its Sunday lunch guide 1–28, and the ranks are
worth carrying — Time Out's number one is often a name no other source puts first,
which is a finding. The per-venue line is introduced by `Why go?` on some lists and
`What is it?` on others; match both or you will silently record ranks with no text.

**12. A NATIONAL list is not a London list.** The worst error found anywhere in
this project. The Good Food Guide's "Britain's 50 Best Bakeries" was recorded
whole and all 49 readable names counted as London tier-A citations. Ten are in
London; Aran Bakery is in Dunkeld, Hart's is in Bristol, Pollen is in Manchester.
The topic showed 85 tier-A citations — more judged evidence than any other — and
four fifths of it was for other cities. **Any source with "Britain's", "the UK's"
or "the world's" in its title must be scoped before it is counted**, and these
pages almost always print the town beside the name, so the subset is readable
rather than guessable. The same applies at the small end: a "top London chippies"
list reached into Surrey and Buckinghamshire.

**13. Two corpora can hold the same subject.** Three ice cream sources were
sitting in the `dessert` corpus while `ice-cream` had its own corpus and its own
article — one of them the *identical URL*, recorded twice. Before adding a source,
grep the other consensus files for its URL.

**14. A 404 is usually a move, not a death.** The Infatuation's bakeries guide
returned 404 at the recorded URL and the live page was at
`/best-bakeries-in-london` with 20 names against the dead URL's 3. Try the obvious
variants before writing a source off.

**15. A JS-rendered page returns navigation to curl, and navigation looks like
venues.** Harden's Turkish page gave 24 "restaurants" that were all site chrome
and a "you might also like" rail — and every one counted as tier A, because
Harden's is tier A. **Read a suspicious page in the browser instead**, and find
the container class the real results sit in. Harden's actually lists three
Turkish restaurants in London.

**16. The same page can be recorded under two URLs.** Time Out's afternoon tea
list and its "quirkiest afternoon teas" list had IDENTICAL name arrays — one page
extracted twice, inflating the source count. Compare name arrays across records
from the same domain before trusting a corpus total.

**17. Where a venue sits INSIDE something bigger, sources name either.** Afternoon
tea is the hard case: half the sources write "The Palm Court at The Ritz" and half
write "The Ritz", so the two most famous teas in London read as four weak venues.
45 aliases took the count on 2+ from 6 to 23. The canonical name is **the one a
reader books under**. The same shape appears as "The Gallery at The Savoy", "Roe
by Fallow", "Hyde Café at Royal Lancaster".

## 4. Record

One record per list, article or channel — organised by SOURCE, never by venue:

```json
{ "name": "The Infatuation - NYC-Style Pizza London Power Ranking",
  "url":  "https://www.theinfatuation.com/london/guides/nyc-style-...",
  "names": ["Crisp Pizza at The Marlborough", "Gracey's Pizza"],
  "quotes": { "Gracey's Pizza": "Ranked #2 of 12 - but placed in St Albans" } }
```

**Prefer merging a `data/consensus`-shaped JSON file directly.** It preserves
commas in quotes and lets you review the whole set before it lands.

`record-source.mjs` is for one source at a time. Use `--file` or stdin, which
split on newlines — **not** `--names`, which splits on commas and mangles any
quote containing one:

```bash
node scripts/record-source.mjs --topic=<topic> --url="..." --name="..." --file=names.txt
# names.txt, one per line:  Venue A :: what the source said about it
```

## 5. Build

```bash
node scripts/build-evidence.mjs
node scripts/write-restaurants-v2.mjs --dry-run   # check, then run without the flag
```

Replacing a previous run rather than adding to it? `git checkout` the data files
to HEAD first. `record-source.mjs` dedupes on URL only, so the same source under a
different URL double-records silently.

## Counting rules — non-negotiable

- **Distinct domains, never URLs.** Two lists from one publication are one opinion.
  A masthead's ranked guide, its news desk and its YouTube channel are one source.
- **Never cite a search-results page.** That is a search you ran.
- **One canonical venue name**, as `Restaurants v2` spells it. What the source
  called it goes in the quote.
- **Where you cannot tell whether two names are one venue, leave them apart** and
  say so. A wrong merge is invisible; a duplicate is not.
- **Unordered lists carry no ranks.** Numbered-but-unordered listicles are common —
  read the caption. Record a rank only where the source published an order.

## Collecting the video and social tiers

Required on every topic. Lowest-weight per source, which is an argument for
reading them carefully, not for skipping them. On pizza, 24 social sources
carried 52 names while 9 award and editorial sources carried 49 — the 9 held
every judged ranking, and the 24 held the places nobody had written up yet.

**Where the venue names actually are.** Not the transcript, usually. Take them
from the video DESCRIPTION and the CHAPTER MARKERS first — creators list their
stops — and on TikTok from the caption's @-mentions and the post's tagged
point-of-interest, which carries a real name and address.

Use Apify via the REST API with `APIFY_TOKEN` in the environment.

| Purpose | Actor | Rough cost |
|---|---|---|
| YouTube search | `api-ninja/youtube-search-scraper` | `maxResults` min 20 |
| TikTok search | `xmolodtsov/tiktok-search-scraper` | ~$0.0003/post |
| Instagram hashtag | `apify/instagram-hashtag-scraper` | ~$0.0026/post |
| Google Maps | `compass/crawler-google-places` | ~$0.004/place |

**Cost discipline.** Base actors are cheap; add-ons are not. Never bulk-scrape
reviews ($0.0005 each) or images — 100 reviews across 300 venues is $15 in one
run. Pull reviews only for a final shortlist. A whole topic's video tier should
cost $1–2; if a run heads past $5, stop and find the add-on. Cache every run.

**One record per CHANNEL, not per video.** A creator's three videos on the topic
are one opinion.

**One record per CREATOR ACROSS PLATFORMS.** @dejashu posts as Shu on YouTube
and Shu Lin on TikTok, and `hostOf()` cannot see it — the two URLs are
different keys. Merge by hand, the same way Time Out's guide and its YouTube
channel are one source.

**PAID PLACEMENT IS NOT EVIDENCE.** Social carries a failure the published tiers
do not: creators disclose gifted meals, and a hosted visit is the venue's own
marketing wearing a creator's face — which is what tier F exists to exclude.
Look for `ad`, `ad-invite`, `gifted`, `invite`, or a "thanks to the team for
having us" in the description. Record these in the corpus under `declined`
with the disclosure quoted, so the decision is visible and not repeated.
Five were declined across coffee, dim sum and breakfast. One had 622k views;
JOLLY's two hosted brunch films have 1.5M each.

**THE PLATFORM IS NOT THE PUBLISHER.** A Giles Coren column that reaches you as
a TikTok post is still The Times, and is tiered as The Times. Same rule that
files an award reported by Time Out under the award.

**Reddit is blocked in this environment** — to the search agent and the browser
alike. Tier E cannot be collected here. Say so rather than quietly shipping a
topic without it, and record any thread the user supplies by hand.

---

# Part 2 — The article

## Title

```
tag:  Best <Topic> in London 2026: Ranked Across Every Major List
H1:   The Best <Topic> in London, Cross-Referenced Across Every Major List
      and Review of the Year
dek:  Not our opinion. Every venue here is ranked by how many independent
      awards, critics and reviewers name it.
```

Title tag under 60 characters, head term first. H1 longer and different. **No
source count in the H1** — it goes stale on every rebuild.

## The evidence block, not a methodology essay

Four or five sentences near the top, carrying only what is specific to this topic:
the counts from the build, the source types by name, the last-updated date, and
**this topic's specific weakness**. Everything general lives once at
[`/how-we-rank/`](../../src/pages/how-we-rank.astro), which every guide links to.

```markdown
> 📊 **The evidence behind this guide**
> Nothing here is ranked on one visit. This pass reads **N sources carrying N
> citations** across **N named venues** — the judged awards (…), the editorial
> mastheads (…) and the year's major London <topic> videos. **N are named by two
> or more independent sources; N carry a dated award.**
> **The known weakness in this topic:** …
> *Evidence rebuilt <date> · [How we rank →](/how-we-rank/)*
```

The weakness line is not optional and costs nothing. For a topic with no judged
award: *no judged award exists for this category, so this ranking rests on
editorial consensus alone.* That is more honest than most guides will ever print.

**The Short Version box must sit above the evidence block.** Someone arriving from
Google wants the answer, not your working.

**Never publish a numeric score per venue.** A number invites "how was that
calculated" and the weighting is a judgement call. Publish the evidence instead.

## Per-entry citation line

In the metadata line beside price and area:

```
*££ · Mayfair · 4 min from Bond Street · Cited by 11 sources · #15 of 21, Time Out · [book a table](url)*
```

Ranks only from sources that published an order. Counts only from this topic's
corpus. A link last: **booking URL where the venue takes reservations, website
otherwise** — and never a booking link on a venue the guide calls walk-in, which
on pizza pointed readers at the host pub and the market's own booking page.

## Sections, in this order

1. **The winners** — the venues that actually top a ranking.
2. **Also strongly backed** — widest agreement after those.
3. **By sub-type** — from the config's facet axis.
4. **Cheapest** — `Price Band = £`.
5. **Quickest** — counters, slice shops, market stalls.
6. **Food halls and market stalls** — named traders only, never the hall itself.
7. **Format-specific section** where the topic has one (pub pizza; curry house vs
   dining room; caff vs brunch room).
8. **New openings.**
9. **Booking essentials and FAQs.**

**Do not sort section 1 by citation count.** Citation count measures how much a
place was written about; a ranking measures what judges thought. Sorting on the
derivable number buried a national winner beneath a chain the article itself
called "reliable rather than remarkable". Lead with what won; use counts as
evidence inside the entry, not as the running order.

Where two credible sources crown different winners, **explain it in two sentences
inside section 1** — not a section of its own. It is the most interesting thing in
the data and no competitor has it, but it is worth a short paragraph, not an essay.

The exception is a **whole-list divergence**, where two serious sources produce
almost disjoint lists rather than a different number one. On Sunday roast, Time
Out's ranked 28 and the Estrella Damm Top 50 share almost no names at all, and
Time Out's top four appear nowhere in the award. That earns a short section and a
table — the table is the only place the reader sees the second list, so it is
doing navigational work, not argument. Keep the prose around it to five or six
sentences.

Sections 4–8 are cross-references: linked name, one line, citation line. Never
repeat a description. If a venue appears in four round-ups it should read as four
pointers, not four paragraphs.

**One page, sectioned. Never split into separate posts** by style or price — pages
targeting the same search intent compete and both rank worse. Spin a section out
only when Search Console shows it drawing its own distinct query.

## Verify before publishing

```bash
npm run audit
```

Four checks, and they fail for different reasons on purpose:

| Check | Asks |
|---|---|
| `audit:citations` | is every number on the page true? |
| `audit:corpus` | is any source contributing furniture, or sitting on the excluded list? |
| `audit:sources` | is this topic resting on one kind of voice? |
| `audit:depth` | is the prose beside the number worth reading? |

The first existed for months on its own, and that was the problem: a guide
could pass every check the project had while being five mastheads deep and
27 words wide. A verified number beside an empty sentence is not a guide.

There is no git hook and no CI here, so these only help if they are run.

Every guide gets a checker modelled on `scripts/verify-pizza-citations.mjs`. It
reads the claimed figures **out of the article** and fails if they drift from the
build. Hard-coding the expected numbers in the checker defeats the point — that is
exactly how the pizza check went stale when a source was rebuilt.

Also check: no rank against an unordered source, no count from another topic, and
every outbound link returns 200 without a cross-host redirect. `elliotscafe.com`
now redirects to an unrelated catering business.

## Tables

The layout weights a five-column table 15/15/12/14/44% and expects **the prose
column last**. Put a long "what it is" column anywhere else and it renders one
character wide on mobile.

## Before publishing, always

Surface every venue-identity question rather than resolving it silently: chains
where sources name different branches, residencies that may not be separate
venues, places a source located outside London, and any name merged on judgement.
These are human decisions.

---

# Part 3 — Voice

Factual and engaging. Those are not in tension — the facts are the interesting
part, and superlatives are what people write when they have not found any.

## Rules

**Never write a superlative you cannot source.** "The most decorated", "the only
serious", "genuinely excellent", "a true original" are all claims with no evidence
behind them. If a place is the most-cited, say so and print the number. If it won
something, name the award and the year.

**Never infer a fact from a name.** A marinara is traditionally cheeseless, so the
guide called the national winner "a cheeseless marinara". The awards' own
description lists fresh stracciatella. Read the source; do not reason from the
word.

**Concrete beats evaluative.** Describe the thing and let the reader conclude.

| Instead of | Write |
|---|---|
| the most decorated pizza in Britain right now | Romana bases with American toppings, cooked in the back of a brewery pub |
| which is exactly as strange as it sounds and entirely the point | served inside a working car dealership on the Great North Road |
| a title that usually goes somewhere far more fashionable | whose head pizzaiolo, Antonio Raspone, took Pizza Chef of the Year |
| the only serious Detroit pizza in the city | Ria's does Detroit |
| London's best-kept secret | *(cut — it is on four published lists)* |

**Say when the evidence does not reach something.** A guide that covers 22 rooms
against a corpus that reaches 12 has two honest options: cut the ten, or mark
them. Marking them — *named by no source in this corpus* — keeps a useful guide
and tells the reader exactly what the count does and does not cover. Make the
verifier check the absence, because it goes stale the moment a source is added.

**Explain jargon or cut it.** "The basement books through SevenRooms" means
nothing to a reader: what is the basement, what is SevenRooms. Either say what it
is or link the word they care about — *the pizzeria downstairs takes
[bookings](url)*.

**Describe a style rather than naming it.** "A Detroit square with the cheese burnt
crisp against the side of the pan" works for someone who has never heard of
Detroit pizza. "Romana" alone does not.

**Cut hours and platform names from callouts.** A warning box should carry the one
thing that ruins a trip — closed Mondays, kitchen shuts before the bar, market
hours — not a full opening-times table.

**No section may open by apologising for the layout.** "X, Y and Z are above;
these are the rest" means the structure is wrong, not that the reader needs
telling.

## What every entry must carry

**This is the floor. An entry below it is not a guide entry, whatever its
citation count says.**

1. **What they actually cook, by name.** Not "excellent Sichuan cooking" but the
   dish a reader would order - the bacon naan roll, the ricotta hotcakes, the
   scallop and bacon butty, har gau and cheung fun. A cuisine label is not a dish.
2. **What the room is like to sit in.** Counter or table, twenty seats or two
   hundred, silent or deafening, who else is in there at 1pm on a Tuesday.
3. **One thing that decides a visit.** Booking horizon, queue, opening hours,
   price for two, cash-only, closed Sundays.

Anything further - who cooks, what the building was, why the sources disagree
about it - is what separates a guide from a directory.

`node scripts/audit-entry-depth.mjs` measures this and exits non-zero on entries
under 45 words. Run it alongside the citation verifiers, not instead of them:
one checks that the numbers are true, the other that the prose is worth reading.

### How this was got wrong

Every number on these pages was script-verified while nothing checked the prose
beside it, so the writing thinned as the pace went up and nobody could see it:

```
best-pizza-london          122 words per entry   (written first)
best-steak-restaurants     100
best-indian-restaurants     84
  ...
best-japanese-restaurants   33
best-middle-eastern         31
best-afternoon-tea          27                   (written late)
```

217 of 502 entries were under 40 words - 43% of the site.

**The Length rule below caused it.** "Trim on every pass" with no floor beneath
it optimises for cutting, and a 27-word entry passes every check the project
had. Trimming means removing padding. It never means removing what the reader
came for.

## Length

Trim evaluative padding on every pass - adjectives doing the work a fact should
do, "must-visit", "hidden gem", "a real treat". The pizza guide lost a thousand
words that way while GAINING sixteen venues.

But length is not the target and shortness is not a virtue. The pizza guide has
the longest entries on the site and is the best of them. Cut sentences carrying
no fact; never cut the facts to hit a length.

## Words to avoid in the article

"Corpus" is ours, not the reader's. On the page say **the sources**, or name
them. Keep "corpus" for scripts, commit messages and this file.
