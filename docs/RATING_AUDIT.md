# Seed Rating Audit

**Opened** 2026-08-12, after `docs/CONTRACT_AUDIT.md` traced two "wrong salary" reports back to the rating rather than the pricing. Neemias Queta is rated **79** — the 83rd-best player of 537, top 15% — which makes a top-50-veteran salary the _correct_ output of a correct pricing model. The contract work fixed pricing; it could not fix the input.

**Method.** `scripts/rating-audit.ts`, read-only, over the committed 537-player dataset.

**The yardstick is real NBA salary**, which the dataset now carries after `scripts/import-contracts.ts`. Salary is not quality — the rookie scale, buyouts and contract timing all interfere — but a veteran's market price is an independent, costly, public judgement about how good he is, and it beats anyone's opinion about who is a 79. Every claim below is measured against it rather than asserted.

---

## RESOLUTION — R-P0-1 fixed 2026-08-12

`REGRESSION_TARGET` is no longer a constant. Where a veteran has a real
contract, the regression pulls him toward the rating his **market price**
implies (`seedPriorFromSalary`) rather than toward a flat 67. Rookie-scale
money is set by rule rather than by the market, so those players keep the flat
baseline, as do two-way players and generated prospects — anyone the market has
not priced.

The salary→rating table is measured, not chosen: median rating by salary band
across the 126 full-season veterans on real contracts, i.e. exactly the players
this model already rates correctly. Two adjacent bands inverted on small samples
(n=11, n=19) and were pooled — the standard isotonic fix for a relationship
known to be monotone.

Ratings are re-derived in `scripts/import-contracts.ts` rather than in the
roster build, because the roster build has no contracts to read. That also keeps
the free roster/stats refresh independent of the paid contract one.

### Measured

|                                  | Before | After     |
| -------------------------------- | ------ | --------- |
| Paid 20%+ of cap, rated under 80 | 13     | **6**     |
| …of those, short-season          | 9      | **2**     |
| corr(rating, real salary)        | 0.760  | **0.800** |
| mean pay-vs-rating rank drift    | 33.4   | **30.9**  |
| Tatum, model rating              | 74     | **88**    |
| Worst override rescue            | +19    | **+6**    |

| Player           | GP  | Before | After  | Real pay |
| ---------------- | --- | ------ | ------ | -------- |
| Anthony Davis    | 20  | 76     | **87** | $54.1M   |
| Trae Young       | 15  | 72     | **85** | $46.4M   |
| Domantas Sabonis | 19  | 74     | **84** | $42.3M   |
| Ja Morant        | 20  | 73     | **82** | $39.4M   |

The six that remain are the confidence-1.00 rows this audit already identified
as _correct_ — Middleton, Suggs, Holiday, Grant are genuinely declining or
overpaid, and the model is right about them.

**The distribution did not inflate**, which was the risk in raising 95 ratings:
95+ held at 5, 90+ at 14, 85+ moved 44 → 46, mean 70.4 → 70.7.

### What this did not fix

**Queta is still 79.** He played 76 games, so there is no regression to
re-target and the prior carries no weight. His rating was never R-P0-1 — it is
R-P1-1, the positional bias, which remains open. His _contract_ is now his real
$2.3M, so year one reads correctly regardless; the rating still overstates him
to trade value, rotation and re-signing.

R-P1-1 and R-P2-1 are untouched.

---

## The model

`src/lib/data-sources/seedRating.ts` is a considered piece of work, and most of it holds up:

```
raw       = 74 + production + role + efficiency        (compressed above 89)
production= per-game deltas from an average-starter baseline
role      = (minutes - 24) x 0.45
efficiency= clamp((TS - 0.57) x 42, -7, +7)
confidence= min(1, games/42) x (0.6 + 0.4 x min(1, minutes/22))
rating    = confidence x raw + (1 - confidence) x 67
```

Its distribution is right. 5 players at 95+, 14 at 90+, 44 at 85+ — essentially 2K's shape. **The shape is not the problem; the assignment is.**

---

## R-P0-1 — The regression has no prior, and it destroys injured stars

`REGRESSION_TARGET = 67` is a constant. Every unproven line is pulled toward it regardless of who the player is. That is right for a rookie who has never played and badly wrong for a five-year All-NBA player who missed half a season — the model cannot tell them apart, because it has no memory of either.

**The sharp test.** A club paying 20%+ of the cap has made a costly, public judgement. Rating that player under 80 contradicts it — and buyouts and stretch waivers only ever move salary _down_, so this direction carries no confound.

**13 players paid 20%+ of the cap are rated under 80. Nine played fewer than 45 games.**

| Player               | GP  | Confidence | Raw  | Rating | Real pay |
| -------------------- | --- | ---------- | ---- | ------ | -------- |
| **Anthony Davis**    | 20  | 0.48       | 85.2 | **76** | $54.1M   |
| Paul George          | 37  | 0.88       | 81.1 | 79     | $51.7M   |
| Zach LaVine          | 39  | 0.93       | 80.0 | 79     | $47.5M   |
| **Trae Young**       | 15  | 0.36       | 80.6 | **72** | $46.4M   |
| **Domantas Sabonis** | 19  | 0.45       | 81.7 | **74** | $42.3M   |
| **Ja Morant**        | 20  | 0.48       | 79.3 | **73** | $39.4M   |
| Franz Wagner         | 34  | 0.81       | 81.9 | 79     | $38.7M   |
| Khris Middleton      | 63  | 1.00       | 67.9 | 68     | $35.1M   |
| Jalen Suggs          | 57  | 1.00       | 77.9 | 78     | $35.0M   |
| Jalen Green          | 32  | 0.76       | 73.6 | 72     | $33.6M   |
| Jrue Holiday         | 53  | 1.00       | 79.4 | 79     | $32.4M   |
| Jerami Grant         | 57  | 1.00       | 79.2 | 79     | $32.0M   |
| Jordan Poole         | 39  | 0.93       | 69.8 | 70     | $31.8M   |

For the nine short-season cases, **trusting the raw score would give a mean rating of 79.2 instead of 74.9.** Anthony Davis — a max contract — is rated 76, a rotation player. The regression, not the production model, put him there: his raw score is 85.2.

Note the rows with confidence 1.00 (Middleton, Suggs, Holiday, Grant, Poole). Those are _not_ errors — they are genuinely declining or overpaid players, and the model is right about them. The defect is specific to short samples.

### The override layer is a symptom, not a fix

`ratingOverrides.json` holds 15 hand-written ratings. Its own comment says they are "mostly stars the small-sample regression pulls down after an injury-shortened season" — an accurate description of R-P0-1, patched one player at a time.

| Player                  | GP  | Model | Shipped | Rescue  |
| ----------------------- | --- | ----- | ------- | ------- |
| **Jayson Tatum**        | 16  | 74    | 93      | **+19** |
| Giannis Antetokounmpo   | 36  | 87    | 96      | +9      |
| LeBron James            | 63  | 86    | 92      | +6      |
| Victor Wembanyama       | 67  | 90    | 95      | +5      |
| Shai Gilgeous-Alexander | 68  | 93    | 98      | +5      |
| Stephen Curry           | 43  | 88    | 93      | +5      |
| Anthony Edwards         | 64  | 89    | 93      | +4      |
| Kevin Durant            | 81  | 89    | 92      | +3      |
| Joel Embiid             | 38  | 87    | 90      | +3      |
| Nikola Jokić            | 66  | 95    | 98      | +3      |
| Tyrese Haliburton       | 73  | 89    | 90      | +1      |
| Kawhi Leonard           | 68  | 90    | 91      | +1      |
| Luka Dončić             | 65  | 94    | 95      | +1      |
| Tyrese Maxey            | 73  | 91    | 89      | −2      |
| Damian Lillard          | 61  | 90    | 88      | −2      |

Mean rescue **+4.1**, worst **+19**. Tatum's model rating is 74 — the model, unaided, thinks a franchise wing is a rotation player.

**And the list is incomplete.** Anthony Davis, Trae Young, Domantas Sabonis and Ja Morant all have the same failure and none is overridden. A hand-maintained list of exceptions will always lag, because nothing tells the maintainer who is missing.

**The dataset now carries the thing that could tell them.** Real salary is an exogenous prior — it is imported, not generated, so using it to set the regression target introduces no circularity. Regressing an unproven player toward _what the market pays him_ rather than toward a constant 67 fixes all nine cases automatically and shrinks the override list to genuine editorial disagreements.

---

## R-P1-1 — Positional bias, confirmed against the market

Measured as the gap between a player's rating rank and his pay rank among 213 veterans on real contracts. Positive = rated better than the market pays.

| Pos   | N   | Mean rating | Mean real pay | Rank drift |
| ----- | --- | ----------- | ------------- | ---------- |
| PG    | 54  | 74.7        | $18.3M        | **+6.9**   |
| SG    | 40  | 76.6        | $21.5M        | +2.7       |
| SF    | 50  | 74.0        | $20.6M        | **−10.7**  |
| PF    | 30  | 74.6        | $22.2M        | **−10.9**  |
| **C** | 39  | 74.4        | $16.9M        | **+9.8**   |

**Centres are rated ~10 rank places above what the league pays them; forwards ~11 below.** The model rewards rebounds (0.5/each) and blocks (1.5/each), which are structurally available to bigs, and has no term for the wing skills — shot creation, spacing, perimeter defence — that the market pays for. This is the same tilt `docs/CONTRACT_AUDIT.md` found in the valuation model (C-P1-1), in the _other_ rating system, from the same cause.

---

## R-P1-1 RESOLVED — it was never a rating defect

The section above could not tell a mis-measuring model from a league that values
positions differently. A within-position test settles it: correlation between
rating and real salary is **0.776 (PG), 0.732 (SG), 0.816 (SF), 0.877 (PF),
0.850 (C)** against 0.800 across all positions. The two positions supposedly
biased rank _best of the five_. The model measures quality correctly.

What differs is what the league pays. Controlling for rating, a centre earns
**0.89x** what his rating predicts and a small forward **1.15x** — a pricing
fact, not a measurement error, and correcting the rating would have baked a
market reality into a quality model.

So the correction went into `priceContractCents` as `POSITIONAL_MARKET_FACTOR`,
normalized so league payroll is unchanged — it moves money between positions
rather than creating any. Measured against real pay by position, the mean
absolute error falls **10.3% → 5.8%**; centres go from 19% overpriced to 7%,
point guards 16% to 7%, small forwards 8% underpriced to 3% over.

Ratings stay an honest claim about quality. Prices reflect what a position
commands. That is how the two come apart in reality.

---

## R-P2-1 — The shipped dataset has drifted from the model

**34 players** have a `seedOverallRating` that no longer matches what `computeSeedOverallRating` produces from their own stat line — all off by exactly one point, all fringe players (Keshon Gilbert, Tristen Newton, Norchad Omier, Sean Pedulla, Chris Manon…), all shipped 66 against a recomputed 67.

Harmless in effect, but it means the committed dataset is not reproducible from the committed code. A constant moved after the dataset was built and nothing caught it. Worth a test that recomputes the dataset and asserts it matches.

---

## Disproved: efficiency is not the problem

I expected the efficiency term to be the culprit, because `(TS − 0.57) × 42` is not weighted by scoring volume — the exact defect `computePerformanceScore` had before commit `decd646`, where a rim-runner's true-shooting was credited as heavily as a first option's.

**Measured, it is not:**

| Scoring     | N   | Mean TS | Mean efficiency points |
| ----------- | --- | ------- | ---------------------- |
| under 6 ppg | 192 | 0.556   | **−0.54**              |
| 6–10 ppg    | 134 | 0.577   | +0.28                  |
| 10–15 ppg   | 107 | 0.588   | +0.76                  |
| 15–20 ppg   | 57  | 0.585   | +0.61                  |
| 20+ ppg     | 47  | 0.599   | +1.20                  |

The ±7 clamp bounds it, and low-volume players do not have systematically higher true shooting. Efficiency contributes _more_ to high scorers than low ones — the opposite of the failure mode. Queta's +4.4 is an individual case, not a systematic bias, and retuning this term would move 500 players to fix one.

---

## What is already right — do not change

- **The rating distribution.** 5/14/44 at 95+/90+/85+ matches 2K almost exactly.
- **The production weights and the average-starter anchor.** Players with a full season are rated sensibly; every confidence-1.00 row in the R-P0-1 table is a correct rating.
- **Top-end compression** (`KNEE`/`ABOVE_KNEE_SCALE`). 99 is genuinely rare, which was the stated goal.
- **Efficiency weighting.** Measured above; leave it.
- **Separation from the valuation model.** The docstring's reasoning holds: a seed model that runs once and a gameplay model that runs continuously should not share a calibration.

---

## Findings

| ID         | Severity | Type  | Finding                                                                                                                                                                                                                              |
| ---------- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-P0-1** | P0       | MODEL | Regression toward a fixed 67 with no prior. 13 players paid 20%+ of cap rated under 80; 9 are short-season. Tatum's model rating is 74. The 15-entry override list patches this by hand and misses Davis, Young, Sabonis and Morant. |
| **R-P1-1** | P1       | MODEL | Positional bias. Centres +9.8 rank places above market, forwards −10.7/−10.9 below. No term rewards wing skills.                                                                                                                     |
| **R-P2-1** | P2       | DATA  | 34 shipped ratings no longer reproduce from the committed model, all off by one.                                                                                                                                                     |

`corr(rating, real salary)` among veterans is **0.760**; mean rank drift **33.4 of 213**.

---

## Recommendation

**One change fixes R-P0-1 and shrinks the override list**: make the regression target a prior rather than a constant. Where the dataset carries a real contract, regress an unproven player toward the rating his salary implies; fall back to 67 where it does not. That is exogenous data — imported, never generated — so it cannot feed back into itself.

Expected effect, measured: the nine short-season cases move from a mean rating of 74.9 to ~79, Anthony Davis from 76 toward his raw 85, and the override list stops carrying cases the model should get right on its own.

**R-P1-1 is the harder one** and is shared with the valuation model. It needs a term for what wings do, which the box score does not directly record — the same limitation `docs/SYSTEMS.md` already documents about running on raw box-score stats.

**R-P2-1 is a test**, not a fix: recompute the dataset from the model and assert it matches.

---

## Reproducing

```
npx tsx scripts/rating-audit.ts
```
