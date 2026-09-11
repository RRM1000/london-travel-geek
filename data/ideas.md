# Ideas

Somewhere to put things before they get forgotten. **No format rules** — a
half-sentence is a valid entry. Nothing here is a commitment, and nothing here
is judged: the point is that writing it down costs nothing, so you actually do
it.

`npm run worklist` prints a count of what is in here and the most recent few,
so it does not quietly rot. Move an idea into `data/worklist.json` only when it
becomes real work with a date or a blocker.

Add to the top of a section. Strike through with `~~like this~~` when done, or
just delete it.

---

## Post ideas

- **Free walking tours in London** (`free-walking-tours-london`), parked 11 Sep
  2026 by Rob, research done. Its own page because the Google UK results for
  "free walking tour london" share almost nothing with "best walking tours
  london" (only GuruWalk). None of these tours are on GetYourGuide - its free
  searches return paid tours - so the page names the tip-based operators and
  offers GetYourGuide's cheaper paid walks (£15-£18: 413142, 187638, 104249,
  433959, 640062) as the alternative. Confirm that approach with Rob first.
  Operators: Sandemans Free Tour of London (2.5 h, Charing Cross by the
  Clermont Hotel to Westminster Abbey, "we never cancel"); Strawberry Tours
  (aggregator, 11,438 reviews at 4.91, 17 London tours - Ripper 2,780 reviews,
  street art 2,068, Harry Potter 2,220); Free Tours by Foot (name-your-own-
  price; Royal Westminster meets at the Diana Fountain in Green Park; its
  Ripper tour is the Ripper-Vision partnership, price model unconfirmed);
  Walkative! (2h45m, Burghers of Calais statue, "most guests give between €10
  and €50", no groups of 8+); London with a Local (no booking fee, nine free
  tours with meeting points on /free-tours). Tips: GuruWalk's own blog says
  "10 to 15 euros per person"; Free Tour Community reports GuruWalk charging
  guides €2.50 a head. Community voice: three Rick Steves forum threads (tip
  what a paid walk costs, about £10-15). PAA to answer: best free tour, how
  much to tip, are London Walks free, is there a free Ripper tour.
- **A guide built from the HMC register.** 156 HMC-certified halal restaurants
  in London and not one appears in any published best-of list. Aziziye in Stoke
  Newington, Samarkand, Dilara Uyghur in Finsbury Park, Anatolia in Leyton,
  Toro's Steakhouse in Tooting. Genuinely unlike anything else on the subject.
  Data already collected in `data/halal-registers.json`.
- **The remaining monthly guides.** October is stubbed and next; then work
  forward. November and December need care around the Christmas guide so they
  complement rather than cannibalise it.
- **Where to stay: the areas with inventory but no deep dive.** Bermondsey,
  Fitzrovia and Chelsea each have three affiliate-ready hotels; King's Cross
  is the obvious one for Eurostar arrivals.
- **London's boutique and townhouse hotels.** Sixteen affiliate-ready
  properties and a high-value audience, though a weaker search target than an
  area guide.
- **Hostels and cheap rooms.** High search volume, but only eight properties in
  the £ band are affiliate-ready — worth doing after the URL backlog is cleared.

## Site improvements

- **Extend `audit-entry-depth.mjs` further.** It now covers Food and drink,
  Things to do, London areas and Plan your trip. Getting around London is the
  next candidate, if its guides list places rather than describe processes.
- **Orphans and dead ends.** `audit-links.mjs` reports 8 articles nothing links
  to and 6 that link nowhere — mostly the food guides written in early
  September plus the monthly guide. They need to be worked into the hubs.
- **73 of 141 heroes are still stock**, identifiable by a `heroImageCredit`
  field. Food and where-to-stay guides are where replacing them pays off most,
  because they name specific places you can photograph.
- **26 articles have no body photo.** Longest first:
  `competitive-socialising-london` (5,435 words and no image at all),
  `casinos-london`, `best-comedy-clubs-london`, `bottomless-brunch-london`.

## Questions to settle

- ~~Does this site cover **sport**?~~ Yes, major events only. Decided 10 September 2026: see `sport-in-monthly-guides` under `decided` in `data/worklist.json`.
- Is there a source you trust for **West End closing dates**?

---

*Started 8 September 2026.*
