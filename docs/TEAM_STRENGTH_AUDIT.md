# Team Strength Audit

**Opened** 2026-08-13. Three audits now point here from different directions:

- `docs/SIMULATION_AUDIT.md` left **"talent concentration"** open
- `docs/DEVELOPMENT_AUDIT.md`'s **D-P0-1** is still open after two failed attempts
- `docs/PLAYOFF_AUDIT.md`'s **PO-P1-1** traced a too-competitive 1v8 series to a
  league where the 1 seed implies 53-29 rather than 60-22

`computeTeamStrength` is the number all three depend on, and it is 15 lines: a
weighted average of a roster, feeding `simulateGame`, the standings, playoff
seeding and team identity alike.

**Method.** `scripts/team-strength-audit.ts`, read-only. The real seeded league's
rosters, 200 simulated 82-game seasons, and 20,000 series per matchup.

**Headline.** The ratings are not the problem. **The weighting is**, and
re-weighting alone — without changing a single player rating — recovers
essentially all of the missing spread. Two previous audits went looking for this
in the rating distribution and could not find it, because it was never there.

---

## The measurement that matters

A season's win total is talent plus noise. The right question is not "is the
spread too small" — a win spread can look right for the wrong reason — but **how
much of it is talent**, because a seven-game series averages luck away and
leaves only talent. That is exactly where the playoffs went wrong.

| | This engine | Real NBA |
| --- | ---: | ---: |
| Realised win SD | 8.5 | ~12.0 |
| — of which **talent** | **6.4** | **~11.1** |
| — of which luck | 5.7 | ~4.5 |
| **talent share of variance** | **56%** | **~86%** |
| Best team, true talent | **53 wins** | ~60-65 |
| Worst team, true talent | **26 wins** | ~15-20 |

The league spans 26 to 53 wins where a real one spans roughly 17 to 63. Just
over half the standings are luck, against about one seventh in reality.

That is why a seven-game series behaves oddly: it strips the luck out and
exposes a talent gap that was never big enough.

> **A correction to `docs/SIMULATION_AUDIT.md`.** That audit reports a realised
> win SD of 10.7 in a fresh league and 14.1 in a developed one, calibrated
> against the NBA's ~12. Measured here on the current dataset with exactly 82
> games per team, it is **8.5**. Some of the difference is the 2026-27 re-seed
> and some is method, but the conclusion drawn there — that win spread is
> calibrated — does not hold now, and it would not have caught this either way:
> realised SD can be right while talent SD is not.

---

## TS-P1-1 — The weighting is an average, not a rotation

```ts
const ROTATION_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const BENCH_WEIGHT = 0.4;
```

Total weight across 15 players is 11.4, so:

| Slot | Share of team strength |
| --- | ---: |
| #1 | **12.3%** |
| #2 | 11.4% |
| #3 | 10.5% |
| top 3 combined | **34.2%** |
| bottom 6 combined | **21.1%** |

The best player on the roster is worth an eighth of the team. The six men who
would not leave the bench in a playoff game are worth a fifth of it — more than
half what the top three are worth.

Measured against a median roster, that produces this:

| Change | Extra wins |
| --- | ---: |
| Best player becomes a 99 | +9.1 |
| Add a 99, drop the 15th man | +14.8 |
| Top three become 95/92/89 | +15.0 |
| Bottom six all become 60s | **−7.7** |

**Acquiring a superstar is worth about as much as gutting six bench spots is
worth losing.** That is the weighting talking, not basketball. Real rotations
shorten to eight men in the playoffs and the 12th through 15th never play.

---

## The counterfactual: it is recoverable here

Re-weighting the same rosters, changing no ratings:

| Weighting | Talent SD | Best | Worst |
| --- | ---: | ---: | ---: |
| shipped (1.4 → 0.6, bench 0.4) | 6.4 | 53 | 26 |
| moderate (2.5 → 0.5, bench 0.15) | 8.5 | 59 | 20 |
| **steep (4.0 → 0.4, bench 0.05)** | **10.1** | **62** | **16** |
| top-5 only | 12.1 | 66 | 12 |
| **real NBA** | **~11.1** | **~63** | **~18** |

And it closes the playoff finding without touching the bracket:

| Matchup | Shipped | Steep | Real |
| --- | ---: | ---: | ---: |
| 1 vs 8 | 83.9% | **93.5%** | **93%** |
| 2 vs 7 | 75.7% | 82.8% | 78% |
| 3 vs 6 | 59.2% | 66.3% | 62% |
| 4 vs 5 | 55.4% | 57.5% | 52% |

1v8 win gap: **13 games → 19**, against a real ~22.

The steep curve lands 1v8 almost exactly and overshoots the closer matchups by
4-6 points, which says the right answer sits between "moderate" and "steep" and
needs a proper sweep against all four targets at once rather than one.

**Caveat on the seed approximation.** These matchups use every other team from
the league-wide sorted list as a stand-in for a conference's seeds 1-8. That is
a reasonable average but not a real conference split, so treat the per-matchup
numbers as directional and the talent-SD column as the solid one.

---

## Findings

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **TS-P1-1** | P1 | MODEL | `computeTeamStrength` weights a 15-man roster nearly flat: the best player is 12.3% of a team, the bottom six are 21.1%. Talent SD comes out at 6.4 wins against a real ~11.1, so 56% of the standings are luck against a real ~14%. |
| **TS-P2-1** | P2 | DOC | `SIMULATION_AUDIT.md`'s win-SD calibration (10.7/14.1) does not reproduce on the current dataset (8.5), and realised SD was the wrong statistic to calibrate against regardless. |

---

## Scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| Determinism & shape | **9** | Pure, sorted, stable, cheap. Nothing wrong with the mechanism. |
| Talent spread | **4** | 6.4 win SD against a real 11.1; league spans 26-53 rather than 17-63. |
| Star concentration | **4** | Best player is 12.3% of a team; a superstar ≈ six bench spots. |
| Downstream consistency | **6** | Feeds standings, seeding, identity and the playoffs — all inherit the compression. |

**Weighted overall: 5.0.** The lowest score of any audited system, and the first
below 7 since the trade work.

---

## Recommendation

**Re-weight, and calibrate the constants properly.** The fix is one array in a
15-line pure function, and the counterfactual shows it recovers what three
audits have been chasing. Sweep the curve against four targets simultaneously —
talent SD near 11, best/worst near 63/18, and the four first-round series rates
— rather than fitting 1v8 alone.

**This is a load-bearing change and should be playtested before it ships.**
Team strength feeds standings, playoff seeding, team identity (which drives CPU
trade and free-agency behaviour), fan happiness, season expectations and job
security. Widening it makes good teams genuinely good and bad teams genuinely
bad, which is the point — but it changes the feel of every save, and the CPU
identity thresholds were tuned against the current, flatter distribution.

Two knock-ons to check after: whether `computeTeamIdentity`'s
contender/rebuilding split still lands sensibly across a wider spread, and
whether tanking becomes too rewarding once the bottom of the league is genuinely
16-win bad.

---

## Reproducing

```
npx tsx scripts/team-strength-audit.ts
```
