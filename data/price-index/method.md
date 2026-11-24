# London price index: method

What everyday visitor costs are in London, read once a month from fixed, public, primary sources so that a month-on-month change is a real price change and not a change of sample. Baseline: `2026-11.json`, read 24 November 2026. Nothing here is published.

Rules for every month:

- Same sample, same source URL, same price definition. If a venue drops out (closes, blocks, stops publishing), record it under `dropped` and compare the remaining like-for-like sample, not the new median against the old.
- Primary sources only: the operator's own price list, menu or fares page. No blogs, aggregators or delivery apps.
- curl or Node fetch with User-Agent `LondonTravelGeek/1.0 (+https://londontravelgeek.com)`. A site that returns 403 or a bot check is dropped, not worked around.
- Every data point carries its source URL and read date. Name the file `YYYY-MM.json`.
- Adult, full price, no membership, no donation, booking fees excluded unless stated.

## Items measured

### 1. Tube and bus fares (solid)

- **Measure:** Zone 1 pay-as-you-go single, peak and off-peak; Zones 1–2 daily cap. Also the bus single and bus daily cap.
- **Sample:** one Zone 1 journey, Oxford Circus to Bank, which stands for every Zone 1 journey; the cap table row "Zones 1-2".
- **Sources:**
  - `https://api.tfl.gov.uk/Stoppoint/940GZZLUOXC/FareTo/940GZZLUBNK` (TfL fares API, JSON, no key needed): rows "Pay as you go" Peak and Off Peak.
  - `https://tfl.gov.uk/cdn/static/cms/documents/adult-fares.pdf` ("Adult rate prices" PDF): "Zones 1-2" row, Daily peak column.
  - `https://tfl.gov.uk/how-to-pay/check-travel-costs/bus-and-tram-fares`: Pay as you go and Daily cap cells.
- **Refresh (5 min):** fetch all three; the PDF reads with `pypdf`. Fares change once a year, normally in early March, so expect a flat line most months.

### 2. West End theatre (solid for cheapest seat; medium for top price)

- **Measure:** for each show, the median across its performances of (a) the cheapest seat on sale and (b) the top price band on sale. The index figure is the median across shows.
- **Sample:** 17 fixed long-running shows: Wicked, The Lion King, Stranger Things, Moulin Rouge!, Cabaret, SIX, Hadestown, Harry Potter and the Cursed Child, The Play That Goes Wrong, Hamilton, Les Misérables, The Book of Mormon, MAMMA MIA!, Matilda, The Devil Wears Prada, Operation Mincemeat, Paddington. Evening performances (17:00 or later) 28–56 days after the read date, so lead time is constant each month.
- **Source:** Rob's `westend-tracker` database, which reads each operator's own booking calendar daily (ATG, Nimax, Delfont Mackintosh, Nederlander, LW Theatres). Every reading keeps the calendar URL it came from.
- **Refresh (5 min):**
  1. `git -C C:/Users/rober/Projects/westend-tracker fetch origin`
  2. `git -C C:/Users/rober/Projects/westend-tracker show origin/master:data/westend.db > <scratch>/westend.db` (the branch is `master`; this leaves the tracker's working tree alone)
  3. `python data/price-index/theatre.py <scratch>/westend.db YYYY-MM-DD > <scratch>/theatre.json`, with `PYTHONIOENCODING=utf-8` set on Windows.
- **Limits:** only Nimax, Delfont Mackintosh and Nederlander publish full price bands, so the top price covers 9 shows; ATG gives a "from" price only. The 28–56 day window moves through the seasons: November's window takes in Christmas, which reads high. Compare the same month year on year once there is a year of data. A show that closes leaves the sample; replace it only with a note, never silently.

### 3. Big attractions, advance against on the day (solid prices; thin on the advance gap)

- **Measure:** adult price booked online in advance and adult price on the day.
- **Sample (5):** London Eye, St Paul's Cathedral, Westminster Abbey, Churchill War Rooms, Cutty Sark.
- **Sources:** each operator's own price page (URLs in the JSON). St Paul's: the table "Dates outside of the period…", "No donation" column, Adults row (the summer-savings table above it is seasonal).
- **Limit:** only the London Eye publishes a separate walk-up price (£39 against "Online from £29"). The other four print one adult price, so the "on the day" median mostly repeats the advance median. The Eye's £29 is a "from" price that varies by slot.
- **Dropped:** Tower of London (hrp.org.uk returns 403), Tower Bridge and The View from The Shard (price only inside the dated booking flow), Kew and ZSL London Zoo (403).
- **Refresh (10 min):** fetch the five pages and read the adult figure.

### 4. Museum paid exhibitions (medium)

- **Measure:** adult price of every paid exhibition currently open at the V&A (South Kensington and East), Tate Modern, National Gallery and Natural History Museum. Two figures per show: the Saturday term-time price ("weekend") and the cheapest standard adult price ("weekday", off-peak where tiered). Index = median across shows.
- **Sources:** `https://www.vam.ac.uk/whatson?type=exhibition` (prices print in the listing); Tate Modern exhibition pages linked from `https://www.tate.org.uk/visit/tate-modern` ("Pricing"); National Gallery pages linked from `https://www.nationalgallery.org.uk/exhibitions` ("Ticket prices"); NHM pages linked from `https://www.nhm.ac.uk/whats-on.html` ("Ticket prices").
- **Limit:** the exhibitions change every few months, so a move partly reflects which shows are on, not inflation. Report it as "what a paid exhibition costs this month", not as a like-for-like index. Free exhibitions are out (Science Museum's Becoming America this month).
- **Dropped:** British Museum (403).
- **Refresh (15 min):** list each museum's current paid exhibitions, open each page, read the adult prices.

### 5. Two-course set lunch, from LTG's deals data (medium)

- **Measure:** median two-course price across the live set-lunch deals LTG lists.
- **Sample:** `data/food-deals/deals.json` (the export of the deals table). `data/price-index/set-lunch.mjs` applies fixed rules: type `set-menu`; not past its `endDate`; a lunch offer ("lunch", "pranzetto" or "menu del día" in the offer, price or times, or a window that opens before 15:00 and closes by 18:30); not festive, Sunday-only or a sharing menu; a stated two-course price. It keeps one figure per restaurant (the lowest). Each point keeps the operator `sourceUrl` and the `checked` date from the deals data.
- **Refresh (2 min):** export or sync the deals data first, then `node data/price-index/set-lunch.mjs YYYY-MM-DD`.
- **Limit:** the sample moves as deals are added or retired, and each entry's `checked` date can be up to a few weeks before the read date. For a cleaner trend, also report the median of only the restaurants present in both months.

### 6. Cinema (weak)

- **Measure:** adult evening ticket at fixed central London screens.
- **Only usable source:** Prince Charles Cinema, `https://princecharlescinema.com/ticket-prices/` ("Single performances £11.50 / £14.50 - Evening / Weekend / Bank Holiday", plus 75p online booking fee). The page does not label the two figures; £14.50 is recorded as the full price. The URL answers HTTP 404 but still serves the price list.
- **Dropped:** Odeon Luxe Leicester Square and Curzon Soho (403); Vue West End, Picturehouse Central and Everyman King's Cross price per showtime inside the booking flow, with no price list page.
- **Verdict:** a one-venue item. Keep recording it, but do not publish it as an index figure.

## Items not measured

- **Pint of lager:** none of the planned sample publishes draught prices on a page a script can read. Nicholson's and Fuller's return 403; Wetherspoon prices exist only in its ordering app; Greene King and Young's pub pages list drinks without prices; Sam Smith's publishes none. Third-party pint trackers exist but are not primary sources. The only fix inside the rules is a fixed list of pubs whose own menus show prices, found by hand, or Rob reading the same pubs in the Wetherspoon app each month.
- **Flat white:** Pret, Costa, Caffè Nero and Starbucks publish no prices on their UK websites. The independent cafés tried either publish no prices or return 403.
- **Meal deal:** Tesco and Sainsbury's return 403; Boots and Co-op serve a bot check.
- **Hotel night:** no free, repeatable primary source. Rates exist only per date inside booking engines. The samples in `data/hotel-rate-samples/` came from a paid Apify run, and paid runs are out of scope.

## Monthly refresh

About 40 minutes: fares 5, theatre 5, attractions 10, exhibitions 15, set lunch 2, cinema 2, then writing the JSON. Write `YYYY-MM.json` in the same shape as `2026-11.json`, keeping every point's URL and read date. Read on or near the same day each month (the 24th was the baseline).
