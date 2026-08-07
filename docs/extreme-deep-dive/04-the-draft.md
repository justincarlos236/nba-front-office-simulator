# The Whole Simulator, Explained — The Draft

Once a year, new young players enter the league, and teams take turns picking them. This is
the **draft** — the main way to add cheap, high-upside talent, and the engine of any
rebuild. This doc explains it in plain language. No code; the matching code is in the Track B
`draft/` files.

---

## 1. What is the draft?

Every year, a fresh crop of young players (mostly college and international prospects) become
eligible to join the NBA. In the **draft**, all 30 teams take turns **picking** one of these
prospects. There are **60 picks** total — two "rounds" of 30.

Why do GMs care so much about draft picks? Two reasons:

- **Talent.** A top pick can become a franchise-defining star.
- **Cost.** Drafted rookies are paid on a fixed, cheap "rookie scale" for their first years
  (from doc 01). So a good draft pick is _cheap, young, high-upside_ talent — the most
  valuable kind of asset a team can have. That's why picks are traded like currency.

---

## 2. Who picks first? The lottery (and the anti-tank rule)

You might think the _worst_ team should always pick first — and roughly, they do, because
picking order goes worst-to-best. But there's a twist designed to stop teams from
deliberately losing ("tanking") to get the #1 pick.

For the top picks, the order isn't fixed — it's a **lottery**, a weighted random draw. The
worse your record, the **better your odds**, but it's still a _chance_, not a guarantee.
Crucially, the sim uses the **real post-2019 NBA odds**, where the **three worst teams all
share the same top odds (a 14% chance each).** That means being the _single_ worst team no
longer meaningfully helps — so there's little point tanking all the way to the bottom.

Concretely: the 14 teams that missed the playoffs go into the lottery. The first four picks
are drawn by weighted chance (worse teams weighted more heavily), and the remaining lottery
teams fall in order of record.

---

## 3. The full pick order

Putting it together, the 60-pick order is:

- **Picks 1–14:** the lottery result (the 14 non-playoff teams).
- **Picks 15–30:** the 16 playoff teams, in order of **worst regular-season record first**
  (note: it's regular-season record, _not_ how far they got in the playoffs — the real NBA
  rule).
- **Picks 31–60 (round 2):** all 30 teams again, worst record first, no lottery.

---

## 4. The prospects themselves

The players available in the draft are the **prospects.** An honest note: in the current
version of the sim, these are **generated fictional players** (with realistic-sounding names,
colleges, and international teams) rather than real future draftees. (Making them real people
is a planned future upgrade — "Phase 2.")

Each prospect has:

- A low-ish **current rating** (rookies aren't stars yet — top picks might enter around a 72,
  late picks lower), but
- A **potential rating** (how good they _might_ become — top prospects can have very high
  potential, like a 97).

That gap is the whole point: you're not drafting who's good _now_, you're betting on who
becomes good _later_. And there's deliberate randomness — pick order is only a _tendency_.
Some late picks blossom into stars; some early picks bust, just like real life.

Each prospect also comes with a **scouting report** for flavor: sub-ratings (scoring,
playmaking, defense, rebounding, athleticism), listed strengths and weaknesses, a "scouts
compare his game to [a real player]" note, a physical profile, and a projected draft range.
Importantly, **none of the prospect's real ratings are hidden from you** — the scouting
report is extra color, not a fog-of-war mechanic. (Younger prospects are flagged as bigger
unknowns, which is realistic scouting talk, not hidden information.)

---

## 5. Future picks are tradeable — years in advance

A powerful part of GM strategy: you can trade **future** draft picks, not just this year's.
The sim gives every team its own picks for a rolling **5-year window** from day one, so you
can trade, say, your 2029 first-rounder right now.

Behind the scenes, a "pick" is just a record noting which team **originally owns** it and who
**currently owns** it — trading it simply changes the current owner. Its exact slot (how high
it lands) isn't known until that year's lottery actually runs. This is why a rebuilding team
can stockpile a war chest of future picks, and a win-now team can cash its future picks in for
a star today. (Recall the one guardrail from doc 01: the "Stepien rule" stops you from trading
away first-round picks in back-to-back years, so you can't mortgage _everything_.)

---

## 6. How computer teams draft

When it's a computer team's turn, how do they choose? Not just "best player available." Each
team scores the available prospects through its own lens (reusing the same "team personality"
ideas from trades):

- A **win-now** team weights a prospect's _current_ ability higher (they want help now).
- A **rebuilding** team weights _potential_ higher (they're betting on the future).
- A team with a real **positional need** values a prospect who fills that hole.
- A "prospect-loving" personality reaches for upside; an aggressive one takes bigger swings.

The team simply picks the prospect that scores highest for _them_. Because different teams
genuinely value different things, "reaches" and "slides" (a prospect going higher or lower
than expected) **emerge naturally** — the sim never scripts them. It's the same idea as the
trade AI: evaluate each option from your own team's point of view and take the best one.

---

## 7. The takeaway

The draft is how the league renews itself and how a losing team plots its comeback. It's a
gamble on youth: cheap contracts, unknown ceilings, weighted odds that reward (but don't
guarantee) patience. Master the draft — knowing when to pick for need vs. upside, and when to
trade picks for a sure thing — and you can build a contender from the ground up.

---

**Next in Track A:** being a GM — how the owner judges you, how you can get fired, and how
your reputation follows you across every team you run.

**Matching code (Track B):** the `draft/` files (`draftLottery`, `draftOrder`,
`generateDraftClass`, `draftAi`, `scoutingProfile`, `prospectBio`, `futurePicks`).
