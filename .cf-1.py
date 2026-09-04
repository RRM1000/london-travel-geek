import io

p = "src/content/articles/best-coffee-london.md"
s = io.open(p, encoding="utf-8").read()
R = []

# ------------------------------------------------------------------ bug fixes
R.append((
"""A **tiny City counter** that consistently tops London coffee rankings and has almost nowhere to sit. Built for a queue of people on their way somewheree.

**Closed Saturdays and Sundays** — it runs on office hours, because its customers are office workers. Two minutes from Moorgate, and the queue moves fast because almost nobody sits down.""",
"""A **tiny City counter** that consistently tops London coffee rankings and has almost nowhere to sit. Built for a queue of people on their way somewhere else, and it works because of that rather than in spite of it.

**Closed Saturdays and Sundays** — it runs on office hours, because its customers are office workers. That is the single thing to know: a weekend trip to the City for this is a wasted one.

**118 London Wall, EC2Y 5JA**, two minutes from Moorgate. The queue moves fast because almost nobody sits down, so a long line is not the wait it looks like.

**Go mid-morning or mid-afternoon.** Between 8 and 9.30 it is the entire office block's breakfast, and at lunchtime it is the same crowd again."""))

R.append((
"""**Bookings are taken across the seven London sites**, which is unusual on this page and worth using at weekends. Ten minutes from Farringdon.

**Bookings are taken across the seven London sites**, which is worth doing at weekends when brunch runs long. Ten minutes from Farringdon.""",
"""**Bookings are taken across the seven London sites**, which is unusual on this page — almost everything else here is walk-in only — and worth using at weekends when brunch runs long and the wait is real.

**It is the one entry here you can treat as a meal rather than a coffee.** Full kitchen, all day, with space to sit and work in a way the specialist counters cannot offer.

**11–13 Exmouth Market, EC1R 4QD**, ten minutes from Farringdon and about the same from Angel."""))

R.append((
"""The beans are **roasted inside prisons** by people the company then trains and employs on release. A coffee business built around reducing reoffending, and the coffee stands up without the story.

---

**Walk-in, seven minutes from Russell Square** — handy for the British Museum, and a better cup than anything closer to it.
## The roasters""",
"""The beans are **roasted inside prisons** by people the company then trains and employs on release. A coffee business built around reducing reoffending, and the coffee stands up without the story attached.

**Walk-in, no bookings.** At **84b Lamb's Conduit Street, WC1N 3LR**, seven minutes from Russell Square and five from Holborn — which makes it much the best cup within reach of the British Museum, and better than anything on Great Russell Street itself.

**Lamb's Conduit Street is the reason to make the walk.** Half-pedestrianised and independent end to end, with Noble Rot and Honey & Co on the same short run — but **most of it closes on Sundays**, including here.

---

## The roasters"""))

R.append((
"""Pastries and a short toastie list rather than a kitchen. **Walk-in, eight minutes from Old Street**, and calmest mid-afternoon.""",
"""Pastries and a short toastie list rather than a kitchen, so this is a coffee stop rather than a meal.

**65 Charlotte Road, EC2A 3PE.** The subtitle above says three minutes from Old Street and that is the honest figure — it is a short walk into the Shoreditch side streets rather than the eight minutes some listings give.

**Calmest mid-afternoon.** Shoreditch coffee rooms fill with laptops from about ten and again at lunch; between two and four it is a different room."""))

for old, new in R:
    assert s.count(old) == 1, "NOT FOUND: " + old[:60]
    s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print(f"coffee: {len(R)} entries fixed and expanded")
