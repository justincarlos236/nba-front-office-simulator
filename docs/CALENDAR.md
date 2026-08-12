# The Season Calendar

**Opened** 2026-08-13, in response to "does the simulator run on a proper
NBA-style calendar, and is the regular season timeline similar to the real
world?"

**Method.** `scripts/schedule-realism-audit.ts`, read-only. Twelve generated
schedules, compared against the real 2024-25 season (Oct 22 – Apr 13).

---

## What existed already

More than expected. `generateRoundRobinSchedule` produced a real day-by-day
calendar — conference/division-weighted pairings, a `dayIndex` on every game,
no team playing three days running, all 30 teams finishing near the same day.
`dayIndex` was already persisted on `Game`, `LeagueTransaction`,
`FanSentimentEvent`, `BusinessDecision` and `BusinessLedgerEntry`, and
`seasonCalendar.ts` already mapped it to real dates for a monthly schedule UI.

What was missing was not a calendar. It was **length**, **rhythm**, and
**names for the days that matter**.

## What was wrong

### The 175-day target was silently discarded

```ts
const targetGamesPerDay = Math.max(1, Math.ceil(games.length / SEASON_LENGTH_DAYS_TARGET));
```

`ceil(1230 / 175)` is **8**. The loop then packed eight games into nearly every
night and ran out of games in ~156 days. The rounding, not the target, was
setting the season length — and nothing downstream could tell, because the
constant read as if it were authoritative.

### Back-to-backs were 57% too high

A direct consequence: the same 82 games in 18 fewer days. Teams averaged **22**
back-to-backs against a real 14. Fatigue and injury frequency both scale with
games played, so this was never cosmetic — the simulated league was playing a
materially denser season than a real one.

### Every night was the same size

Eight games on a Thursday, eight on a Saturday. Real slates swing from about 2
to about 13. The league had no big nights and no quiet ones.

### Nothing was named

No trade deadline anywhere in the codebase — `executeTradeAction` had no day or
phase check, so a user could trade during the Finals. The All-Star break existed
only as a pause in *simulation* at the user's 41st game; games either side of it
sat on consecutive days, so the calendar itself had no gap.

---

## Measured, before and after

| | Before | After | Real NBA |
| --- | ---: | ---: | ---: |
| Season length (days) | **155.8** | **173.9** | 174 |
| Total games | 1,230 | 1,230 | 1,230 |
| Games per team | 82 | 82 | 82 |
| Mean games per day | 7.9 | **7.1** | 7.1 |
| Busiest day | 8.0 | 10.0 | ~13 |
| Quietest day | 1.5 | 1.7 | ~2 |
| Days with no games | 0.3 | **6.2** | ~6 (All-Star) |
| Back-to-backs per team | **22.0** | **13.3** | ~14 |
| Worst team's back-to-backs | 27.0 | 18.2 | ~18 |
| 3-games-in-3-days | 0 | 0 | 0 |

Still short of real: the busiest night is 10 rather than 13. Real schedules are
more variable than a per-weekday target can express — some nights are genuinely
huge. Left as is because it changes nothing mechanically.

---

## How it was fixed

**Weekday-shaped slates.** `GAMES_BY_WEEKDAY` replaces the flat cap: light
Thursdays (4, the national doubleheader), heavy Fridays (10), summing to 52 a
week. That restores both the length and the texture.

**A real All-Star gap.** Six days with no games at all, Friday before All-Star
Sunday through the Wednesday after — the gap a real schedule leaves.

**Back-to-back avoidance, and why it is a per-night coin flip.** The obvious fix
— penalise pairs where a team played yesterday — turned out to be a knob with
only two settings. The assignment loop deliberately equalises every team's
remaining-game count, so competing pairs almost always tie on that key and *any*
non-zero penalty decides every comparison: measured, weights from 0.2 through 3
all produced 8.9 back-to-backs, and 0 produced 22.0, with nothing in between.

So the choice is made once per night off the seeded stream instead. On 60% of
nights the schedule protects rest; on the rest the calendar forces the issue.
The real figure falls out of the mix at **13.3**. Deterministic given the seed.

---

## What is date-driven and what is not

This distinction is deliberate and worth keeping.

**Date-driven** — fixed positions on `dayIndex`, enforced against it:

| Event | When | Derivation |
| --- | --- | --- |
| Opening night | day 1 | The Tuesday on or after Oct 21. Reproduces the real 2023, 2024 and 2025 openers. |
| Trade deadline | day 108 | Ten days before All-Star Sunday, which puts it on a Thursday — matching Feb 9 2023, Feb 8 2024, Feb 6 2025. |
| All-Star break | days 116–121 | Friday before through Wednesday after All-Star Sunday. |
| All-Star Sunday | day 118 | Measured: Oct 22 2024 → Feb 16 2025 is 117 days. Lands on a Sunday every season by construction. |
| Regular season ends | from the schedule | Read off the generated games, since the loop may overrun its target. |

**Progression-driven** — unlocked by the previous stage finishing, with no date:
play-in → playoffs → draft lottery → draft → offseason.

That is not a shortcut. Real postseason dates float too, because the Finals end
when the series ends. Gating the draft on a date would let it fire before a
champion existed. These carry nominal labels for display and are never enforced.

---

## The trade deadline

Enforced through `validateTrade`, the single chokepoint every trade already
passes — user-initiated, CPU-CPU, and the trade builder's live preview all
inherit it at once.

```ts
isAfterTradeDeadline?: boolean;
```

Passed in rather than computed inside the validator, deliberately: only the
caller knows whether a trade is even in-season. A draft-night pick swap and an
offseason trade both run through this validator and neither is subject to a
deadline, so leaving the flag undefined means "not an in-season trade" — the
correct default for every caller with no day index to offer.

`tradesAreClosed(games)` reads the league's own schedule and returns false once
every game has been played, so **trading reopens for the playoffs and the
offseason**, as it does in reality.

CPU teams are held to the same deadline. A league where the AI kept trading in
March would make the deadline meaningless.

---

## Still missing

Deliberately out of scope for this pass, and unchanged:

- **Free agency has no window.** `signFreeAgentAction` checks ownership, cap
  legality and that the player is unsigned — nothing else. A user can sign a
  free agent in January; CPU teams sign once a year in an offseason batch. The
  two sides of the market are on different calendars, which is a fairness gap
  rather than a missing feature.
- **No offseason sub-phases.** `advanceSeasonAction` is one atomic call. The
  real draft → free agency → moratorium → camp sequence is collapsed.
- **No preseason**, stated outright in `leagueEvents.ts`, which uses "the first
  month of games" as a sponsorship proxy.
- **No in-season tournament, buyout market, 10-day or two-way contracts**, and
  no restricted-free-agency offer-sheet window.

---

## Reproducing

```
npx tsx scripts/schedule-realism-audit.ts
```
