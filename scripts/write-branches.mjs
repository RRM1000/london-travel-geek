// Writes the Branches tab. Researched branch locations for multi-site brands,
// one row per branch, keyed to the restaurant name in Sheet1.
//
// Verified is FALSE until a human checks the row against the restaurant's own
// site. Nothing here should be presented as confirmed while that column is FALSE.
//
//   node scripts/write-branches.mjs
//
import { writeTab } from "./sheets.mjs";

const HEADER = [
  "Restaurant",
  "Branch",
  "Neighbourhood",
  "Borough",
  "Address",
  "Nearest Station",
  "Area Guide",
  "Verified",
  "Source",
];

const BRANCHES = [
  // --- Dishoom: 7 reported, 6 named ---
  ["Dishoom", "Covent Garden", "Covent Garden", "Westminster", "12 Upper St Martin's Lane WC2H 9FB", "Leicester Square", "covent-garden-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "King's Cross", "King's Cross", "Camden", "5 Stable St N1C 4AB", "King's Cross St Pancras", "kings-cross-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "Shoreditch", "Shoreditch", "Hackney", "7 Boundary St E2 7JE", "Shoreditch High Street", "shoreditch-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "Canary Wharf", "Wood Wharf", "Tower Hamlets", "Water St E14 5GX", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "Carnaby", "Soho", "Westminster", "22 Kingly St W1B 5QP", "Oxford Circus", "soho-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "Battersea", "Battersea", "Wandsworth", "Battersea Power Station SW11 8AL", "Battersea Power Station", "battersea-area-guide", "FALSE", "dishoom.com/locations"],
  ["Dishoom", "UNKNOWN", "", "", "", "", "", "FALSE", "7 branches reported, 6 named - needs check"],

  // --- Hawksmoor: 7 reported, 6 named ---
  ["Hawksmoor", "Spitalfields", "Spitalfields", "Tower Hamlets", "157a Commercial St E1 6BJ", "Liverpool Street", "shoreditch-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "Air Street", "Piccadilly", "Westminster", "5a Air St W1J 0AD", "Piccadilly Circus", "mayfair-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "Seven Dials", "Covent Garden", "Camden", "11 Langley St WC2H 9JG", "Covent Garden", "covent-garden-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "Borough", "Borough", "Southwark", "16 Winchester Walk SE1 9AQ", "London Bridge", "south-bank-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "St Pancras", "King's Cross", "Camden", "St Pancras International N1C 4QP", "King's Cross St Pancras", "kings-cross-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "Canary Wharf", "Wood Wharf", "Tower Hamlets", "Water St E14 5GX", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "thehawksmoor.com/locations"],
  ["Hawksmoor", "UNKNOWN", "", "", "", "", "", "FALSE", "7 branches reported, 6 named - needs check"],

  // --- Blacklock: 5, all named with addresses ---
  ["Blacklock", "Soho", "Soho", "Westminster", "24 Great Windmill St W1D 7LG", "Piccadilly Circus", "soho-area-guide", "FALSE", "theblacklock.com/restaurants"],
  ["Blacklock", "City", "City of London", "City of London", "13 Philpot Lane EC3M 8AA", "Monument", "city-of-london-area-guide", "FALSE", "theblacklock.com/restaurants"],
  ["Blacklock", "Shoreditch", "Shoreditch", "Hackney", "28-30 Rivington St EC2A 3DZ", "Old Street", "shoreditch-area-guide", "FALSE", "theblacklock.com/restaurants"],
  ["Blacklock", "Covent Garden", "Covent Garden", "Westminster", "16a Bedford St WC2E 9HE", "Covent Garden", "covent-garden-area-guide", "FALSE", "theblacklock.com/restaurants"],
  ["Blacklock", "Canary Wharf", "Wood Wharf", "Tower Hamlets", "5 Frobisher Passage E14 4EE", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "theblacklock.com/restaurants"],

  // --- Padella: 3, but Sheet1 says Mini-chain (2) ---
  ["Padella", "Borough Market", "Borough", "Southwark", "6 Southwark St SE1 1TQ", "London Bridge", "south-bank-area-guide", "FALSE", "padella.co"],
  ["Padella", "Shoreditch", "Shoreditch", "Hackney", "1 Phipp St EC2A 4PS", "Old Street", "shoreditch-area-guide", "FALSE", "padella.co"],
  ["Padella", "Soho", "Soho", "Westminster", "", "Piccadilly Circus", "soho-area-guide", "FALSE", "padella.co - MISSING from Sheet1, which says Mini-chain (2)"],

  // ======================= ITALIAN MINI-CHAINS, 2026-08-17 =======================
  // Researched from each brand's own site where reachable, otherwise from
  // published listings. Neighbourhood values are normalised to the canonical
  // names in HOODS (write-restaurants-v2.mjs) so brand geography aggregates.

  // --- Bancone: 6, from bancone.co.uk ---
  ["Bancone", "Covent Garden", "Covent Garden", "Westminster", "", "Covent Garden", "covent-garden-area-guide", "FALSE", "bancone.co.uk"],
  ["Bancone", "Golden Square", "Soho", "Westminster", "", "Piccadilly Circus", "soho-area-guide", "FALSE", "bancone.co.uk"],
  ["Bancone", "Borough Yards", "Borough", "Southwark", "", "London Bridge", "south-bank-area-guide", "FALSE", "bancone.co.uk"],
  ["Bancone", "Kensington", "Kensington", "Kensington and Chelsea", "", "High Street Kensington", "kensington-area-guide", "FALSE", "bancone.co.uk"],
  ["Bancone", "City", "City of London", "City of London", "", "Bank", "city-of-london-area-guide", "FALSE", "bancone.co.uk"],
  ["Bancone", "Russell Square", "Bloomsbury", "Camden", "", "Russell Square", "bloomsbury-area-guide", "FALSE", "bancone.co.uk"],

  // --- Lina Stores: 10 London sites, from linastores.co.uk ---
  // Kept as mini-chain despite exceeding 8: the branches are destinations, not
  // interchangeable. Brewer Street has been a Soho deli since 1944.
  ["Lina Stores", "Brewer Street", "Soho", "Westminster", "18 Brewer St", "Piccadilly Circus", "soho-area-guide", "FALSE", "linastores.co.uk - DELI, the 1944 original"],
  ["Lina Stores", "Greek Street", "Soho", "Westminster", "", "Tottenham Court Road", "soho-area-guide", "FALSE", "linastores.co.uk - restaurant"],
  ["Lina Stores", "King's Cross", "King's Cross", "Camden", "Stable St", "King's Cross St Pancras", "kings-cross-area-guide", "FALSE", "linastores.co.uk - restaurant + deli"],
  ["Lina Stores", "Bloomberg Arcade", "City of London", "City of London", "", "Bank", "city-of-london-area-guide", "FALSE", "linastores.co.uk - restaurant"],
  ["Lina Stores", "Marylebone Lane", "Marylebone", "Westminster", "", "Bond Street", "marylebone-area-guide", "FALSE", "linastores.co.uk - restaurant + deli"],
  ["Lina Stores", "Clapham", "Clapham", "Lambeth", "", "Clapham Common", "", "FALSE", "linastores.co.uk - restaurant"],
  ["Lina Stores", "South Kensington", "South Kensington", "Kensington and Chelsea", "", "South Kensington", "south-kensington-area-guide", "FALSE", "linastores.co.uk - restaurant"],
  ["Lina Stores", "Shoreditch", "Shoreditch", "Hackney", "", "Old Street", "shoreditch-area-guide", "FALSE", "linastores.co.uk - restaurant + bar"],
  ["Lina Stores", "Broadgate Circle", "City of London", "City of London", "", "Liverpool Street", "city-of-london-area-guide", "FALSE", "linastores.co.uk - restaurant"],
  ["Lina Stores", "Canary Wharf", "Canary Wharf", "Tower Hamlets", "", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "linastores.co.uk - restaurant, deli + bar"],

  // --- Napoli on the Road: 3. The Soho site matters - Europe's #1 pizzeria
  //     is not only in Chiswick, which the single-hood row implied.
  ["Napoli on the Road", "Soho", "Soho", "Westminster", "140 Wardour St", "Tottenham Court Road", "soho-area-guide", "FALSE", "napoliontheroad.com"],
  ["Napoli on the Road", "Chiswick", "Chiswick", "Hounslow", "9A Devonshire Rd W4 2EU", "Turnham Green", "", "FALSE", "napoliontheroad.com - the 50 Top Pizza listed site"],
  ["Napoli on the Road", "Richmond", "Richmond", "Richmond upon Thames", "12 Red Lion St", "Richmond", "richmond-area-guide", "FALSE", "napoliontheroad.com"],

  // --- L'Antica Pizzeria da Michele: 2 confirmed London sites ---
  ["L'Antica Pizzeria da Michele", "Baker Street", "Marylebone", "Westminster", "199 Baker St NW1 6UY", "Baker Street", "marylebone-area-guide", "FALSE", "anticapizzeriadamichele.co.uk"],
  ["L'Antica Pizzeria da Michele", "Stoke Newington", "Stoke Newington", "Hackney", "125 Church St", "Stoke Newington", "", "FALSE", "Hot Dinners; Time Out - the 2017 original"],
  ["L'Antica Pizzeria da Michele", "UNKNOWN", "", "", "", "", "", "FALSE", "a Soho site is referenced by Time Out but not confirmed on the brand site"],

  // --- Homeslice: 3, from homeslicepizza.co.uk ---
  ["Homeslice", "Neal's Yard", "Covent Garden", "Westminster", "", "Covent Garden", "covent-garden-area-guide", "FALSE", "homeslicepizza.co.uk - the original"],
  ["Homeslice", "City", "City of London", "City of London", "", "Bank", "city-of-london-area-guide", "FALSE", "homeslicepizza.co.uk"],
  ["Homeslice", "Marylebone", "Marylebone", "Westminster", "", "Bond Street", "marylebone-area-guide", "FALSE", "homeslicepizza.co.uk"],

  // --- Santa Maria: 6, from santamariapizzeria.com ---
  ["Santa Maria", "Ealing", "Ealing", "Ealing", "", "Ealing Broadway", "", "FALSE", "santamariapizzeria.com - the original"],
  ["Santa Maria", "Fulham", "Fulham", "Hammersmith and Fulham", "", "Fulham Broadway", "", "FALSE", "santamariapizzeria.com"],
  ["Santa Maria", "Fitzrovia", "Fitzrovia", "Camden", "", "Goodge Street", "", "FALSE", "santamariapizzeria.com"],
  ["Santa Maria", "Paddington", "Paddington", "Westminster", "", "Paddington", "paddington-area-guide", "FALSE", "santamariapizzeria.com"],
  ["Santa Maria", "Kew", "Kew", "Richmond upon Thames", "", "Kew Gardens", "", "FALSE", "santamariapizzeria.com"],
  ["Santa Maria", "Islington", "Islington", "Islington", "", "Angel", "islington-area-guide", "FALSE", "santamariapizzeria.com"],

  // --- Zia Lucia: 8 London sites. A Reading branch exists and is excluded. ---
  ["Zia Lucia", "Islington", "Islington", "Islington", "", "Holloway Road", "islington-area-guide", "FALSE", "zialucia.com - the 2016 original"],
  ["Zia Lucia", "Hammersmith", "Hammersmith", "Hammersmith and Fulham", "", "Hammersmith", "", "FALSE", "zialucia.com"],
  ["Zia Lucia", "Wembley", "Wembley", "Brent", "", "Wembley Park", "", "FALSE", "zialucia.com"],
  ["Zia Lucia", "Aldgate East", "Aldgate", "Tower Hamlets", "", "Aldgate East", "", "FALSE", "zialucia.com"],
  ["Zia Lucia", "Canary Wharf", "Canary Wharf", "Tower Hamlets", "", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "zialucia.com"],
  ["Zia Lucia", "Wandsworth", "Wandsworth", "Wandsworth", "", "Clapham Junction", "", "FALSE", "zialucia.com"],
  ["Zia Lucia", "West Hampstead", "West Hampstead", "Camden", "", "West Hampstead", "", "FALSE", "zialucia.com"],
  ["Zia Lucia", "Chelsea", "Chelsea", "Kensington and Chelsea", "", "Sloane Square", "chelsea-area-guide", "FALSE", "zialucia.com"],

  // --- Mercato Metropolitano: 3 London sites ---
  ["Mercato Metropolitano", "Elephant & Castle", "Elephant and Castle", "Southwark", "", "Elephant & Castle", "", "FALSE", "mercatometropolitano.com - 17,000 sq ft, the original"],
  ["Mercato Metropolitano", "Mayfair", "Mayfair", "Westminster", "St Mark's Church, North Audley St", "Bond Street", "mayfair-area-guide", "FALSE", "mercatometropolitano.com - Grade I listed church"],
  ["Mercato Metropolitano", "Wood Wharf", "Canary Wharf", "Tower Hamlets", "", "Canary Wharf", "canary-wharf-area-guide", "FALSE", "mercatometropolitano.com - open since May 2022"],

  // --- SUSHISAMBA: 2 London sites, both named ---
  // The parent row in Restaurants v2 describes the Heron Tower site, so the
  // City of London entry below is deduped away on export (its Branch label is
  // just the parent's own neighbourhood). It is listed anyway because the
  // brand's zone/district are aggregated from THIS tab - drop it and the
  // aggregate would claim SUSHISAMBA is a Covent Garden-only restaurant.
  ["SUSHISAMBA", "City of London", "City of London", "City of London", "Heron Tower, 110 Bishopsgate EC2N 4AY", "Liverpool Street", "city-of-london-area-guide", "FALSE", "sushisamba.com/locations - 38th and 39th floors"],
  ["SUSHISAMBA", "Covent Garden", "Covent Garden", "Westminster", "Opera Terrace, Market Building WC2E 8RD", "Covent Garden", "covent-garden-area-guide", "FALSE", "sushisamba.com/locations; Hot Dinners - opened 1 Nov 2018 on the Opera Terrace"],
];

const n = await writeTab("Branches", HEADER, BRANCHES);
const resolved = BRANCHES.filter((r) => r[1] !== "UNKNOWN");
const brands = new Set(BRANCHES.map((r) => r[0]));

console.log(`wrote ${n} rows to Branches`);
console.log(`  brands:   ${brands.size}`);
console.log(`  resolved: ${resolved.length}`);
console.log(`  unknown:  ${BRANCHES.length - resolved.length}`);

const byArea = {};
for (const r of resolved) if (r[6]) byArea[r[6]] = (byArea[r[6]] ?? 0) + 1;
console.log("\nbranches per area guide:");
for (const [k, v] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(2)}  ${k}`);
}
