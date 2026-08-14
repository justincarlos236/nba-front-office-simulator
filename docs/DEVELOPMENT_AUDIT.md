# Player Development Audit

**Opened** 2026-08-12. `developPlayerRating` sets every rating after season one, so it governs more of a long save than any model previously audited here — and nothing had measured it.

**Method.** `scripts/development-audit.ts`, read-only. Twenty seasons, twelve runs averaged, starting from the **real seeded league** rather than a synthetic pyramid, using the shipped `developPlayerRating`, `shouldRetire` and draft-class rating curves.

**Headline.** I expected star decline to drain the league. The opposite happens: **the league inflates.** By season 20 roughly half of it is rated 80+, while simultaneously no player can be elite past 34.

---

## D-P0-1 — Young players cannot fail to develop

```ts
const growth = randomIntInclusive(rng, 1, Math.min(4, room));
const coachedGrowth = Math.max(1, Math.min(room, Math.round(growth + …)));
```

The floor is **+1 every season**. A player under 27 with any headroom cannot stagnate, cannot regress, and cannot bust. Every prospect marches to his ceiling; the only question is how fast.

Simulated 500 prospects per draft slot from age 20 to 26:

| Drafted at        | Reached potential | **Busted** | Mean rating at 26 |
| ----------------- | ----------------- | ---------- | ----------------- |
| Pick 1 (72 / 97)  | 1%                | **0%**     | **89.5**          |
| Pick 15 (69 / 90) | 12%               | **0%**     | **86.4**          |
| Pick 30 (67 / 83) | 60%               | **0%**     | **82.3**          |
| Pick 60 (62 / 70) | 84%               | **0%**     | 70.5              |

A pick-30 prospect becomes an 82 with certainty. Every draft class therefore delivers roughly **thirty** future 80+ players. Real drafts produce perhaps five to eight.

Busts are not a rough edge of a sports simulator — they are most of what makes drafting a decision. Here, a lottery pick is a guaranteed 86.

---

## D-P0-2 — League talent inflates, and the existing test cannot see it

Mean of 12 runs, 20 seasons:

| Season | 90+  | 85+       | 80+       | Max  | Top-10 mean | Median | Median age |
| ------ | ---- | --------- | --------- | ---- | ----------- | ------ | ---------- |
| 0      | 14.0 | 46.0      | 90.0      | 98.0 | 94.5        | 71.0   | 25.0       |
| 3      | 21.1 | 50.5      | 111.3     | 98.5 | 95.2        | 74.1   | 26.0       |
| 5      | 23.7 | 54.0      | 130.3     | 98.8 | 95.5        | 75.9   | 27.0       |
| 10     | 28.0 | **95.0**  | **194.1** | 97.8 | 94.8        | 78.3   | 28.0       |
| 20     | 28.7 | **103.9** | **221.1** | 96.4 | 94.0        | 79.3   | 27.8       |

Real NBA, for reference: ~14 at 90+, ~44 at 85+, ~82 at 80+.

**By season 10 the league has 95 players rated 85+ against a real 44, and 194 at 80+ against a real 82. By season 20, 221 of 450 — half the league — are 80+.**

The cause is arithmetic. Draft classes arrive with a mean potential around 83 into a league whose median is 71, and D-P0-1 guarantees they realise it. Intake is systematically better than the population it joins, every year, forever.

### Why `longSave.invariant.test.ts` passes anyway

That test asserts `Math.abs(last - first) <= 10` on the **median** rating. Measured drift is **8.3** — inside the bound. It also checks headcount, retirement volume and median age, all of which stay healthy.

A median is exactly the wrong statistic here. It moves slowly while the shape of the distribution changes completely, and it is equally blind to the opposite failure: every star could vanish and the median would not notice. The invariant needs to be about the _tails_.

---

## D-P1-1 — Decline is absolute, not proportional

```ts
const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
const decline = randomIntInclusive(rng, baseDecline, baseDecline + 2) - bonuses;
```

A 99 and a 70 lose the same 1–3 points at age 30. Nothing about being elite slows the fall.

A cohort of 400 players rated 95 at age 27:

| Age | Mean rating | Still 90+ |
| --- | ----------- | --------- |
| 30  | 94.9        | 100%      |
| 32  | 90.9        | 78%       |
| 33  | 89.0        | 39%       |
| 34  | 86.0        | **6%**    |
| 35  | 83.0        | **0%**    |
| 38  | 72.0        | 0%        |

**No player can be elite past 34.** The seeded league opens with LeBron James at 40, Kevin Durant at 37, Stephen Curry at 37 and Kawhi Leonard at 34 — four players the model says cannot exist. Real elite athletes decline far more slowly than replacement-level ones; here they decline identically.

This is also why D-P0-2's `Max` and `Top-10` columns stay flat while everything beneath them rises: the top is capped by aggressive decline at the same time the middle inflates. **The two defects partially mask each other in aggregate**, which is how a median-based invariant misses both.

---

## Downstream

Rating drives `computeReSigningMaxOfferCents`, so **rating inflation is payroll inflation**. A player at 80 prices near 17.5% of the cap. With 194 players at 80+ by season 10 — against 82 today — CPU re-signing costs rise across the league with no corresponding revenue, on top of `docs/CONTRACT_AUDIT.md` C-P1-2, which already lets a declined star be signed at his frozen 2025-26 price.

It also flattens the game: when half the league is 80+, "good player" stops meaning anything, trade value compresses, and roster-building decisions lose their teeth.

---

## Findings

| ID         | Severity | Type            | Finding                                                                                                                                                                                   |
| ---------- | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-P0-1** | P0       | MODEL           | Growth floor of +1/season means a 0% bust rate at every draft slot. Pick 1 averages 89.5 by age 26, pick 30 averages 82.3. Each class yields ~30 future 80+ players against a real 5–8.   |
| **D-P0-2** | P0       | LONG-SAVE DRIFT | League inflates: 85+ goes 46 → 95 by season 10 → 104 by season 20; 80+ goes 90 → 221. `longSave.invariant.test.ts` passes because it guards the median (drift 8.3 against a bound of 10). |
| **D-P1-1** | P1       | MODEL           | Decline is absolute, not proportional. Zero percent of 95-rated players are still elite at 35, while the seeded league ships four such players.                                           |

---

## What is already right

- **Retirement.** The curve, the forced age of 41 and the rating-linked risk all behave; retirement volume and median age hold for twenty seasons.
- **Prime-years drift** (`randomIntInclusive(rng, -1, 1)`) is a sensible unbiased random walk.
- **The coach / minutes / morale / department nudges.** All are small, neutral-anchored and bounded, exactly as documented — none of them causes any of this.
- **Determinism.** Same seed, same league.

---

## RESOLUTION — D-P1-1 fixed, D-P0-1 and D-P0-2 still open

**D-P1-1 is fixed.** Decline now scales with rating: `ELITE_DECLINE_DAMPING`
removes up to 55% of the yearly drop, ramping from no effect at 75 to full
effect at 99. Measured across 400 players rated 95 at age 27:

| Age | Still 90+ before | Still 90+ after |
| --- | ---------------- | --------------- |
| 33  | 39%              | **80%**         |
| 34  | 6%               | **44%**         |
| 35  | 0%               | **16%**         |
| 37  | 0%               | **2%**          |

A 37-year-old star is possible again, which the seeded league requires of it.
Cost: the 90+ population rises slightly (32.8 against 28.0 at season 10) because
stars persist longer. Four regression tests cover it.

### D-P0-2 fixed 2026-08-12 (second pass)

Potential is no longer a certainty. A player's real ceiling is a fraction of his
_scouted_ potential, drawn once from a career-stable trait
(`effectiveCeiling` / `developmentTraitFromId`), and the draft's potential curve
is now convex rather than linear — real classes are top-heavy, a couple of
genuine star ceilings above a long tail. Growth is also paced against the
remaining climb, because a flat 1–4 per season meant a prospect with a real 95
ceiling gained ~17 points over seven years and stalled in the high 80s: he could
never actually arrive, so the top drained no matter how the ceiling was set.

| Season | 90+ before | 90+ after | 85+ before | 85+ after | 80+ before | 80+ after |
| ------ | ---------- | --------- | ---------- | --------- | ---------- | --------- |
| 0      | 14.0       | 14.0      | 46.0       | 46.0      | 90.0       | 90.0      |
| 10     | 28.0       | **12.1**  | 95.0       | 53.1      | 194.1      | 128.1     |
| 20     | 34.1       | **12.8**  | 103.9      | 53.2      | 232.1      | 141.4     |

Real: ~14 / ~44 / ~82. **The star population now holds at 14 across two
decades** instead of drifting to 34.

**The residual, stated plainly.** 85+ settles around 53 against a real 44, and
80+ around 141 against 82. Both are far better than the 104 / 232 they were, and
both are stable rather than compounding, but neither is right.

That gap is a deliberate trade. `MIN_CEILING_REALIZATION` moves every band
together: at 0.35, measured, 80+ lands at 69 (better than real) and prospects
look realistic — but the 90+ population drains to **5** by season twenty. A
league with five stars is a worse game than one carrying extra good role
players, so the star count won. Anyone revisiting this needs a lever that
separates the top from the middle — most likely making scouting _more_ reliable
for genuine top prospects than for mid-round ones, which is also true of real
drafts.

**D-P0-1 is NOT fixed.** Two attempts failed and are
recorded here so the next one does not repeat them:

1. _Growth proportional to remaining ceiling_ (`room × rate`, rate driven by a
   stable per-player trait). This inverted the intent — the players with the
   most headroom grew fastest — and **doubled** the inflation it was meant to
   fix: 90+ went from 28 to 56 by season 10.
2. _An explicit busted/not-busted split._ Bimodal: below a threshold the league
   inflated exactly as before (season 20: 34 / 117 / 232), above it the league
   collapsed (season 20: 0 / 0 / 11). Nothing in between, because every prospect
   was either a full developer or a total stall.

A continuous version got closest — season 10 at 12.8 / 40.2 / 130.2 against a
target of 14 / 44 / 82 — but season 20 still drained the top to 1 player at 90+,
and the growth-ceiling parameter stopped changing the outcome at all, which
means the interaction is not yet understood. Shipping a number that cannot be
justified into the model that governs every season of every save is worse than
shipping nothing, so this half is left undone.

What the attempts do establish: the inflation is **not** primarily about how
fast prospects grow. It is that draft classes arrive with a mean potential near
83 into a league with a median of 71, so intake is better than the population
every single year. The fix probably belongs in the draft's potential curve, or
in a ceiling that is itself uncertain, rather than in the growth rate.

---

## Recommendation

Two changes, in order:

1. **Let prospects bust.** Allow growth of 0 or negative for young players, with the probability of realising potential falling as the gap widens. That alone removes the inflation engine, because it breaks the guarantee that every class delivers thirty 80+ players.
2. **Scale decline by quality.** Make the drop proportional rather than absolute so elite players age like elite athletes, and the league can still contain a 37-year-old star.

Then **replace the median-based invariant with tail-based ones**: assert the count at 85+ and 90+ stays within a realistic band across twenty seasons, in both directions. The current test cannot fail on either defect found here.

---

## Reproducing

```
npx tsx scripts/development-audit.ts
```

---

# RE-AUDIT — 2026-08-15

The file above records **D-P0-1 as open after three attempts** and D-P0-2 as
fixed with a large residual (80+ at 141 against a real 82). Both statements
predate the `RELIABILITY_AT_LOW_POTENTIAL` / `RELIABILITY_AT_HIGH_POTENTIAL`
change — which is exactly the lever the text above asks a future attempt to
find, "making scouting *more* reliable for genuine top prospects than for
mid-round ones."

That lever shipped. Nothing had measured it. `scripts/development-audit.ts`
runs the full multi-season league — develop, age, retire, draft, repeat — which
is the measurement this system has always needed and never had.

## What is actually true now

| Season | Players | 90+ | 85+ | 80+ | Median |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 450 | 14 | 46 | 90 | 71.0 |
| 1 | 450 | 10 | 40 | 77 | 71.0 |
| 5 | 450 | 8 | 27 | 77 | 72.0 |
| 10 | 450 | 12 | 37 | 95 | 73.0 |
| 15 | 450 | 16 | 51 | 110 | 74.0 |
| 20 | 450 | **11** | **48** | **124** | 75.0 |
| **real** | — | **14** | **44** | **82** | — |

Against the numbers recorded above, this is a large improvement:

| Band | Original | After D-P0-2 fix | **Now** | Real |
| --- | ---: | ---: | ---: | ---: |
| 90+ at season 20 | 34.1 | 12.8 | **11** | 14 |
| 85+ at season 20 | 103.9 | 53.2 | **48** | 44 |
| 80+ at season 20 | 232.1 | 141.4 | **124** | 82 |

**The star population is correct and stable** — 90+ holds between 8 and 16
across two decades where it used to reach 34. **85+ is essentially right** at 48
against 44, where the previous pass left it at 53. The residual is 80+, still
+42 over real, and the median drifts 71 → 75.

## D-P0-1 is half fixed, and the half that remains is precisely locatable

The claim above is a 0% bust rate at *every* slot. That is no longer true:

| Pick | Mean peak | Reached 80+ | Busted (<70) | Hit ceiling |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 89.5 | **97.0%** | **0.0%** | 31.6% |
| 5 | 84.1 | 81.0% | **0.0%** | 51.8% |
| 10 | 80.4 | 56.6% | 0.5% | 60.3% |
| 20 | 76.5 | 26.4% | 5.6% | 60.0% |
| 30 | 73.1 | 7.0% | 21.0% | 62.0% |
| 45 | 69.8 | 0.1% | 50.3% | 59.7% |
| 60 | 67.0 | 0.0% | 77.4% | 63.9% |

The middle and late draft now bust convincingly — a pick-30 prospect fails one
time in five, a pick-45 half the time. That is new, and it is what fixed the
85+ band.

**But the top of the draft cannot fail.** A number-one pick reaches 80+ **97%
of the time** and busts **never**. Real number-one picks bust regularly; the
league has Anthony Bennett and Markelle Fultz in living memory.

## Why — and why it is structural rather than incidental

`RELIABILITY_AT_HIGH_POTENTIAL = 0.85` sets the *floor* on how much of his
scouted potential an elite prospect realises. For a 97-potential prospect:

```
ceiling = 60 + (97 - 60) x realization,  realization ∈ [0.85, 1.0]
        = 91.5 .. 97
```

His floor is a 91 ceiling. He is guaranteed stardom by construction — not
because growth cannot fail, but because the ceiling is bounded so high there is
nothing left to fail *at*. **The reliability lever fixed the middle of the draft
by making the top deterministic.**

That is the honest reading of the trade the previous pass made, now visible
because the two ends can finally be measured separately.

## The remaining defect, stated precisely

Each class yields **13.6 future 80+ players against a real 5-8** — roughly
double. Combined with `docs/DRAFT_AUDIT.md` D-P2-1 (42.8% of prospects carry
80+ ceilings against a league at 28.2%), the picture is consistent: too many
prospects arrive with high scouted potential, and the ones who do are too
certain to reach it.

That is a two-system problem, which is why neither audit could close it alone.

## Findings

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **D-P1-2** | P1 | MODEL | Top-of-draft prospects cannot bust. Pick 1 reaches 80+ 97% of the time with a 0% bust rate, because `RELIABILITY_AT_HIGH_POTENTIAL = 0.85` floors an elite prospect's ceiling at 91. The middle of the draft now busts correctly, so this is localised rather than systemic. |
| **D-P2-2** | P2 | LONG-SAVE DRIFT | 80+ settles at 124 against a real 82 and the median drifts 71 → 75 over twenty seasons. Stable rather than compounding, and both far better than the 232 / 141 previously recorded. |

**D-P0-1 is downgraded to D-P1-2 and D-P0-2 to D-P2-2.** Neither is a P0 any
longer: the league no longer inflates without bound, and prospects do fail.

## Scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| Star population stability | **9** | 90+ holds 8-16 across twenty seasons against a real 14, where it once reached 34. |
| Decline modelling | **9** | D-P1-1's elite damping holds; a 37-year-old star is possible, as the seeded league requires. |
| Bust realism, picks 10-60 | **8** | 0.5% → 77% bust rate across the range, monotone and plausibly shaped. |
| **Bust realism, picks 1-9** | **3** | 0% bust, 97% reach 80+. Guaranteed by the ceiling floor rather than earned. |
| Long-save distribution | **6** | 80+ at 124 against 82; stable, not compounding, but wrong. |

**Weighted overall: 7.0**, against the 4-5 the original audit implies. The
system was substantially repaired by a change nobody had measured.

## Recommendation

**Do not tune `RELIABILITY_AT_HIGH_POTENTIAL` blindly.** The file above records
three failed attempts, and its own warning stands: every previous lever moved
all bands together, and shipping a number that cannot be justified into the
model governing every season of every save is worse than shipping nothing.

What is different now is that the defect is *localised*. The middle of the
draft is correct and must not move; only the top needs to become uncertain. A
lever that reaches only elite prospects — a small probability of a genuine miss
applied to high-report players, rather than a lower floor for all of them —
would leave the working bands untouched. That is a targeted change with a
measurable target (pick 1 busting somewhere near 10-15%, class yield falling
from 13.6 toward 8) and a harness that can now see both.

**The 80+ residual should be attacked from the draft side, not here.** If 42.8%
of prospects carry 80+ ceilings against a league at 28.2%, no realisation rate
fixes that without breaking the top. That is `docs/DRAFT_AUDIT.md` D-P2-1, and
it now has a measurement path it did not have when it was filed.

## Reproducing

```
npx tsx scripts/development-audit.ts
```
