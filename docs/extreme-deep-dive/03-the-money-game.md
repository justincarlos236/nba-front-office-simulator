# The Whole Simulator, Explained — The Money Game

Beyond winning games, your team is a **business.** It earns money and spends money, and how
you run that business affects how much freedom and patience you get. This doc explains the
money side in plain language. No code; the matching code is in the Track B `finances/` and
`fans/` files.

**One rule up front, because it matters:** money in this sim is **pressure and consequence,
never a cheat.** No amount of cash ever lets you break the salary cap or force a move. The
cap (from doc 01) is always the law; money just changes how much _room and patience_ you
have around it.

---

## 1. Your team earns money (revenue)

Each season your franchise brings in money from four main sources:

- **Tickets (the "gate")** — money from fans buying seats. This depends on how full your
  arena is (your **attendance**, which rises when fans are happy) and how big your **market**
  is (a big city like Los Angeles earns more than a small one).
- **Media & sponsorship** — TV deals, jersey sales, endorsements. This grows with how
  **popular** your team is and whether you have a genuine **superstar** (stars draw national
  attention).
- **Playoff revenue** — extra money from hosting playoff games. Deeper runs = more home
  games = more money, with a big bonus for winning the championship.
- **League revenue sharing** — a flat amount every team gets from the league's national TV
  money. This is a _floor_ that keeps even a struggling small-market team able to operate
  (small markets even get a small boost, like in reality).

Add those up and you get your **total revenue** for the season.

---

## 2. Your team spends money (expenses)

On the other side, you pay out:

- **Player salaries** — by far the biggest cost (all those contracts).
- **The luxury tax** — the penalty for spending over the tax line (from doc 01). Spend deep
  into tax territory and this really adds up.
- **Staff salaries** — your coaches and medical staff.
- **Investment** — optional spending on facilities and medical/sports-science (more on this
  below).
- **Operating overhead** — the abstract "everything else" bucket: arena operations, travel,
  the front office.

Add those up and you get your **total expenses.**

---

## 3. Profit, cash, and staying out of the red

**Revenue minus expenses = net income** (your profit or loss for the season). That flows
into your **cash reserve** — the running bank balance of the franchise.

- A profitable season grows your cash cushion.
- A money-losing season shrinks it — and your cash **can go negative** (debt). Nothing stops
  you from spending into the red, but it has consequences: ownership starts watching, and
  sustained losses can trigger a "get the finances back in order" mandate that threatens your
  job.

The sim sorts your situation into a simple **financial health** label — from _Thriving_ down
to _In the Red_ — so you can see at a glance how the business is doing.

---

## 4. Franchise value — the team as an asset

Separate from cash-on-hand, the franchise itself is worth billions as an **asset** (what the
team would sell for). This **franchise value** grows slowly over time, driven by:

- your **market** size,
- how much you **win** (contention lifts value; a title most of all),
- your **popularity**, and
- your **cash** position.

It moves _slowly and smoothly_ on purpose — like a real business's valuation, it appreciates
over years, it doesn't whipsaw season to season. A rising franchise value is a sign you're
building something lasting.

---

## 5. The two levers you actually control

You don't micromanage every dollar. You make **two strategic choices**, each a real
trade-off:

- **Ticket pricing** — set prices _fan-friendly_, _standard_, or _premium_. Premium prices
  earn more revenue **now**, but they make fans a little less happy over time (which
  eventually dents attendance). Fan-friendly is the reverse. A genuine short-term-vs-long-term
  decision.
- **Investment** — spend more (or less) on **facilities** and **medical/sports-science.**
  Premium facilities help your young players develop faster and your veterans stay sharp;
  premium medical reduces how often your players get injured. Both cost cash. So you're
  weighing money against on-court benefit.

That's it — two big-picture levers, each a meaningful choice, rather than a spreadsheet of
a hundred sliders. But they're not the only business decisions you'll make — see the next
section.

---

## 6. The Front Office Inbox — the business comes to you

The two levers above are things _you_ set and forget for a season. But real front offices
don't just sit at a control panel — sponsors call with offers, a scandal breaks, a league
partner invites your team overseas. The simulator models this as the **Front Office
Inbox**: while you're simming games, the business side occasionally sends you a real
decision to make, right there on your `/finances` page.

Every decision looks the same shape: a headline explaining what happened, and **two or
more options**, each with a real, visible cost. Maybe one option costs cash but wins fans
over; the other saves money but costs you goodwill. There's deliberately never a "correct"
option — if there were, it wouldn't be a decision, just a chore.

Two things make this feel alive instead of like a to-do list:

- **Deadlines are real.** Every decision has a window to respond. Ignore it, and it
  auto-resolves to a default option — which is _never_ the good one. Ignoring the business
  side is a valid way to play, but it has a real, understood cost.
- **The most urgent ones stop the clock.** A handful of decisions are serious enough that
  the simulator won't let you keep simming games until you've dealt with them — the same
  way the season already pauses for All-Star Weekend. Everything else just waits patiently
  in your inbox.

Whatever you choose shows up in your finances almost immediately — not just in a report at
the end of the season — because the whole point is to make the business feel like something
that's _happening_, not something you check on once a year.

---

## 7. Fans — the engine behind the money

Your **fanbase's happiness** (a 0–100 number) quietly powers a lot of the above. Fans get
happier when you win, when you have exciting stars, and when you make crowd-pleasing moves;
they sour when you lose or trade away favorites. And fan happiness feeds:

- **Attendance** → ticket revenue,
- **Popularity** → media revenue and franchise value.

So keeping fans happy isn't just nice — it's directly tied to the money that gives you room
to build. Importantly, fans are also _patient in the right context_: a rebuilding fanbase
that expected a losing season is happy with modest progress, while a championship-hungry
fanbase is unforgiving of the same record. (The sim reuses the same "did they meet
expectations?" idea the owner uses.)

---

## 8. Franchise icons — value beyond the box score

Here's a subtle, cool piece. A player's worth to the _business_ isn't just their rating. A
**homegrown legend** — someone your team _drafted_, who's been with you for years, and who's
won awards — is a **franchise icon.** They mean far more to the fanbase and the brand than an
equally-good star you just acquired at the trade deadline.

The consequence: **trading away a genuine franchise icon is a business earthquake** — a big
hit to franchise value and fan happiness, and an "end of an era" news story. Trading a
role-player rental does nothing. This makes those blockbuster "should I trade my beloved
star?" decisions carry real weight beyond the basketball.

---

## 9. Ownership: money buys patience, not cap space

All of this rolls up into how the **owner** treats you. A financially strong, profitable,
winning franchise earns the owner's **patience** — they'll tolerate a down year and even back
you spending into the luxury tax to chase a title. A franchise bleeding money builds
**pressure** — escalating warnings, and eventually a mandate to fix the finances that can
cost you your job.

But — one more time, because it's the whole philosophy — that patience and pressure only
ever affect _how much rope you have._ The salary cap never bends. Money is the atmosphere you
operate in; the cap is the ground you stand on.

---

**Next in Track A:** the draft — how new young players enter the league, and why the worst
teams get the best picks.

**Matching code (Track B):** the `finances/` files (`finances`, `franchiseIcon`,
`ownershipFinance`, `businessDecisions`) and `fans/` files (`fanHappiness`).
