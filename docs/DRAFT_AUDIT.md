# Draft Audit

**Opened** 2026-08-14. The third way a roster changes, after
`docs/TRADE_AUDIT.md` and `docs/FREE_AGENCY_AUDIT.md`. It matters beyond the
draft itself because `computeDraftPickTradeValue` prices picks for every trade
— a wrong pick curve is inherited by the whole trade system.

**Method.** `scripts/draft-audit.ts`, read-only, no database. 200,000 simulated
lotteries, 200 generated classes (12,000 prospects), the real 2026-27 dataset
as the league to compare against, and the actual valuation functions.

**Headline.** The lottery and the known-slot pick curve are both excellent —
measurably better than their own docstrings claim. **The defect is in future
picks**, which are projected without any lottery randomness at all. A rebuilding
team's own future first is overpriced by **47%**, and the user can sell it at
that price.

---

## D-1 — The lottery is essentially exact ✅

`draftLottery.ts` calls its odds table "real, published data, not an
approximation" and describes its *mechanism* — a weighted draw without
replacement rather than the real ping-pong combinatorics — as a documented
simplification. Whether the simplification preserves the odds is measurable,
and nothing had measured it.

Over 200,000 lotteries:

| Seed | P(#1) sim | P(#1) real | P(top 4) sim | P(top 4) real | Error |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.9% | 14.0% | 51.9% | 52.1% | −0.2pp |
| 2 | 14.1% | 14.0% | 52.3% | 52.1% | +0.2pp |
| 3 | 14.0% | 14.0% | 52.3% | 52.1% | +0.2pp |
| 4 | 12.4% | 12.5% | 47.9% | 48.2% | −0.3pp |
| 8 | 6.1% | 6.0% | 26.6% | 26.5% | +0.1pp |
| 14 | 0.5% | 0.5% | 2.5% | 2.4% | +0.1pp |

**Worst error across all 14 seeds: 0.13pp on P(#1), 0.5pp on P(top 4).**

The simplification is sound. The three-way flat top — which is what stops
tanking to be the single worst team from paying — reproduces correctly, and
that is the property the whole anti-tanking design rests on.

---

## D-2 — Intake still out-ceilings the league it joins

`docs/DEVELOPMENT_AUDIT.md` D-P0-2 found a linear potential curve made every
class better than the population, drifting the league to 221 players at 80+.
`POTENTIAL_FALLOFF_EXPONENT = 0.5` was the fix. Measured over 12,000 prospects
against the 450-player league:

| | Class | League |
| --- | ---: | ---: |
| mean overall | 67.0 | 72.9 |
| median overall | 67.0 | 71.0 |
| mean potential | **78.8** | **76.1** |
| median potential | 78.0 | 75.0 |
| share with potential 80+ | **42.8%** | **28.2%** |

Current ability is correctly below the league — rookies are unproven, which is
right. But **ceilings still run above the population**, and the 80+ share is
1.5x the league's. Sixty prospects a year enter a league of 450, so the drift
is slower than the linear curve produced but points the same way.

> **Caveat, and it is a real one.** A prospect's potential is unrealised; a
> 30-year-old's potential is essentially his current rating. Comparing the two
> distributions is not like-for-like, and whether ceilings actually inflate the
> league depends on realisation rates, which belong to the development system
> rather than to this one. What can be said from here is that intake ceilings
> sit above the population's, not that the league necessarily inflates. Closing
> this properly needs a multi-season simulation spanning both systems.

---

## D-3 — The known-slot pick curve is on its anchor ✅

Once a pick's slot is known, valuation is sound:

| Pick | Value | vs pick 30 | Exp. overall | Exp. potential |
| ---: | ---: | ---: | ---: | ---: |
| 1 | $52.4M | **8.03x** | 72.0 | 97.0 |
| 5 | $29.9M | 4.58x | 71.3 | 90.0 |
| 14 | $15.9M | 2.43x | 69.8 | 84.3 |
| 30 | $6.5M | 1.00x | 67.1 | 78.1 |
| 60 | $1.6M | 0.24x | 62.0 | 70.0 |

`docs/TRADE_AUDIT.md` calibrated the value curve to a market anchor of **#1
pick = 8x #30**. Measured: **8.03x**. The two systems agree to within a third
of a percent, which is what sharing `expectedRatingForPick` between the class
generator and the pick valuer was supposed to buy.

---

## D-4 — Future picks ignore the lottery, and it costs 47%

`projectedPickNumber` maps a team's competitiveness percentile linearly onto a
slot: worst team → pick 1. Its docstring is honest that this models no lottery
randomness. Nothing had measured what the simplification costs.

Running the worst team's pick through this project's own lottery, 200,000
times:

| | |
| --- | ---: |
| projected slot | **1** |
| actual expected slot | **3.66** |
| P(actually gets pick 1) | 14.1% |
| value at projected slot | **$52.4M** |
| true expected value | **$35.6M** |
| **overvalued by** | **46.9%** |

The projection hands the worst team a certainty the lottery explicitly denies
it. Post-2019 reform, the whole point of the flat 14/14/14 top is that being
worst does *not* secure pick 1 — and this projection restores exactly the
guarantee the real rules removed.

**Why this is an exploit and not just an inaccuracy.** Value flows to whoever
holds the pick, so a user who owns a bad team's future first can trade it for
about 1.5x what it is worth. The easiest way to own one is to tank, which makes
your own future firsts the overpriced asset. Sell them at the inflated price,
and the discount compounds with `YEARS_AWAY_DISCOUNT_PER_YEAR` favouring
nearer picks that are more certainly bad.

This lands harder after `docs/TEAM_STRENGTH_AUDIT.md`: the bottom of the league
is now genuinely 17-win bad rather than 26-win bad, so more teams sit near
percentile 0 where the error is largest.

---

## Findings

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **D-P1-1** | P1 | EXPLOIT | `projectedPickNumber` ignores lottery randomness, overvaluing a worst-placed team's future first by 46.9%. Tradeable at that price, and tanking is the way to acquire one. |
| **D-P2-1** | P2 | MODEL | Generated classes carry potential ceilings above the league's (42.8% at 80+ against 28.2%), so intake still out-ceilings the population after the D-P0-2 fix. Realisation rates belong to development, so this is not on its own proof of inflation. |

---

## Scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| Lottery fidelity | **10** | Reproduces published odds to within 0.13pp on P(#1) across all 14 seeds, mechanism simplification and all. |
| Known-slot pick valuation | **9** | Lands on the trade system's 8x anchor at 8.03x, sharing one curve with the class generator rather than duplicating it. |
| Class generation | **6** | Shape is right and the convex falloff fixed the worst of D-P0-2, but ceilings still sit above the population. |
| **Future pick projection** | **4** | Deterministic where the real system is explicitly random; 47% overvaluation at the bottom of the league, and it is tradeable. |

**Weighted overall: 7.3.** The highest of any system audited this session, and
the two weak spots are narrow and specific rather than structural.

---

## Recommendation

**Make `projectedPickNumber` return the lottery's expected slot rather than the
best possible one.** The machinery exists: `LOTTERY_ODDS` is already correct,
and `runLottery` already produces the right distribution. For a lottery-bound
team, the expected slot is computable in closed form from the odds table — no
simulation needed at valuation time — and for a playoff team the current linear
map is already right, because those picks are not lottery-bound at all.

That single change takes the worst-team overvaluation from 47% to roughly zero
while leaving every other pick untouched.

**Leave D-P2-1 alone for now.** It cannot be settled from inside the draft
system, and tuning the class curve to fix a symptom whose cause may live in
development is how the first version of this got mis-set. It needs a
multi-season simulation across both systems, which is a larger piece of work
than the finding currently justifies.

---

## Reproducing

```
npx tsx scripts/draft-audit.ts
```

---

# RESOLUTION — 2026-08-15

**D-P1-1 is closed.** Future first-rounders belonging to lottery teams are now
priced through the lottery.

| | Before | After | Truth |
| --- | ---: | ---: | ---: |
| Worst team's future first | **$52.4M** | **$35.6M** | $35.6M |
| Error | **+46.9%** | **−0.1%** | — |

The residual 0.1% is the audit's Monte Carlo sampling error against exact
enumeration, not a modelling gap.

## Two steps, because the first was not enough

**Step one: use the expected slot.** `expectedLotterySlotForSeed` computes it
exactly — the draw is four teams without replacement, so the outcome space is
just the 14x13x12x11 = 24,024 ordered top-four sequences, enumerable in full
against the same odds table `runLottery` draws from. No Monte Carlo, no
hand-copied table to go stale. That took the error from +46.9% to **−5.3%**.

**Step two: average the value, not the slot.** The residual was Jensen's
inequality, not rounding. Pick value is strongly convex in slot — pick 1 is
worth 8x pick 30 — so the value of the average slot is not the average value of
the slot, and using the mean systematically underprices a lottery pick.
`computeDraftPickTradeValue` now averages value across the full slot
distribution. Error: **−0.1%**.

## What did not change

Known slots, playoff teams' picks and every second-rounder still take the
straight deterministic path. There is no distribution to average over once a
draft has run, and the lottery does not touch round two.

## The shape of the correction, which is not uniform

| Lottery seed | Old slot | New expected slot |
| ---: | ---: | ---: |
| 1 | 1 | **3.66** |
| 4 | 4 | 4.44 |
| 8 | 8 | **7.04** |
| 12 | 12 | 11.40 |
| 14 | 14 | 13.73 |

The bottom three seeds lose heavily and mid-lottery seeds gain slightly —
winning the draw moves a team up further than other teams winning pushes it
down. That is the anti-tanking design showing up in valuation for the first
time: being worst no longer buys a guaranteed asset, and the reward for being
worse than 2nd or 3rd is a fraction of a pick rather than two.

## Two corrections made along the way

**A test asserted the wrong thing about the lottery.** I wrote a test claiming
seeds 1-3 have identical expected slots, since they share flat 14% odds. They
do not: if none wins a top-four pick they fall to picks 5, 6 and 7 in record
order. The test was wrong about the rules, not about the code, and now asserts
the gap is positive but under one pick.

**A fixture encoded the old valuation.** `draftPickTradeRoll.test.ts` had a
"near-even swap" between a future first and pick 10, chosen when that pick was
worth $20.1M. Re-pricing moved it to $24.3M, and the partner correctly refused
to overpay. The fixture moved to pick 8 rather than the acceptance threshold
moving — the test's intent was a near-even swap, and that intent had to be
re-anchored to the new numbers rather than the numbers bent back to it.

## Verification

1,477 tests (9 new, including a named regression guard), 0 lint errors,
typecheck clean.
