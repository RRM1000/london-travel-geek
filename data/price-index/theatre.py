# West End theatre prices for the London price index, read from the westend-tracker database.
# usage: python theatre.py <path to westend.db> [read date YYYY-MM-DD] > theatre.json
#   Get the current db without touching the tracker's working tree:
#   git -C ../westend-tracker fetch origin && git -C ../westend-tracker show origin/master:data/westend.db > westend.db
# Window: evening performances (17:00 or later) 28-56 days after the read date, latest
# reading per performance taken in the 4 days up to the read date.
import sqlite3, json, statistics, sys
from datetime import datetime, timedelta

DB = sys.argv[1]
READ_DATE = sys.argv[2] if len(sys.argv) > 2 else '2026-11-24'
SHOWS = ['wicked-apollo-victoria', 'lion-king-lyceum', 'stranger-things-phoenix', 'moulin-rouge-piccadilly',
         'cabaret-playhouse', 'six-vaudeville', 'hadestown-lyric', 'harry-potter-palace',
         'play-that-goes-wrong-duchess', 'hamilton-victoria-palace', 'les-miserables-sondheim',
         'book-of-mormon-prince-of-wales', 'mamma-mia-novello', 'matilda-cambridge',
         'devil-wears-prada-dominion', 'operation-mincemeat-fortune', 'paddington-savoy']
c = sqlite3.connect(DB)
rd = datetime.fromisoformat(READ_DATE)
lo = (rd + timedelta(days=28)).strftime('%Y-%m-%d')
hi = (rd + timedelta(days=56)).strftime('%Y-%m-%d')
since = (rd - timedelta(days=4)).strftime('%Y-%m-%d')
out = []
for key in SHOWS:
    title, venue, op = c.execute('select title, venue, operator from show where key=?', (key,)).fetchone()
    rows = c.execute('''select p.starts_at, r.min_price, r.price_bands_json, r.last_seen, r.source_url
        from price_reading r join performance p on p.id=r.performance_id
        where p.show_key=? and p.starts_at>=? and p.starts_at<? and r.last_seen>=? and r.on_sale=1
        and substr(p.starts_at,12,2)>='17'
        order by p.starts_at, r.last_seen''', (key, lo, hi, since)).fetchall()
    latest = {}
    for s, mn, bands, ls, url in rows:
        latest[s] = (mn, bands, ls, url)
    mins = [v[0] for v in latest.values() if v[0] is not None]
    tops = [max(json.loads(v[1])) for v in latest.values() if v[1]]
    urls = sorted({v[3] for v in latest.values()})
    out.append({'show': title, 'venue': venue, 'operator': op, 'key': key,
                'performances': len(latest), 'performancesWithPrice': len(mins),
                'cheapestMedian': statistics.median(mins) if mins else None,
                'cheapestMin': min(mins) if mins else None,
                'topMedian': statistics.median(tops) if tops else None,
                'topMax': max(tops) if tops else None,
                'performancesWithBands': len(tops),
                'lastSeen': max((v[2] for v in latest.values()), default=None),
                'exampleSourceUrl': urls[0] if urls else None,
                'points': [{'performance': s, 'from': v[0],
                            'top': max(json.loads(v[1])) if v[1] else None,
                            'readAt': v[2]} for s, v in sorted(latest.items())]})
print(json.dumps({'window': [lo, hi], 'since': since, 'shows': out}, indent=1, ensure_ascii=False))
