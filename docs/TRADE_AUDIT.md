# Trade System Audit

**Opened** 2026-08-12. The trade model is the only system in the game with no
per-season budget: free agency is bounded by cap space, the draft by pick count,
development by time. Trade is unbounded, so any mispricing in it is not a rough
edge — it is an unlimited resource.

**Method.** `scripts/trade-audit.ts`, read-only. Thirteen measurements against
the **real seeded league** — real ratings, real ages, real imported contracts —
using the shipped `computePlayerTradeValue`, `computeDraftPickTradeValue` and
`evaluateTradeOffer`. Nothing here is synthetic except where a controlled sweep
needs a fixed variable.

**Headline.** The system is structurally sound — legality, server authority,
and single-evaluator discipline are all right — and the **valuation underneath
it is inverted**. Ten of the league's best players are worth exactly nothing,
and the reigning MVP is worth less in trade than a 78-rated 21-year-old.

On turn one of a fresh save, this trade is both legal and accepted:

> **Atlanta sends** Buddy Hield + CJ McCollum + Gabe Vincent ($51.4M)
> **Golden State sends** Stephen Curry ($59.6M)

Salary matching passes ($64.5M allowed against $51.4M out). The CPU accepts at
six of seven GM personalities. Curry is flagged untouchable and the gate lets
him through anyway.

---

## T-P0-1 — The age multiplier is applied inside the logistic

```ts
// playerTradeValue.ts:57
const ageAdjustedScore = Math.min(100, input.overallRating * ageValueMultiplier(input.age));
// ...:61
scoreToCapFraction(grossScore)
```

The age discount multiplies the **score**, and the score is then fed through a
logistic. Scaling a logistic's input compounds: a 35% haircut on the score
becomes a 96% haircut on the output.

This is the exact defect `playerValue.ts` already documents as fixed, in a
comment sitting forty lines from the call site:

> **The age discount belongs here, on the money - not on the score.** … a 35%
> haircut on a 37-year-old's score became a 96% haircut on his salary.
> Measured against the seeded roster, that paid Kevin Durant $1.7M …

`ageAdjustedMarketValueCents` was corrected. `computePlayerTradeValue` was
never brought along.

Same rating, same (zero) salary, varying only age:

| Rating | Age | aged score | cap fraction |  Value | vs age 27 |
| -----: | --: | ---------: | -----------: | -----: | --------: |
|     93 |  22 |      100.0 |       0.3387 | $78.6M |     1.074 |
|     93 |  27 |       93.0 |       0.3154 | $73.2M |     1.000 |
|     93 |  31 |       85.6 |       0.2521 | $58.5M |     0.799 |
|     93 |  34 |       74.4 |       0.0975 | $22.6M |     0.309 |
|     93 |  37 |       60.5 |       0.0122 |  $2.8M | **0.039** |
|     93 |  40 |       46.5 |       0.0012 |  $0.3M | **0.004** |

A 37-year-old loses **96%** of his trade value to age alone. The intended
discount, read straight off `ageValueMultiplier`, is 35%.

**56 of 537 rostered players have a trade value of exactly zero.** Ten of them
are rated 80 or better:

| Player          | Ovr | Age | Paid   | Trade value |
| --------------- | --: | --: | ------ | ----------- |
| Stephen Curry   |  93 |  37 | $59.6M | **$0**      |
| Kevin Durant    |  92 |  37 | $54.7M | **$0**      |
| LeBron James    |  92 |  40 | $52.6M | **$0**      |
| Kawhi Leonard   |  91 |  34 | $50.0M | **$0**      |
| James Harden    |  89 |  36 | $39.5M | **$0**      |
| Damian Lillard  |  88 |  35 | $14.1M | **$0**      |
| Jimmy Butler III|  87 |  36 | $54.1M | **$0**      |
| Rudy Gobert     |  83 |  33 | $35.0M | **$0**      |
| Paul George     |  82 |  35 | $51.7M | **$0**      |
| DeMar DeRozan   |  82 |  36 | $24.6M | **$0**      |

---

## T-P0-2 — Zero-valued players defeat every guard at once

Zero is not just a wrong number; it is a number that disables the surrounding
logic, because every protection in `evaluateTradeOffer` is multiplicative.

**The untouchable gate collapses.** Curry is rated 93, so
`getPlayerValueTier` returns `SUPERSTAR` and `isUntouchable` is true. Then:

```ts
const requiredOverpay = scaleCents(objectivePlayerValue(asset), 1.75); // 0 * 1.75 = 0
if (totalIncomingCents < requiredOverpay) return REJECT;               // 0 < 0 is false
```

A 175% overpay on nothing is nothing. The gate that exists specifically to stop
this passes without resistance.

**The score falls through to a hardcoded accept.**

```ts
const score = totalOutgoingCents > 0n
  ? Number(totalIncomingCents) / Number(totalOutgoingCents)
  : totalIncomingCents > 0n ? Number.POSITIVE_INFINITY : 1;
```

Both zero branches accept: `Infinity ≥ 0.95`, and `1 ≥ 0.95`. Nothing-for-nothing
is an ACCEPT, and "nothing" includes Stephen Curry.

**Measured league sweep.** Sending the user's three least valuable players
(objective value $0.0M) and asking all 29 CPU teams for their best player:

| GM personality   | Best player acquirable for nothing |
| ---------------- | ---------------------------------- |
| AGGRESSIVE       | Stephen Curry (93)                 |
| WIN_NOW          | Stephen Curry (93)                 |
| PROSPECT_LOVER   | Stephen Curry (93)                 |
| PICK_HOARDER     | Stephen Curry (93)                 |
| SALARY_CONSCIOUS | Stephen Curry (93)                 |
| BALANCED         | Stephen Curry (93)                 |
| CONSERVATIVE     | *nothing*                          |

Only CONSERVATIVE holds, and only by accident: its
`acceptanceThresholdMultiplier` of 1.15 pushes the bar to 1.0925, which the
hardcoded `score = 1` happens to miss. One personality out of seven is
protected by a rounding artifact.

---

## T-P0-3 — Value saturates above 90

`scoreToCapFraction` is a logistic capped at 0.35 of the cap. It was calibrated
to price **salaries**, where a ceiling is correct — the CBA has a max contract.
Trade value has no such ceiling, and reusing the curve imposes one anyway.

| Rating | Value (age 27, unpaid) | × a 70-rated | Marginal per point |
| -----: | ---------------------: | -----------: | -----------------: |
|     70 |                 $12.5M |         1.00 |                  — |
|     80 |                 $40.6M |         3.24 |              $3.3M |
|     85 |                 $56.9M |         4.54 |              $3.3M |
|     90 |                 $68.6M |         5.47 |              $2.0M |
|     93 |                 $73.2M |         5.83 |              $1.5M |
|     96 |                 $76.2M |         6.07 |              $1.0M |
|     99 |                 $78.1M |         6.23 |          **$0.6M** |

A rating point is worth **5.5× less** at the top of the league than in the
middle, and the whole 70→99 span is compressed into a 6.2× range. The
consequence, measured on real players:

> Shai Gilgeous-Alexander (98) = **$58.4M**
> Kyshawn George (78, age 21) = **$62.0M**
> — the MVP is worth **0.94×** a good young role player.

Which is directly exploitable. Against SGA's own team:

| Buyer identity | Package needed | Objective value paid |
| -------------- | -------------- | -------------------- |
| REBUILDING     | 2 players rated 68–74 | $106.6M for $58.4M |
| TANKING        | 2 players rated 68–74 | $106.6M for $58.4M |
| PLAY_IN        | 2 players rated 68–74 | $106.6M for $58.4M |

Two rotation players buy an MVP. That is the whole roster-building game
collapsing into a single move.

Three separate youth premiums stack to produce this, and none of them knows
about the others:

1. `ageValueMultiplier` boosts a 22-year-old's score by up to 15% — then the
   logistic compounds it, as in T-P0-1 but in the favourable direction.
2. `grossScore += upsideGap * UPSIDE_WEIGHT` adds potential on top.
3. `evaluateTradeOffer` then multiplies by `youthValueMultiplier` (up to 1.3)
   and `REBUILDING_YOUTH_PICK_BONUS` (1.15).

---

## T-P0-4 — Incoming assets get bonuses that outgoing assets do not

```ts
// incoming (lines 176-198)
if (asset.age <= YOUNG_AGE_THRESHOLD)  value = scale(value, weights.youthValueMultiplier);
if (isRebuildingIdentity)              value = scale(value, REBUILDING_YOUTH_PICK_BONUS);
if (needs.some(...playerFillsNeed))    value = scale(value, NEED_FIT_BONUS_MULTIPLIER);

// outgoing (lines 216-227)
totalOutgoingCents += objectivePlayerValue(asset);   // raw. no weights at all.
```

Picks are handled symmetrically — `pickValueMultiplier` is applied in both
directions, and the comment on that field says so explicitly. **Players are
not.** The same player is worth up to `1.3 × 1.15 × 1.25 = 1.87×` more arriving
than departing.

A GM who values a 24-year-old at $50M when receiving him and $27M when sending
him away is not expressing a philosophy — he is arbitrageable. Measured on a
23-year-old centre offered to a team that needs a rim protector, the round-trip
score product is **2.79** (a symmetric model gives exactly 1.00).

**Consequence, measured.** Sweeping 5,300 mirror pairs — the same two real
players swapped, asked of both sides — **160 double-accept (3.0%)**. Both teams
believe they won. Decomposed against the reciprocal band that
`ACCEPT_THRESHOLD = 0.95` deliberately allows:

| Source of the double-accept | Count |
| --------------------------- | ----: |
| Intended slack (0.95–1.053) |    75 |
| **One-sided bonuses**       |**60** |

Worst mutually-accepted skew: **1.20×** (Jalen Green $31.1M ↔ Jarrett Allen
$37.4M, both sides ACCEPT).

---

## T-P1-1 — A bad contract's cost floors at zero

`computePlayerTradeValue` ends `return finalValueCents > 0n ? finalValueCents : 0n`.
Surplus is real and correctly signed up to that point — and then the clamp
throws away everything below zero.

An 85-rated 30-year-old:

| Salary | Trade value | Marginal |
| -----: | ----------: | -------: |
|    $0M |      $40.3M |        — |
|   $40M |      $20.3M |   −$5.0M |
|   $80M |       $0.3M |  −$10.0M |
|  $100M |          $0 |   −$0.3M |
|  $150M |          $0 |    **$0** |

Past roughly $80M the contract stops mattering. A $150M albatross and a $100M
albatross are priced identically, and neither is a liability.

**So salary dumping is free.** A 70-rated 33-year-old on $50M has a trade value
of $0, so giving him away scores `1` and every identity accepts:

```
CONTENDER      SALARY_CONSCIOUS -> ACCEPT  (score 1)
PLAYOFF_TEAM   SALARY_CONSCIOUS -> ACCEPT  (score 1)
PLAY_IN        SALARY_CONSCIOUS -> ACCEPT  (score 1)
REBUILDING     SALARY_CONSCIOUS -> ACCEPT  (score 1)
TANKING        SALARY_CONSCIOUS -> ACCEPT  (score 1)
```

This voids the entire cap system as a constraint on the user. Every difficult
contract in `docs/CONTRACT_AUDIT.md` — every overpay, every declining veteran on
a frozen price — can be handed to a CPU team for free, at any time, in unlimited
quantity.

**And `SALARY_CONSCIOUS` is not salary-conscious.** `badContractSensitivityMultiplier`
is declared in `GmPersonalityWeights`, documented as "applied to how much a bad
incoming contract subtracts from value", and **never read by
`evaluateTradeOffer`**. The only consumer in the codebase is
`reSigningDecision.ts:151`. In trades, that personality differs from BALANCED by
a 1.05 threshold nudge and nothing else.

---

## T-P1-2 — No roster-size check on the trade path

`DEFAULT_MAX_ROSTER_SIZE = 15` is enforced in free agency
(`cpuFreeAgentPass.ts:77`) and in CPU signings (`leagueEvents.ts:765`).
`executeTradeAction` never checks it, on either side.

A user can take back five players for one, repeatedly, and carry a 30-man
roster. A CPU team can be left with six. Nothing downstream — rotation, sim,
cap — expects either.

---

## T-P2-1 — CPU-CPU trades are *powered by* the asymmetry

`rollForCpuTrade` correctly requires **mutual ACCEPT** before executing a
CPU-CPU swap. That is the right design, and it means CPU trade volume is drawn
from exactly the double-accept population T-P0-4 measures.

Of ~400 sampled cross-team pairs, **25 mutually accept**, moving a mean
objective gap of **$1.4M** per swap. So the current volume is modest and the
per-trade bleed is small — but it is not zero, and more importantly:

**Fixing T-P0-4 will reduce CPU-CPU trade volume, possibly to near zero.** The
two changes have to land together, with `ACCEPT_THRESHOLD`'s slack widened
deliberately to restore a sane trade count, rather than left to be supplied
accidentally by a valuation bug.

---

## T-P2-2 — No trade deadline exists

There is no season-phase concept anywhere: the `League` model carries
`currentSeason` and `seasonStartedAt` but no phase, and no `TRADE_DEADLINE`
constant exists in the codebase. Trades are therefore legal at every point in
a season, including after the last game.

Listed as P2 because it is a **design gap, not a broken check** — nothing was
bypassed. Adding one needs a clock; games-played is the natural candidate.

---

## What the system already does well

This list is not padding. The parts that are right are the parts that are
hardest to retrofit, and they are why every finding above is fixable inside
two files.

- **Server authority is real.** `executeTradeAction` re-fetches cap state and
  re-runs both `validateTrade` and `evaluateTradeOffer` server-side, and the
  comment says why: "the client-side check in TradeBuilder is a UX affordance,
  not the authorization boundary." It also re-verifies roster ownership and
  pick ownership against the DB. There is no client-trust exploit here.
- **One evaluator, four callers.** The Trade Builder preview, the server gate,
  CPU-CPU swaps, and `suggestCounterOffer` all call the same pure
  `evaluateTradeOffer`. The counter-offer generator uses the evaluator *itself*
  as the judge rather than a second heuristic. Nothing can drift out of sync —
  which is also why fixing the valuation fixes all four at once.
- **Legality is checked before desire**, and the ordering is deliberate: "a
  real GM never considers a trade its team can't even legally make."
- **The CBA model is genuinely good.** The three-tier salary-matching formula,
  the first/second apron multipliers, the no-aggregation rule, cap-space rooms
  and a Stepien-lite consecutive-first-rounder check are all implemented and
  correctly applied per-team rather than league-wide.
- **Value is monotone where it must be.** Zero inversions in rating across
  60–99; zero inversions in salary across $0–$60M. Whatever else is wrong, the
  function is at least well-behaved.
- **Pick pricing is sound.** A #1 overall prices at $45.2M (≈ an 82-rated
  player), #14 at $33.7M, a second-rounder at $7.4M, with a 0.85/year future
  discount and the convex potential curve shared with the draft generator.
  These are reasonable against real pick-value charts.
- **The untouchable gate is the right shape** — a hard, non-weighted gate that
  no personality can argue with. It fails only because it is multiplicative and
  T-P0-1 feeds it a zero.
- **Mutual accept for CPU-CPU trades**, so the AI cannot rob itself by
  construction.

---

## Findings

| ID         | Sev | Type            | Finding                                                                                                                                            |
| ---------- | --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-P0-1** | P0  | VALUATION       | `ageValueMultiplier` is applied inside `scoreToCapFraction`, compounding a 35% discount into 96%. 56 players are worth exactly $0, ten rated 80+.  |
| **T-P0-2** | P0  | EXPLOIT         | Zero-valued players defeat the untouchable gate (`0 × 1.75 = 0`) and the score fallback (`0/0 → 1 → ACCEPT`). Curry is acquirable for junk on turn one. |
| **T-P0-3** | P0  | VALUATION       | Value saturates above 90: a rating point is worth 5.5× less at the top. The MVP prices at 0.94× a 78-rated 21-year-old; two rotation players buy him. |
| **T-P0-4** | P0  | MARKET LOGIC    | Incoming players get up to 1.87× in stacked bonuses; outgoing players get none. 60 of 135 measured double-accepts trace to this; worst skew 1.20×.  |
| **T-P1-1** | P1  | EXPLOIT         | Trade value clamps at 0, so a bad contract is never a liability. Salary dumps are free for every identity, voiding the cap as a constraint.        |
| **T-P1-2** | P1  | INTEGRATION GAP | `executeTradeAction` enforces no roster-size limit, though 15 is enforced in free agency and CPU signings.                                          |
| **T-P2-1** | P2  | MARKET LOGIC    | CPU-CPU trade volume moves when the asymmetry is fixed, so the frequency knob has to be recalibrated alongside it.                                 |
| **T-P2-2** | P2  | DESIGN GAP      | No season-phase concept, therefore no trade deadline. Trades are legal at any point in a season.                                                    |
| **T-P2-3** | P2  | BUG             | `badContractSensitivityMultiplier` is declared and documented for trades but never read by `evaluateTradeOffer`.                                    |

---

## Scorecard

| Dimension                  | Score | Why                                                                       |
| -------------------------- | ----: | ------------------------------------------------------------------------- |
| Legality / CBA modelling   | **9** | Matching tiers, aprons, aggregation, Stepien all present and correct.     |
| Server authority           | **9** | Re-validated server-side; no client trust; ownership re-checked.          |
| Architecture               | **9** | One pure evaluator, four callers, no drift. Fixes land in two files.      |
| Pick valuation             | **7** | Sane slotting and discounting; inherits the top-end saturation.            |
| Player valuation           | **2** | Age compounding, top-end saturation, zero-floor. MVP < a 78-rated rookie. |
| Symmetry / arbitrage       | **2** | 1.87× directional bonus stack; 3.0% of mirror pairs double-accept.        |
| Exploit resistance         | **1** | Free superstars, free salary dumps, unlimited roster growth.              |
| CPU self-preservation      | **4** | Mutual-accept is right, but rests on the asymmetry it should not need.    |

---

## Recommended fix order

Four changes, in dependency order. The first two are small and remove most of
the exploit surface.

1. **Move the age discount out of the logistic** (T-P0-1). Apply
   `ageValueMultiplier` to the output cents, exactly as
   `ageAdjustedMarketValueCents` already does — the correction is written and
   justified in `playerValue.ts`, it just needs applying here. Expect every
   zero-valued veteran to return to a realistic figure.

2. **Give trade value its own curve** (T-P0-3). `scoreToCapFraction` has a
   ceiling because *salaries* have a ceiling; trade value does not.
   This must not touch `scoreToCapFraction` itself — it is shared with
   contract pricing, and moving it once before compressed an 85-rated player
   from 16.1× to 11.9× a 65-rated one and broke a CPU trade test.

3. **Make the model symmetric** (T-P0-4), and re-tune `ACCEPT_THRESHOLD` in the
   same change (T-P2-1) so CPU-CPU trade volume is set deliberately rather than
   supplied by the bug. Either apply the same weights in both directions, or
   apply them to neither and let identity/needs move only the threshold.

4. **Let contracts go negative** (T-P1-1), bounded — a bad contract should cost
   real assets to move — and wire `badContractSensitivityMultiplier` into
   `evaluateTradeOffer` (T-P2-3) so SALARY_CONSCIOUS means something. Then add
   the roster-size check (T-P1-2).

Then add regression tests that fail on today's code: a mirror-trade property
(no pair double-accepts outside the slack band), a monotonicity property (value
strictly increasing in rating at every age), and a floor property (no rostered
player rated 80+ is worth under $5M).

---

## Reproducing

```
npx tsx scripts/trade-audit.ts
```

---

# RESOLUTION — 2026-08-13

All four P0s and both P1s fixed. 1,415 tests pass, production build clean,
0 lint errors.

## What changed

**`src/lib/valuation/tradeValueCurve.ts` (new).** Trade value gets its own
curve. `scoreToCapFraction` is untouched — it is shared with contract pricing,
and moving it once before compressed an 85-rated player from 16.1× to 11.9× a
65-rated one and broke a CPU trade test. The two models needed different
shapes, not one shape half-serving both.

The parameters are **fitted, not chosen** (`scripts/trade-curve-calibration.ts`,
relative squared error 5e-5) against the two places the real market gives a
checkable ratio: the #1 overall pick is worth ~8× the #30, and an MVP-tier
player ~3× the #1 overall.

A single exponential cannot satisfy both. Fitted to the pick chart alone it
needs k=0.203, which then makes a 99 worth **360×** a 70 — because the pick
chart's steepness is a local property of the narrow 71–82 band picks occupy,
not a global one. The required rate is ~0.20 around score 75 and ~0.04 around
score 90, i.e. it must *fall* with score. That is a logistic: the original
shape was right and only its ceiling was wrong.

**Age moved out of the logistic** (T-P0-1) in both `playerTradeValue.ts` and
`draftPickTradeValue.ts` — the same correction `ageAdjustedMarketValueCents`
already carried for salaries.

**Value can now go negative** (T-P1-1), bounded without a magic number: talent
value is never negative and surplus is never worse than the whole salary, so
the floor is −0.5× salary.

**The model is symmetric** (T-P0-4). Philosophy weights apply identically in
both directions. The one exception is deliberate and documented:
`badContractSensitivityMultiplier` applies to incoming negative surplus only,
because it is about what a team will take *on* — and it is now actually wired
in (T-P2-3), where its only previous reader was `reSigningDecision.ts`.

**The decision is a margin test, not a ratio** — `incoming >= outgoing ×
threshold`. Identical whenever outgoing is positive, and still correct when it
is not: shedding a −$20M contract is a gain, which a ratio reads as zero.
`score` survives as a bounded presentation figure for the UI and fan sentiment.

**The untouchable gate is priced off talent**, which a contract cannot cancel
(T-P0-2), and **roster limits are enforced on the trade path** (T-P1-2): 15 max,
13 min, both sides.

## Measured before → after

| Measurement | Before | After |
| ----------- | -----: | ----: |
| Players worth exactly $0 | **56 of 537** | **0** |
| Players rated 80+ worth under $1M | **10** | **0** |
| Stephen Curry (93, age 37) | **$0** | $65.7M |
| Kevin Durant (92, age 37) | **$0** | $64.9M |
| LeBron James (92, age 40) | **$0** | $44.6M |
| 37-year-old's value retained vs age 27 | **3.9%** | 65% |
| Rating spread, 70 → 99 | 6.2× | **19.9×** |
| MVP vs a 78-rated 21-year-old | **0.94×** | **2.38×** |
| Players rated 68–74 needed to buy an MVP | **2** | 9 (and now roster-illegal) |
| #1 pick vs #30 pick | 1.9× | **8.0×** |
| Worst round-trip price ratio, neutral GM | **1.8688** | **1.0000** |
| Round-trip probes deviating >1%, neutral GM | **833 of 1,680** | **0 of 819** |
| Albatross (70 ovr, 33, $50M) | $0, every team accepts | **−$18.0M, every team rejects** |
| Best player acquirable for a $0 junk package | **Stephen Curry** | none |

## Volume: the knob that was nearly the wrong one

Making the model symmetric raised the CPU-CPU roll-success rate from 42.6% to
**75.5%** — two teams now agree when they genuinely want *different things*,
rather than when a one-sided bonus made one swap look good to both.

The tempting fix was to raise `ACCEPT_THRESHOLD` until volume came back. It
works numerically — 1.05 lands the target — but it means a bar **above 1.0**,
i.e. the CPU rejecting a mathematically fair offer from the user, as a side
effect of a valuation fix. Acceptance sets how a GM *behaves*; frequency sets
how often the league tries. `ACCEPT_THRESHOLD` stayed at 0.95 and
`TRADE_CHANCE_PER_GAME` was rescaled 0.03 → 0.017, holding **15.8 completed CPU
trades a season** against a target of 15 (`scripts/cpu-trade-rate.ts`).

## Knock-on: re-signing

`evaluateReSigningDecision` scores retention as `tradeValue / offerSalary`, so
rescaling trade value moves it. Measured across every rostered player × every
personality (`scripts/resign-threshold-calibration.ts`), retention at the
existing `RESIGN_THRESHOLD = 0.35` is **85.4%**, against the 84.1% the previous
calibration produced. **The constant did not need to change**, and was left
alone. Retention among 33+ players rose from ~0% to 72.1%, which is the point:
ageing players are no longer worthless.

Seven test fixtures across four files were re-anchored, each with a comment
recording why the margin moved. They encoded decisions that were only correct
because veterans were worth zero and adjacent picks were 2% apart.

**One narrowing to record honestly.** Trade value is no longer capped while the
re-signing *offer* still is, so `value / offer` climbs steeply with rating and a
fairly-priced veteran of any real quality now clears the bar for every identity.
The window where team context alone decides retention has narrowed to
near-minimum players (the fixture moved from a 72-rated to a 59-rated). That is
a re-signing concern rather than a trade one — the deeper question is whether
that function should compare *market salary* to the offer rather than *trade
value*, which is a different scale — and it belongs to a free-agency audit, not
this one.

## Regression net

Nine properties, each verified to fail on the pre-audit model:

- value is a real liability for an albatross, bounded by salary;
- the age discount is not compounded (a 37-year-old retains 50–80%);
- value is **strictly increasing in rating at every age**, swept 60→99 × 7 ages;
- an MVP is worth a real multiple of a good young prospect;
- round-trip pricing is symmetric for every neutral GM × identity × need set;
- no identity or personality absorbs an albatross for nothing;
- Salary-Conscious is genuinely warier of bad money than Balanced;
- the untouchable gate holds when net value is zero or negative;
- pick ratios track the chart the curve was fitted to.

## Still open

- **T-P2-2, no trade deadline.** Unchanged: there is no season-phase concept to
  hang one on. Games-played is the natural clock.
- The re-signing scale mismatch described above.
- Trade value uses the *scouting report* `potentialRating`, not the real
  `effectiveCeiling` from `docs/DEVELOPMENT_AUDIT.md`. Defensible — nobody knows
  a prospect's true ceiling — but it means high-potential/low-trait players are
  systematically overvalued, which is exploitable by a user who knows the model.

## Reproducing

```
npx tsx scripts/trade-audit.ts                  # the 13 measurements
npx tsx scripts/trade-curve-calibration.ts      # how the curve was fitted
npx tsx scripts/cpu-trade-rate.ts               # CPU trade volume
npx tsx scripts/resign-threshold-calibration.ts # the re-signing knock-on
```
