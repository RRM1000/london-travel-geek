# SERP-seeded sources

## Why this folder exists

The corpus used to be built from publications *I could name* — Time Out, The
Infatuation, Eater, SquareMeal. That is a list of mastheads, not a list of what
London actually reads.

Googling `best pizza in London` returns a top eight containing **two blogs and
one blog-shaped listicle**, and the pizza topic had four sources, all of them
YouTube. Zero web pages. `mayfairfoodie.com` — a blog, ranking above
DesignMyNight — then produced 30 names, 21 clean: the single best source in the
topic, ahead of Time Out's 22/17.

The same held everywhere it was tried. `blog.resy.com` gave 36 names (26 clean)
for Turkish, beating both Time Out and The Infatuation. Chinese had twelve
publications and zero blogs.

So: **run the search the reader runs, and take what the SERP gives you.**

## The flow

1. `WebSearch` for `best <topic> London blog guide` (the word "blog" pulls the
   independents above the mastheads).
2. Write the results here as `<topic>.txt`, one `Source name|url` per line.
3. `node scripts/seed-sources.mjs --topic=<topic> --file=data/serp/<topic>.txt`
   — blocked and aggregator domains are refused at the door.
4. `node scripts/consensus.mjs <topic> --fetch`
5. `node scripts/audit-extraction.mjs --bad` — check nothing returned junk.
6. Register any new domain in `data/sources.json` with its tier.
7. `node scripts/build-evidence.mjs`

## What counts as a blog, and what doesn't

A blog is one or two people writing from their own visits. Include it.

An **SEO content farm** wears the same clothes and is not the same thing: no
named writer, no evidence of a visit, and the page exists to rank. Tells are a
US spelling on a London site (`Savor The 9 Best Steak In London`), a parent
business with nothing to do with food (student housing, webcams, hotel booking),
and a title assembled from keywords. These go in `excluded`, not tier C —
counting one as a source would let a page nobody wrote outvote a person who
actually ate the food.

The line for business blogs is **local and relevant**: a London food-tour
operator writing about steak has genuinely eaten there (`walkeatlondon.com`, in).
An Asia tour operator ranking London's Vietnamese restaurants has not
(`insideasiatours.com`, out).

## Known gap

`londonscout.co.uk` 403s the fetcher and is marked blocked. It appeared on two
separate SERPs, so it is worth reading through the browser route rather than
dropping — same treatment as Londonist, which gave 26 venues that way.
