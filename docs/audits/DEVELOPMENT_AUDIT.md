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

Rating drives `computeReSigningMaxOfferCents`, so **rating inflation is payroll inflation**. A player at 80 prices near 17.5% of the cap. With 194 players at 80+ by season 10 — against 82 today — CPU re-signing costs rise across the league with no corresponding revenue, on top of `docs/audits/CONTRACT_AUDIT.md` C-P1-2, which already lets a declined star be signed at his frozen 2025-26 price.

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
double. Combined with `docs/audits/DRAFT_AUDIT.md` D-P2-1 (42.8% of prospects carry
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
fixes that without breaking the top. That is `docs/audits/DRAFT_AUDIT.md` D-P2-1, and
it now has a measurement path it did not have when it was filed.

## Reproducing

```
npx tsx scripts/development-audit.ts
```

---

## Attempt 4 at D-P1-2 — a scouting miss band. Failed, and usefully.

Recorded in the same spirit as attempts 1-3 above, so attempt 5 does not
repeat it.

**The idea.** Reliability scaling fixed the middle of the draft by making the
top deterministic, so add a separate mechanism reaching only elite prospects: a
slice of players whose report is simply *wrong*, landing below its floor
entirely. A miss band only bites where the floor is high — the top of the draft
— because a low-report prospect already sits near the missed-report value.
Implemented as `SCOUTING_MISS_RATE` / `MISSED_REPORT_REALIZATION` /
`MISSED_REPORT_CEILING` in `developPlayerRating.ts`.

**The method, which is the part worth keeping.**
`scripts/development-calibration.ts` sweeps against five constraints at once —
pick-1 bust rate, class yield, and the 90+/85+/80+ populations as guardrails —
with every candidate averaged over **five** twenty-season runs. A single run
swings 85+ by about five, which is larger than the gap between adjacent
candidates; the first two sweeps ran on one seed each and were fitting noise,
producing 85+ readings of 33, 39, 33 across three consecutive steps.

It also calls the shipped `developPlayerRating` through a `scoutingMissRate`
seam rather than reimplementing it, so the sweep cannot measure something the
game does not do.

**The result.** A genuine interior optimum at 0.40 — not a boundary artefact,
which the first two sweeps did produce:

| Miss rate | Pick-1 bust | Class yield | 90+ | 85+ | 80+ |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.00 | 0.1% | 13.9 | 13.0 | 47.0 | 110.0 |
| 0.12 | 3.5% | 12.3 | 12.8 | 39.2 | 99.0 |
| 0.24 | 7.9% | 10.6 | 10.4 | 37.6 | 86.4 |
| **0.40** | **12.9%** | **8.4** | **8.4** | **32.2** | **74.2** |
| 0.60 | 20.0% | 5.8 | 7.0 | 20.6 | 49.4 |
| **target** | **10-15%** | **5-8** | **14** | **44** | **82** |

Every prospect-level target lands at 0.40. Both guardrails break: the star
population falls from 13.0 to 8.4 and 85+ from 47 to 32.

**Why, and this is the finding rather than the failure.** In this model the
league's stars come almost entirely from the draft, so *"top picks can fail"*
and *"the league has stars"* are the same knob. No miss rate separates them,
because the prospects a miss band removes are the identical population that
becomes the 90+ tier six years later. Attempts 1-3 each concluded "every lever
moves all bands together"; this one shows why, rather than just observing it
again.

**Shipped at zero.** `SCOUTING_MISS_RATE = 0`, which reproduces the previous
league exactly (11 / 48 / 124, verified). The mechanism is left in place rather
than deleted so the harness keeps measuring the shipped function and attempt 5
inherits a working sweep. No behaviour changed.

**Where attempt 5 should look: not here.** `docs/audits/DRAFT_AUDIT.md` D-P2-1 —
classes carry 80+ ceilings at 42.8% against a league at 28.2%. Fewer
high-potential prospects, with the survivors hitting harder, is the only shape
that can deliver busts and stars simultaneously. That is a draft-generation
change, and it now has a measurement path across both systems.

---

## Attempt 5 at D-P1-2 — a steeper draft-class potential curve. Also failed.

Attempt 4 concluded the fix belonged in draft generation rather than
development. It does not. Recording that here, with the measurement, because it
is the attempt the previous entry explicitly recommends.

**The idea.** `docs/audits/DRAFT_AUDIT.md` D-P2-1: classes carry 80+ ceilings at 42.8%
against a league at 28.2%. A steeper `POTENTIAL_FALLOFF_EXPONENT` leaves genuine
star ceilings at the very top of a class and a long tail behind them, which is
what a real draft looks like. `scripts/draft-class-calibration.ts` sweeps it
through the real `generateDraftClass`, against the same five constraints and
the same five-seed averaging.

**The result.** Again a genuine interior optimum, at 0.35. Again it fixes the
band it aims at and drains the two above it:

| Exponent | Class yield | 90+ | 85+ | 80+ |
| ---: | ---: | ---: | ---: | ---: |
| 0.25 | 5.5 | 4.6 | 14.6 | 46.4 |
| **0.35** | **8.9** | **7.4** | **28.0** | **73.4** |
| 0.45 | 12.4 | 11.6 | 40.6 | 98.0 |
| **0.50 (shipped)** | 13.9 | **13.0** | **47.0** | 110.0 |
| 0.60 | 16.7 | 18.0 | 60.4 | 133.8 |
| **target** | **5-8** | **14** | **44** | **82** |

Every row moves together. There is no exponent at which 80+ approaches 82 while
90+ stays near 14.

**The sharpened diagnosis, which is what these two attempts actually bought.**
The problem was never *which system* holds the lever. It is that the simulated
league's shape is wrong, not its scale:

| | 80+ : 90+ ratio |
| --- | ---: |
| shipped (exponent 0.50) | 8.5 : 1 |
| attempt 5 best (0.35) | 9.9 : 1 |
| **real NBA** | **5.9 : 1** |

Every lever tried across five attempts — growth rate, bust split, ceiling
realisation, scouting reliability, a miss band, and now the intake curve — is a
**scale** parameter. Scaling a distribution cannot change its ratio, and the
ratio is what is wrong. Steepening the intake curve actually makes it *worse*,
because it thins the 85-95 potential band that feeds the star tier faster than
it thins the 80-85 band below it.

**What attempt 6 needs.** Not another single constant. A lever that moves the
top and the tail of the potential curve **independently** — plausibly fitting
`POTENTIAL_AT_PICK_1` and `POTENTIAL_AT_PICK_60` together with the exponent, a
three-parameter fit against the ratio rather than the counts. Nothing in five
attempts has tried a multi-parameter fit, and the evidence now says a
single-parameter one cannot work in either system.

**Shipped unchanged.** `POTENTIAL_FALLOFF_EXPONENT` stays at 0.50. Only the
calibration seam was added, so no behaviour changed; `docs/audits/DRAFT_AUDIT.md`'s
8.03x pick-value anchor is unaffected and was re-verified.


---

## Attempt 6 — bending the reliability ramp. **The first partial success.**

Attempts 1-5 all moved the ramp's **endpoints**, or bolted a miss band onto it,
or steepened the intake curve. Every one moved the 80+, 85+ and 90+ populations
together, and attempt 5's diagnosis was that the league's *shape* is wrong
rather than its scale — 80+:90+ at 8.5:1 against a real 5.9:1 — so no scale
parameter can help.

**Attempt 6 bends the ramp instead of moving it.** `RELIABILITY_CURVE_EXPONENT`
raises `reportQuality` to a power before interpolating reliability, making the
curve convex: a mid-first-round report stays nearly as unreliable as a late one,
while a genuine consensus top prospect keeps his confidence.

### Why this one could work when five could not

The structural ratio was already right, which nobody had checked. Of 60 picks,
**25 can reach 80+ and 5 can reach 90+ — a 5.0:1 ratio against the real 5.9:1.**
The draft curve was never the problem. The gap was *realisation*: prospects who
could reach 90 mostly did not, while those who could reach 80 mostly did.

That is a statement about the ramp's shape, and it is the one thing no attempt
had touched.

### Result, averaged over fifteen twenty-season runs

| Exponent | 90+ | 85+ | 80+ | Ratio | Total abs error |
| ---: | ---: | ---: | ---: | ---: | ---: |
| **1.00** (was) | 13.2 | **46.7** | **109.3** | 8.3:1 | **30.8** |
| **2.25** (now) | **12.9** | 39.4 | **94.3** | **7.3:1** | **18.0** |
| target | 14 | 44 | 82 | 5.9:1 | — |

**80+ falls by 15 while 90+ holds.** That is the independent movement five
attempts could not produce. Total absolute error against the three targets
nearly halves.

The effect on the ceiling band shows the mechanism directly:

| Scouted potential | Ceiling before | Ceiling after |
| ---: | --- | --- |
| 97 | 91-97 | **91-97** *(untouched)* |
| 91 | 83-91 | 80-91 |
| 85 | 76-85 | **72-85** |
| 75 | 67-75 | 65-75 |

### What it does not fix, stated plainly

**D-P1-2 is untouched.** A number-one pick still busts **1.1%** of the time
against a real 10-15%. Attempt 4 established why — the prospects a bust
mechanism removes are the same population that becomes the 90+ tier — and
bending the ramp does not change that, because it deliberately leaves the top
report alone.

**85+ is now wrong in the other direction**, 39.4 against a target of 44, where
it had been 46.7. This buys the 80+ band by overshooting the 85+ one. It ships
because total error nearly halves, not because it is right.

### Rescored

| Dimension | Was | Now | Why |
| --- | ---: | ---: | --- |
| Long-save distribution | **6** | **7** | 80+ at 94 against 82, down from 110; 90+ correct and stable. Still overshoots, and 85+ now undershoots. |
| **Bust realism, picks 1-9** | **3** | **3** | Unchanged. Pick 1 busts 1.1%. |


---

## Attempt 7 — **D-P1-2 is fixed.**

Six attempts failed because each moved one parameter. Attempt 4 established the
coupling exactly: *"in this model the league's stars come almost entirely from
the draft, so top picks can fail and the league has stars are the same knob."*

**That is only true while a class contains one star-ceiling prospect.** The
curve gave pick 1 a 97 ceiling, pick 2 a 93.5 and pick 3 a 92 — so the 90+ tier
was fed by essentially one player a year, and any mechanism that failed him
drained it. Real classes have a consensus top tier of two to four.

So attempt 7 changes two things that only work together:

- **`TOP_TIER_PICKS = 3`** — the first four picks share the 97 ceiling, giving a
  class several star candidates instead of one.
- **`SCOUTING_MISS_RATE = 0.35`** — the attempt-4 miss band, re-enabled. It can
  now fail some of those candidates because others remain.

Neither works alone. The miss band alone is attempt 4, which drained the stars.
The plateau alone floods the league with 80+ players. Fitted together with
`RELIABILITY_CURVE_EXPONENT` in `scripts/top-tier-calibration.ts`.

### Result

| | Before (attempt 6) | **After** | Real |
| --- | ---: | ---: | ---: |
| **Pick 1 reaches 80+** | **97.0%** | **63.8%** | ~60-70% |
| Pick 1 bust rate (<75) | 1.1% | **11.9%** | 10-15% |
| Pick 5 reaches 80+ | 81.0% | 57.4% | — |
| Pick 20 bust rate (<70) | 5.6% | 22.2% | — |
| 90+ players, season 20 | 12.9 | **15** | 14 |
| 85+ players, season 20 | 39.4 | 39 | 44 |
| 80+ players, season 20 | 94.3 | **91** | 82 |
| Class yield (future 80+) | 11.4 | **9.0** | 5-8 |

**A number-one pick now fails to become a good player about a third of the
time**, and the star population is intact — 15 against a real 14.

### Choosing 3 over the objective's pick of 2

The sweep's lowest error was `TOP_TIER_PICKS = 2`, and it was not taken. On the
three population counts — what a player actually experiences — 3 is clearly
better:

| | 90+ | 85+ | 80+ | Σ abs error |
| --- | ---: | ---: | ---: | ---: |
| tier 2 | 13.3 | 34.6 | 75.8 | **16.3** |
| **tier 3** | 15.7 | 38.7 | **82.3** | **7.3** |

The objective preferred 2 only on class yield, which is above the real range in
both cases and is a mechanism measure rather than an outcome. Recorded because
overriding an objective function needs a stated reason, not a preference.

### Still imperfect

85+ sits at 39 against 44, and class yield at 9.0 against a real 5-8. Both are
closer than they have ever been, and neither compounds.

### Rescored

| Dimension | Was | Now | Why |
| --- | ---: | ---: | --- |
| **Bust realism, picks 1-9** | **3** | **8** | Pick 1 reaches 80+ 63.8% against a real 60-70%, bust rate 11.9% against 10-15%. |
| Long-save distribution | 7 | **7** | 80+ at 91 against 82; 90+ correct. Unchanged. |

**Nothing in the simulator now scores below 7.**

---

# D-P2-1, reframed a second time — and one of its two halves was a bad benchmark

The residual was carried as a contradiction: the league holds **39** players at
85+ against a real **44**, while a draft class yields **9.0** future stars
against a real **5-8**. More stars produced, fewer stars present. Nothing could
be tuned without pushing the other number further out.

There was no contradiction. **The two figures measure different tiers** — the
class-yield line counts 80+, the stock line counts 85+ — so they were never in
tension and the framing was wrong.

## Measuring all three tiers against one identity

`stock = yield x duration` has to hold at every tier at once.
`scripts/elite-career-length.ts` measures stock, arrivals and duration together
over 25 seasons x 5 seeds, and a per-class distribution run supplies the yields:

| Tier | Realized per class | Real stock | Duration that implies | Verdict |
| --- | --- | --- | --- | --- |
| 80+ | 8.90 | 82 | 9.2 seasons | consistent |
| 85+ | 4.50 | 44 | 9.8 seasons, vs 8.0 measured | **low** |
| 90+ | 2.04 | 14 | 6.9 seasons | consistent |

Measured directly, elite duration is **8.0 seasons** (real 6-8) and mean age at
85+ is **28.6** — both in range. Retirement was ruled out first by inspection:
`retirementProbability` applies no rating penalty above 72, so an 85-rated
player faces only the age term.

## The "5-8" reference was wrong, and it was the louder half of the finding

`REAL_80_PLUS` is 82 players held at 80+, and that tier is held for roughly nine
seasons, so a steady state requires about **82/9 = 9.1** arrivals a year. The
simulator produces **9.0**. A class yielding 5-8 would drain the league.

That reference had been written independently of the stock figures the same
script checks against. It is now derived from them. **The 80+ half of D-P2-1 was
never a defect** — it was the benchmark disagreeing with its own file.

## What actually remains

One tier, modestly thin: 85+ stock measures **34.8** against a real **44**, and
realized 85+ per class is **4.50** where a stock of 44 wants about 5.5.

The cause is structural rather than a loose constant. Growth is bounded by
`ceiling = MIN_RATING + (potentialRating - MIN_RATING) x realization`, where
realization is `reportQuality ^ 2.25` and is always below 1 — potential is a
*scout's report*, not an attainable truth, which is a deliberate and defensible
design. The consequence is that the shortfall in absolute points widens as
potential rises, thinning the band just under the top. Per class there are
15.43 prospects with 85+ potential and 4.50 realize it, a 29% rate.

**No change was made, and a fix here is narrower than it looks.** The 80+ and
90+ tiers are both correct, so any adjustment must add mass specifically in
85-89 without disturbing either — and the three constants that would do it
(`SCOUTING_MISS_RATE`, `MISSED_REPORT_REALIZATION`, `RELIABILITY_CURVE_EXPONENT`)
are the same ones holding D-P1-2's pick-one bust rate at its fitted 63.8%.
Moving them trades one calibrated target for another, so this needs a joint
sweep against four targets at once, not a nudge.

| ID | Severity | Outcome |
| --- | --- | --- |
| D-P2-1 (80+ half) | — | **Withdrawn.** The 5-8 benchmark contradicted this file's own stock figures; 9.0 against a needed 9.1 is correct. Reference corrected in the script. |
| D-P2-1 (85+ half) | P2 | **Open, quantified.** 34.8 stock vs 44; needs a four-target joint sweep, not a single constant. |

## The 85+ sweep — four candidates fitted, all rejected on direct measurement

`scripts/elite-tail-calibration.ts` sweeps the two calibration seams
`developPlayerRating` exposes — `reliabilityExponent` and `scoutingMissRate` —
over a 6x5 grid, 120 classes x 3 seeds per point, against four targets at once.

`reliabilityExponent` was the shaped knob and the reasoning was sound as far as
it went: realization runs off `reportQuality ^ k` with `reportQuality` in [0,1],
so lowering `k` lifts the middle of the potential range while leaving
`reportQuality = 1` untouched. That is the exact shape 85-89 needs.

**Four candidates satisfied all four targets**, best at `exp 1.50, miss 0.35`,
interior to the grid rather than on a boundary, with pick-one holding at 63.6%
against D-P1-2's fitted 63.8%. On the sweep's own terms it was a clean
one-constant win.

It was rejected, because the targets it fitted were wrong.

| Tier | Real | Shipped (2.25) | Candidate (1.50) |
| --- | --- | --- | --- |
| 90+ | 14 | 15 (+1) | 16 (+2) |
| 85+ | 44 | 39 (-5) | **38 (-6)** |
| 80+ | 82 | 91 (+9) | **99 (+17)** |

The candidate is worse on every tier, including the one it was built to fix.

**The error was fitting a proxy.** The per-class targets (9.1 at 80+, 5.5 at
85+, 2.0 at 90+) were derived as `real stock / assumed duration`, and the
assumed durations came from the earlier reframing rather than from measurement
at each tier. Working backwards from the direct numbers instead: the shipped
build yields 9.0 per class at 80+ and holds a stock of 91, which implies a
duration of about **10.1** seasons, not the 9.2 assumed. At that duration a real
stock of 82 wants roughly **8.1** per class — so the shipped 9.0 is already
modestly high, and every candidate the sweep preferred pushed it further out.

Two harnesses also disagreed, which was the tell. `elite-career-length.ts`
reported 85+ stock rising 34.8 -> 41.2 under the candidate while
`development-audit.ts` reported it falling 39 -> 38. They maintain league
population differently — the former refills from the top of each draft class,
which over-supplies talent — so the per-class proxy and the direct stock were
never measuring the same thing.

## Status

| ID | Severity | Outcome |
| --- | --- | --- |
| D-P2-1 (85+ half) | P2 | **Open, no change.** The two exposed seams cannot add 85-89 mass without pushing 80+ further past 82; the candidates that fit the derived targets all fail the direct one. A real fix needs a knob that stretches the tail without lifting the whole distribution, which neither seam is. |

The sweep is kept in the repository. Anyone revisiting this should fit against
the **stock** numbers `development-audit.ts` reports directly, not against
per-class yields divided out by an assumed career length.
