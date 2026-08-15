# Contract & Salary System Audit

**Opened** 2026-08-12, after a playtest turned up Neemias Queta at ~$48M and Luka Garza at ~$42M while Jayson Tatum and Jaylen Brown sat in the $30M range.

**Method.** Every number below is measured, not reasoned. Two harnesses replay the shipped functions over the committed 537-player dataset:

- `scripts/contract-audit.ts` — distribution, anomalies, sensitivity sweeps, seed-space ranges
- `scripts/contract-audit-paths.ts` — path divergence, long-save drift, exploit surface

Neither touches a database. Both are reproducible.

**Headline.** The two reported salaries have **two different causes**, and only one of them is a live bug.

- **Garza's $42M is not reachable by the current code.** Sweeping all 4000 possible negotiation seeds, today's code can only produce **$10.3M–$13.9M** for him. $42M sits dead centre of what the _pre-fix_ code produced ($39.7M–$53.7M). The playtest save was bootstrapped before commit `decd646` (2026-08-11) and existing saves are never re-priced.
- **Queta's ~$48M is still reachable today** ($37.3M–$50.5M). That one is a genuine, unfixed defect.

So: start a new franchise and Garza drops to ~$12M. Queta stays broken. The rest of this document is about why.

---

## RESOLUTION — implemented 2026-08-12

All four P0s are fixed. Two of five P1s are fixed. The curve reshaping that
looked necessary partway through was **abandoned on evidence** — see the note at
the end of this section.

### What changed

| #   | Change                                                                                                | Where                                                 |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `gamesPlayed` now weights every valuation, blending an unproven season back toward the scouted rating | `contracts/priceContract.ts` — `contractQualityScore` |
| 2   | Individual maximum salary, 25/30/35% of cap by age tier, clamped last on every path                   | `cap/maxSalary.ts`                                    |
| 3   | One pricing function called by bootstrap, draft, CPU re-signing and CPU free agency                   | `contracts/priceContract.ts` — `priceContractCents`   |
| 4   | Contract length keyed to quality, then capped by age; CPU deals no longer hardcoded to two flat years | `priceContract.ts` — `pickContractLength`             |

`overallRating` is now the pricing anchor everywhere, with production as a
correction rather than the source — which closes C-P0-4 as a side effect of
C-P0-2's fix.

### Measured before → after

|                              | Before  | After       | Real     |
| ---------------------------- | ------- | ----------- | -------- |
| **Jayson Tatum**             | $35.3M  | **$46.4M**  | —        |
| **Jaylen Brown**             | $37.1M  | **$40.9M**  | —        |
| **Neemias Queta**            | $37.7M  | **$29.5M**  | —        |
| Ty Jerome (15 games)         | $51.5M  | **$18.0M**  | —        |
| Trae Young (15 games)        | $44.5M  | **$16.2M**  | —        |
| Luka Garza                   | $10.5M  | $8.9M       | —        |
| corr(salary, rating)         | 0.778   | **0.862**   | —        |
| worst anomaly                | +$40.7M | **+$13.7M** | —        |
| 70–74 band, max salary       | $51.5M  | **$24.1M**  | —        |
| 65–69 band, max salary       | $20.3M  | **$11.4M**  | —        |
| sub-70 rating on 3+ yr deals | 130     | **9**       | —        |
| age 33+ on 4–5 yr deals      | 7       | **0**       | —        |
| league payroll               | $5.13B  | **$5.104B** | $5.10B   |
| profitable clubs             | 24/30   | **25/30**   | 20–25/30 |
| league net income            | +$2.14B | **+$2.16B** | ~+$2B    |

**The ordering that opened this audit is fixed: Tatum > Brown > Queta.**

Contract length by tier now runs 1.5 / 1.6 / 2.4 / 3.0 / 3.5 / 3.9 / 3.4 from
fringe to superstar, against a near-flat 2.9–3.7 before.

### Two things this did _not_ fix, and one claim that was wrong

**Wrong claim, corrected.** An earlier pass reported "121 of 450 players paid 40+
places above their rating rank" and concluded the curve was too generous through
the middle. That metric ranked rookie-scale players against veterans, counting a
working feature as error. Measured among veterans only — the correct comparison —
mean |pay rank − rating rank| is **9.2 places** and **no player** is paid 40+
places above his rating. Queta is the 49th-best-rated veteran and the
44th-highest-paid one. His salary is internally consistent; what is high is his
_rating_.

**The top of the market is still compressed.** 1 player above $50M against a real
5; 39 above $30M against a real 30. Austin Reaves (rating 89) is paid identically
to Shai Gilgeous-Alexander (98) because both pin to the same 30% tier.

**Reshaping `scoreToCapFraction` cannot fix that**, and this was measured rather
than assumed. Sweeping MAX × MIDPOINT × STEEPNESS, every combination that brings
$50M+ to the real 5 also puts $40M+ at 36 against a real 10, $30M+ at 65 against
30, and league payroll at $6.03B. No shape of that curve produces the real band
structure, because the constraint is not the curve — it is that the dataset rates
44 players at 85+ while the real league hands out roughly 20 maximum contracts.
Bending the pricing curve to absorb that would be fitting salary to compensate
for rating inflation, and it would break the moment the ratings changed.

The curve is therefore **unchanged**, as the finance audit intended. The
compressed top is logged as C-P2-2 and belongs to the seed-rating model, not the
contract model.

---

## 1. The complete contract pipeline

Every way a player gets a contract, with the actual formula.

| #   | Path                 | Entry point                                                       | Quality input                    | Modifier stack                                                            | Length                                    |
| --- | -------------------- | ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | **League bootstrap** | `actions/league.ts:217` → `planLeaguePlayer` → `generateContract` | `computePerformanceScore(stats)` | `× ageValueMultiplier(age) × rookieScaleDiscount(exp) × noise(0.85–1.15)` | `pickContractLength`, 1–5y, +5%/yr raises |
| 2   | **Draft / rookie**   | `actions/draft.ts:154` → `generateContract`                       | `overallRating`                  | `× ageValueMultiplier(20) × 0.35 × noise`                                 | same, 1–5y                                |
| 3   | **CPU re-signing**   | `actions/offseason.ts:694` → `computeReSigningMaxOfferCents`      | `overallRating`                  | **none**                                                                  | **always 2y, flat**                       |
| 4   | **CPU free agency**  | `freeagency/cpuFreeAgentMarket.ts:180` → `runCpuFreeAgentPass`    | `computePerformanceScore(stats)` | **none**                                                                  | **always 2y, flat**                       |
| 5   | **User signing**     | `actions/freeagency.ts` → `validateSigning`                       | user types a number              | bounded only by cap space or re-signing ceiling                           | user picks                                |
| 6   | **Trade**            | `actions/trade.ts`                                                | —                                | contract moves unchanged                                                  | unchanged                                 |
| 7   | **Extension**        | —                                                                 | —                                | **does not exist**                                                        | —                                         |

The core money function, in full:

```ts
// valuation/playerValue.ts
scoreToCapFraction(score) = 0.35 / (1 + exp(-0.17 * (score - 80)));
ageAdjustedMarketValueCents({ score, age, season }) =
  salaryCapCents * scoreToCapFraction(score) * ageValueMultiplier(age);

// contracts/generateContract.ts
rawSalary = marketValue * rookieScaleDiscount(exp) * randomInRange(0.85, 1.15);
firstYear = max(rawSalary, emptyRosterChargeCents); // $1.3M
year[i] = firstYear * (1 + 0.05 * i);
```

`rookieScaleDiscount`: 0.35 / 0.40 / 0.45 / 0.55 / 1.0 for 0/1/2/3/4+ years experience.
`ageValueMultiplier`: peak 27, `min(1.15, 1 + |Δ|·0.015)` below, `max(0.4, 1 − (y·0.02 + max(0,y−5)·0.03))` above.

**What does _not_ influence any contract, anywhere:**

- `potentialRating` — **not an argument to `generateContract`.** The user's leading suspicion is wrong: potential has exactly zero weight on salary.
- `gamesPlayed` — not a field on `PlayerValuationStats`. See §3.
- Position, role, market demand, cap environment, previous salary — none are inputs.

---

## 2. Queta and Garza, numerically

### Neemias Queta — age 26, exp 4, seed OVR **79**

Line: 25.4 mpg, 10.2 pts, 8.4 reb, 1.7 ast, 1.32 blk, **.674 TS**, 76 games.

| Step                              | Current code          | Pre-fix code           |
| --------------------------------- | --------------------- | ---------------------- |
| Per-36 extrapolation factor       | 1.420 (capped at 1.5) | 1.420 (capped at 2.25) |
| Efficiency term `(TS−.56)×140`    | +15.96                | +15.96                 |
| × volume weight `min(1, 10.2/15)` | **×0.681 → +10.86**   | ×1.0 → **+15.96**      |
| Rebound term                      | +4.66                 | +4.66                  |
| Block term                        | +2.66                 | +2.66                  |
| Points term                       | −1.52                 | −1.52                  |
| Sample weight (minutes)           | 1.0                   | 1.0                    |
| **Performance score**             | **88.1**              | **93.2**               |
| `scoreToCapFraction`              | 28.0%                 | 31.7%                  |
| × cap $154.6M                     | $43.3M                | $49.0M                 |
| × age mult 1.015                  | $43.9M                | $49.7M                 |
| × rookie discount (exp 4)         | ×1.0                  | ×1.0                   |
| **× noise 0.85–1.15**             | **$37.3M – $50.5M**   | **$42.2M – $57.1M**    |

Observed ~$48M. Consistent with either. **His score of 88.1 exceeds Tatum's 82.6 and Brown's 86.1 on current code** — that is the live defect.

### Luka Garza — age 26, exp 4, seed OVR **69**

Line: 16.1 mpg, 8.1 pts, 4.1 reb, 0.41 blk, **.682 TS**, 69 games.

| Step                           | Current code                   | Pre-fix code                        |
| ------------------------------ | ------------------------------ | ----------------------------------- |
| `FULL_WORKLOAD_MINUTES`        | 24                             | **16**                              |
| Per-36 extrapolation           | 1.5 (capped)                   | **2.232 (uncapped, taken as fact)** |
| Efficiency term                | +17.08 × **0.538** = **+9.19** | +17.08 × 1.0 = **+17.08**           |
| Raw score                      | 76.3                           | 90.2                                |
| Sample weight                  | **0.672** → blended toward 65  | **1.0** (16.1 ≥ 16)                 |
| **Performance score**          | **72.6**                       | **90.2**                            |
| `scoreToCapFraction`           | 7.7%                           | 29.8%                               |
| **Final range over all seeds** | **$10.3M – $13.9M**            | **$39.7M – $53.7M**                 |

Observed ~$42M. **Impossible on current code — 3× outside the achievable range.** This is the proof the save predates `decd646`.

### Why Tatum and Brown are "only" $30M+

| Player       | GP     | Line                                        | Score | Salary |
| ------------ | ------ | ------------------------------------------- | ----- | ------ |
| Jayson Tatum | **16** | 21.8p / 10.0r / 5.3a, **.541 TS**, 2.44 tov | 82.6  | $35.3M |
| Jaylen Brown | 74     | 27.7p / 6.7r / 5.0a, .570 TS, 3.50 tov      | 86.1  | $37.1M |

Neither is a bug in the way Queta is. Tatum's seeded season is 16 games of an injury-wrecked year at .541 true shooting — below the model's .56 zero point, so efficiency _subtracts_ 2.7 points. Brown scores 86.1 honestly: high volume, average efficiency, and 3.5 turnovers costs him 1.8.

The real problem is not that they are underpaid. It is that **a 25-minute backup centre outscores both of them**, because rebounds (0.8/each) and blocks (2.2/each) are cheap for a big to accumulate while nothing in the formula rewards perimeter creation or on-ball defence.

---

## 3. `gamesPlayed` is not an input to any valuation — P0

`PlayerValuationStats` has eight fields. `gamesPlayed` is not one of them, and no caller filters on it. **An 11-game hot streak and an 82-game season are identical evidence to this model.**

| Player           | GP     | Seed OVR | Score | Generated salary                       |
| ---------------- | ------ | -------- | ----- | -------------------------------------- |
| Ty Jerome        | **15** | 72       | 91.5  | **$51.5M** — 3rd highest in the league |
| Cormac Ryan      | **11** | 70       | 90.4  | **$46.4M**                             |
| Zach Edey        | **11** | 71       | 94.9  | $20.3M                                 |
| Trae Young       | **15** | 72       | 88.9  | **$44.5M**                             |
| Dejounte Murray  | **14** | 72       | 83.0  | $31.2M                                 |
| Domantas Sabonis | **19** | 74       | 84.3  | $30.0M                                 |

Exposure across the dataset: **164 of 537 players (30.5%) have under 40 games; 81 have under 20.** Of 450 rostered players, 35 played 15 or fewer.

Ty Jerome at $51.5M is a worse outcome than either player the playtest flagged, and it is fully live on current code.

---

## 4. Two rating systems, unreconciled — P0

`actions/league.ts:229`:

```ts
overallRating: player.seedOverallRating ?? plan?.overallRating ?? 50,
```

The OVR the UI shows is `seedOverallRating`, from the dataset. The salary comes from `computePerformanceScore(stats)`. These are different numbers produced by different processes, and nothing reconciles them.

Across 450 rostered players the mean absolute gap is only 2.6 points — but **15 players disagree by 10+ and 4 by 15+**, and those are exactly the players that look broken:

| Player        | GP  | Shown OVR | Priced as | Gap   |
| ------------- | --- | --------- | --------- | ----- |
| Zach Edey     | 11  | 71        | 94.9      | +23.9 |
| Cormac Ryan   | 11  | 70        | 90.4      | +20.4 |
| Ty Jerome     | 15  | 72        | 91.5      | +19.5 |
| Trae Young    | 15  | 72        | 88.9      | +16.9 |
| Jalen Duren   | 73  | 85        | 99.0      | +14.0 |
| Jarrett Allen | 56  | 82        | 95.4      | +13.4 |
| Mark Williams | 60  | 78        | 90.2      | +12.2 |
| Chet Holmgren | 72  | 83        | 94.7      | +11.7 |
| Neemias Queta | 76  | 79        | 88.1      | +9.3  |

Two clusters, and they are the two root causes: **small samples** (§3) and **centres** (§6).

This gap is _why the bug is visible to the player_. A correctly-priced league whose prices are computed from a hidden second number would still read as broken.

---

## 5. League-wide salary distribution (current code, 450 rostered)

Cap $154.6M.

|        | Salary | % of cap |
| ------ | ------ | -------- |
| min    | $1.3M  | 0.8%     |
| p25    | $2.2M  | 1.4%     |
| median | $6.4M  | 4.1%     |
| mean   | $11.5M | 7.4%     |
| p75    | $17.9M | 11.6%    |
| p90    | $31.3M | 20.2%    |
| p95    | $37.1M | 24.0%    |
| max    | $58.3M | 37.7%    |

League payroll **$5.16B** against a real ~$5.10B. **The aggregate is right.** The problem is entirely in how it is distributed.

### Top 25 earners

| #   | Player                   | Age | OVR    | Score | Salary     | %cap  | Yrs |
| --- | ------------------------ | --- | ------ | ----- | ---------- | ----- | --- |
| 1   | Shai Gilgeous-Alexander  | 27  | 98     | 99.0  | $58.3M     | 37.7% | 2   |
| 2   | Luka Doncic              | 26  | 95     | 99.0  | $51.8M     | 33.5% | 4   |
| 3   | **Ty Jerome**            | 28  | **72** | 91.5  | **$51.5M** | 33.3% | 4   |
| 4   | Nikola Jokic             | 30  | 98     | 99.0  | $51.1M     | 33.0% | 4   |
| 5   | Austin Reaves            | 27  | 89     | 91.3  | $50.5M     | 32.7% | 2   |
| 6   | **Deandre Ayton**        | 27  | **79** | 88.3  | **$49.3M** | 31.9% | 2   |
| 7   | Joel Embiid              | 31  | 90     | 93.2  | $48.2M     | 31.2% | 2   |
| 8   | **Jakob Poeltl**         | 29  | **79** | 89.0  | **$47.6M** | 30.8% | 4   |
| 9   | Giannis Antetokounmpo    | 30  | 96     | 99.0  | $46.5M     | 30.0% | 4   |
| 10  | Jamal Murray             | 28  | 90     | 91.6  | $46.4M     | 30.0% | 3   |
| 11  | **Cormac Ryan**          | 26  | **70** | 90.4  | **$46.4M** | 30.0% | 5   |
| 12  | Donovan Mitchell         | 29  | 89     | 92.9  | $45.5M     | 29.5% | 2   |
| 13  | Karl-Anthony Towns       | 29  | 85     | 91.8  | $45.5M     | 29.4% | 4   |
| 14  | **Trae Young**           | 27  | **72** | 88.9  | **$44.5M** | 28.8% | 4   |
| 15  | **Jarrett Allen**        | 27  | **82** | 95.4  | **$44.1M** | 28.5% | 4   |
| 16  | Kawhi Leonard            | 34  | 91     | 98.2  | $43.1M     | 27.9% | 4   |
| 17  | Michael Porter Jr.       | 27  | 86     | 86.8  | $42.0M     | 27.1% | 3   |
| 18  | Lauri Markkanen          | 28  | 89     | 90.3  | $41.1M     | 26.6% | 3   |
| 19  | **John Collins**         | 28  | **77** | 84.0  | **$39.3M** | 25.4% | 5   |
| 20  | **Neemias Queta**        | 26  | **79** | 88.1  | **$37.7M** | 24.4% | 2   |
| 21  | Rudy Gobert              | 33  | 83     | 87.4  | $37.5M     | 24.3% | 2   |
| 22  | **Isaiah Hartenstein**   | 27  | **77** | 84.4  | **$37.5M** | 24.2% | 5   |
| 23  | Jaylen Brown             | 28  | 88     | 86.1  | $37.1M     | 24.0% | 5   |
| 24  | Julius Randle            | 30  | 85     | 83.6  | $37.0M     | 23.9% | 3   |
| 25  | Nickeil Alexander-Walker | 27  | 85     | 84.7  | $36.8M     | 23.8% | 4   |

**9 of the top 25 have a seed OVR below 80.** Bolded rows are the anomalies.

### Salary by quality tier

| Tier (seed OVR)    | N   | min    | median | max        | median %cap |
| ------------------ | --- | ------ | ------ | ---------- | ----------- |
| superstar 90+      | 14  | $22.4M | $43.1M | $58.3M     | 27.9%       |
| all-star 85–89     | 30  | $10.4M | $30.9M | $50.5M     | 20.0%       |
| high starter 80–84 | 38  | $4.6M  | $20.8M | $44.1M     | 13.5%       |
| starter 75–79      | 71  | $4.9M  | $15.8M | **$49.3M** | 10.2%       |
| role 70–74         | 87  | $2.6M  | $7.5M  | **$51.5M** | 4.9%        |
| bench 65–69        | 136 | $1.3M  | $2.7M  | **$20.3M** | 1.7%        |
| fringe <65         | 74  | $1.3M  | $1.6M  | $4.8M      | 1.0%        |

Medians are ordered correctly and sensibly spaced. **The tails are the failure**: the 70–74 band reaches $51.5M, higher than the superstar band's median. Bands overlap almost completely.

Correlations: salary↔seed OVR **0.778**, salary↔perf score **0.873**, perf score↔seed OVR **0.910**, salary↔minutes 0.593.

### 15 worst anomalies (paid above what the displayed OVR justifies)

| #   | Player                | OVR | Score | Actual | Expected | Gap     |
| --- | --------------------- | --- | ----- | ------ | -------- | ------- |
| 1   | Ty Jerome             | 72  | 91.5  | $51.5M | $10.8M   | +$40.7M |
| 2   | Cormac Ryan           | 70  | 90.4  | $46.4M | $8.5M    | +$37.9M |
| 3   | Trae Young            | 72  | 88.9  | $44.5M | $11.1M   | +$33.4M |
| 4   | Deandre Ayton         | 79  | 88.3  | $49.3M | $24.8M   | +$24.5M |
| 5   | Jakob Poeltl          | 79  | 89.0  | $47.6M | $23.8M   | +$23.8M |
| 6   | Dejounte Murray       | 72  | 83.0  | $31.2M | $10.6M   | +$20.5M |
| 7   | Daniel Gafford        | 75  | 82.9  | $36.5M | $16.2M   | +$20.3M |
| 8   | John Collins          | 77  | 84.0  | $39.3M | $19.9M   | +$19.4M |
| 9   | Collin Sexton         | 75  | 82.9  | $35.0M | $16.5M   | +$18.5M |
| 10  | Sandro Mamukelashvili | 74  | 80.6  | $32.9M | $14.6M   | +$18.3M |
| 11  | Anthony Davis         | 76  | 85.2  | $33.8M | $16.4M   | +$17.4M |
| 12  | Isaiah Hartenstein    | 77  | 84.4  | $37.5M | $20.3M   | +$17.2M |
| 13  | Kristaps Porzingis    | 75  | 85.0  | $32.0M | $15.2M   | +$16.8M |
| 14  | Marvin Bagley III     | 73  | 80.0  | $29.3M | $12.8M   | +$16.5M |
| 15  | Domantas Sabonis      | 74  | 84.3  | $30.0M | $13.8M   | +$16.3M |

**11 of 15 are centres or power forwards.**

### Most underpaid — all young

| Player            | OVR | Score | Actual | Expected | Gap     |
| ----------------- | --- | ----- | ------ | -------- | ------- |
| Amen Thompson     | 88  | 83.5  | $13.7M | $46.3M   | −$32.6M |
| Paolo Banchero    | 86  | 81.8  | $10.4M | $42.8M   | −$32.4M |
| Victor Wembanyama | 95  | 99.0  | $22.4M | $54.7M   | −$32.4M |
| Cooper Flagg      | 85  | 80.0  | $11.4M | $43.0M   | −$31.7M |
| Jalen Johnson     | 89  | 88.6  | $18.3M | $47.2M   | −$28.9M |
| Cade Cunningham   | 89  | 87.6  | $18.3M | $46.5M   | −$28.2M |
| Anthony Edwards   | 93  | 92.6  | $24.0M | $51.0M   | −$27.0M |

This one is **mostly correct** — it is the rookie-scale discount doing its job, which is exactly what real rookie-scale contracts look like. It becomes an exploit only in combination with §10.

---

## 6. Residual positional bias — P1

The `decd646` fix removed the phantom efficiency bonus. It did not remove the underlying tilt.

| Pos   | N      | mean seed OVR | mean score | gap      | median value |
| ----- | ------ | ------------- | ---------- | -------- | ------------ |
| PG    | 114    | 71.6          | 71.9       | +0.3     | $8.1M        |
| SG    | 101    | 72.2          | 72.7       | +0.5     | $8.9M        |
| SF    | 103    | 71.7          | 72.3       | +0.6     | $10.0M       |
| PF    | 61     | 72.1          | 73.7       | +1.6     | $10.7M       |
| **C** | **71** | **73.1**      | **76.8**   | **+3.7** | **$19.8M**   |

**Centres are 16% of the league and 40% of the 30 highest-valued players** (12 of 30). Guards are 48% of the league and also 12 of 30. A centre's median valuation is **2.2× a guard's**.

Cause: the formula's rewarded quantities are points (0.85), rebounds (0.8), assists (1.1), steals (2.2), blocks (2.2), true shooting (140 × volume weight). Rebounds and blocks are structurally available to bigs; true shooting is structurally higher for players who only shoot at the rim. Nothing in the model rewards shot creation, spacing, or perimeter defence. This is the same imbalance the module's own comment says was corrected once — it was reduced, not eliminated.

This is the direct answer to "why a backup centre outearns Tatum."

---

## 7. Contract length — P1

Length is chosen by `pickContractLength(ageAdjustedScore, rng)`: ≥80 → 60% chance of 4–5y else 2–3y; ≥55 → 2–4y; else 1–2y. Because almost every rostered player scores above 55, **essentially the whole league draws from 2–4 years.**

| Tier               | N   | 1y  | 2y  | 3y  | 4y  | 5y  | avg |
| ------------------ | --- | --- | --- | --- | --- | --- | --- |
| superstar 90+      | 14  | 1   | 4   | 2   | 5   | 2   | 3.2 |
| all-star 85–89     | 30  | 0   | 5   | 8   | 7   | 10  | 3.7 |
| high starter 80–84 | 38  | 0   | 10  | 7   | 15  | 6   | 3.4 |
| starter 75–79      | 71  | 0   | 13  | 22  | 24  | 12  | 3.5 |
| role 70–74         | 87  | 1   | 29  | 25  | 27  | 5   | 3.1 |
| bench 65–69        | 136 | 4   | 49  | 45  | 38  | 0   | 2.9 |
| fringe <65         | 74  | 2   | 25  | 25  | 22  | 0   | 2.9 |

Superstars average **3.2 years — shorter than all-stars (3.7) and shorter than fringe players' 2.9 is close to.** The ordering is nearly flat and partly inverted.

Specific failures:

- **130 of 450 players with OVR below 70 are on 3+ year guaranteed deals.**
- Kawhi Leonard (34) and Kyrie Irving (33) get 4 years; Paul George (35) and DeMar DeRozan (36) get 4.
- SGA (98 OVR) gets 2 years; Haliburton (90) gets 2.
- **Every CPU re-signing and every CPU free-agent signing is exactly 2 years, flat, no raises** (`CPU_RESIGNING_YEARS = 2`, `CPU_FREE_AGENT_YEARS = 2`). After one offseason the league converges toward uniform 2-year flat contracts and the bootstrap's variety disappears.

---

## 8. Cap and max-salary constraints — P0

| Concept                       | Present?                                                        |
| ----------------------------- | --------------------------------------------------------------- |
| Salary cap                    | Yes                                                             |
| Luxury tax, aprons            | Yes                                                             |
| Minimum team salary (floor)   | Yes (added in the finance audit)                                |
| Rookie scale                  | Approximated by experience discount                             |
| Minimum salary                | `emptyRosterChargeCents` = **$1.3M** (real vet min $2.1M–$3.6M) |
| **Maximum individual salary** | **No. None. Anywhere.**                                         |
| Percentage-of-cap max         | No                                                              |
| Veteran max tiers (25/30/35%) | No                                                              |

`validateSigning` bounds an offer by cap space or the re-signing ceiling. Nothing else. The observed max of 37.7% of cap is **not** the result of a rule — it is an accident of `scoreToCapFraction`'s 0.35 asymptote combined with up to +15% noise. Change the curve and salaries would run past it unchecked.

Against real structure the top of the market is also **compressed**: 19 players over 25% of cap (real ~30), 9 over 30% (real ~14). The simulator has too few genuine max contracts and too many mid-tier ones — the tiers are mush, not steps.

**Is the absence of max rules responsible for the $40–50M mediocre players?** Partly. It is not the cause — the cause is the valuation score — but a max rule is the cheapest available _bound_ on the damage any valuation error can do.

---

## 9. Seeded vs generated contracts

**There are no seeded contracts.** The dataset carries `externalId, fullName, position, heightInches, weightLbs, birthDate, draftYear, draftRound, draftPick, nationality, college, photoUrl, teamAbbreviation, seedOverallRating, seedPotentialRating, overrideApplied, stats` — no salary field of any kind.

Every contract in every save is generated. There is no real-salary baseline to compare against, and no stale seeded salary data to blame. This closes off one hypothesis cleanly.

The dataset's own stats are real (hoopR, roster date 2026-07-31, 518 players on 2025 stats and 19 on 2024).

---

## 10. Free-agency market logic — P1

```ts
// cpuFreeAgentPass.ts:132
signings.push({
  leaguePlayerId: fa.leaguePlayerId,
  leagueTeamId: teamId,
  salaryCents: fa.estimatedValueCents,
});
```

**Every free agent has exactly one deterministic price.** One interested team, five interested teams, the whole league — same number. Demand determines _who signs him_, never _what he costs_. There is no bidding, no escalation, no scarcity premium.

**On cap-space inflation specifically (the Houston $67.9M concern): the fear is unfounded for CPU teams.** `MAX_SHARE_OF_CAP_SPACE = 0.7` means cap space only gates _whether_ a club can participate:

```ts
const spendCeiling = capSpaceCents * 0.7;
if (fa.estimatedValueCents > spendCeiling) continue;
```

Cap space never raises an offer. **Ability to pay is correctly separated from willingness to overpay.** This part of the system is right and should not be changed.

The user side is the opposite: a user with $67.9M of room may legally offer all of it to one player (43.9% of cap), because §8 provides no ceiling.

---

## 11. Long-save drift — P1

**`Player.seasonStats` is never written by the simulation.** Grep confirms no writer outside the import scripts. So `computePerformanceScore(stats)` is frozen at the real 2025-26 box score **forever**, while `overallRating` moves every offseason via `developPlayerRating`.

Two prices for the same man, diverging every season:

| Player       | Frozen FA price (all seasons) | y0              | y4              | y8              | y10                 |
| ------------ | ----------------------------- | --------------- | --------------- | --------------- | ------------------- |
| Wembanyama   | $52.1M                        | ovr 95 → $50.2M | ovr 99 → $52.1M | ovr 99 → $52.1M | ovr 96 → $50.8M     |
| Cooper Flagg | **$27.0M**                    | ovr 85 → $37.9M | ovr 95 → $50.2M | ovr 96 → $50.8M | ovr 98 → **$51.7M** |
| Nikola Jokic | **$52.1M**                    | ovr 98 → $51.7M | ovr 89 → $44.5M | ovr 74 → $14.3M | ovr 65 → **$3.9M**  |
| LeBron James | **$41.6M**                    | ovr 92 → $47.9M | ovr 72 → $11.1M | ovr 60 → $1.7M  | ovr 60 → $1.7M      |

By year 10 a declined Jokic re-signs for $3.9M but any team can sign him out of free agency at **$52.1M** — a 13× contradiction inside one offseason, from one player, in two adjacent code paths.

Retired players aside, this also means **rookies drafted in-sim have no `seasonStats` at all**, so they are invisible to the CPU free-agent market entirely (`if (!stats) continue`).

---

## 12. Exploit surface — P1

1. **No individual max** (§8). A user with room can hand one player 44% of cap; the CPU cannot stop it and no rule forbids it.
2. **Underpaid young stars are free money.** Wembanyama costs ~$19.9M and is worth ~$54.7M; Flagg ~$10.7M vs ~$43.0M; Amen Thompson ~$13.1M vs ~$46.3M. Trade for rookie-scale players and the CPU is handing over ~$33M of surplus each. (The discount itself is correct; the exploit is that trade valuation and salary come from different numbers.)
3. **Fixed, published FA price.** The board shows the price and the CPU pays exactly it. Outbid by $1 and you win every time, forever, with no escalation.
4. **Dump-the-overpay.** Because §4's two ratings diverge, a bloated contract on a low-OVR player can be traded to a CPU team that evaluates the OVR and not the money.

---

## 13. CPU self-destruction

Measured on current code: **14 of 450 rostered players (3.1%) have a seed OVR below 75 and a valuation above 15% of cap.** Ten of thirty teams carry at least one; Utah carries three.

That is a real problem but a _contained_ one — CPU teams are not routinely destroying themselves. The pre-fix code was far worse (21 players over 30% of cap vs 9 today, league payroll $6.42B vs $5.16B). The GM decision layer (`evaluateReSigningDecision`, `financialSpendingResistance`) is doing its job; it is being fed bad prices.

---

## 14. Downstream systems affected

| System                      | Effect                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cap space                   | Directly wrong. Teams carrying a $50M Ty Jerome show no room they should have.                                                            |
| Free agency                 | Prices come from the same broken score.                                                                                                   |
| Trades                      | Salary-matching runs on inflated numbers; trade value runs on a _different_ number, so the two disagree.                                  |
| Roster construction         | Teams over-committed to bigs; the positional tilt propagates into `computeTeamNeeds`.                                                     |
| Team strength               | Not affected — strength uses `overallRating`, which is fine.                                                                              |
| Luxury tax                  | Tax bills computed on distorted payrolls.                                                                                                 |
| Owner confidence / finances | Payroll aggregate is right, so franchise finances are broadly OK. This is why the finance audit passed while contracts were still broken. |
| Long saves                  | §11.                                                                                                                                      |

---

## 15. Findings, classified

### P0 — simulator-breaking

| ID         | Type             | Finding                                                                                                                                                                                      |
| ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-P0-1** | DATA ISSUE       | **The playtest save predates commit `decd646`.** Garza's $42M is outside the current code's achievable range ($10.3–13.9M) and inside the pre-fix range. Existing saves are never re-priced. |
| **C-P0-2** | CONTRACT FORMULA | **`gamesPlayed` is not an input to any valuation.** Ty Jerome, 15 games, $51.5M — 3rd-highest salary in the league. 35 rostered players have ≤15 games.                                      |
| **C-P0-3** | CAP RULE         | **No maximum individual salary exists.** The only ceiling is cap space. The observed 37.7% max is an accident of the logistic's asymptote.                                                   |
| **C-P0-4** | INTEGRATION GAP  | **Two unreconciled rating systems.** UI shows `seedOverallRating`; salary uses `computePerformanceScore(stats)`. 15 players disagree by 10+ points. This is why the bug is _visible_.        |

### P1 — major realism failure

| ID         | Type             | Finding                                                                                                                                                                                                      |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C-P1-1** | PLAYER VALUATION | **Residual centre bias.** C mean score exceeds mean OVR by +3.7 vs PG +0.3. Centres are 16% of the league, 40% of the top 30 earners, and have 2.2× a guard's median value. Directly explains Queta > Tatum. |
| **C-P1-2** | LONG-SAVE DRIFT  | **`seasonStats` never updates.** FA prices frozen at real 2025-26 forever. Year-10 Jokic: re-signs at $3.9M, signs as a free agent at $52.1M.                                                                |
| **C-P1-3** | INTEGRATION GAP  | **Four pricing paths, three inputs, three modifier stacks.** At age 39 quality 85, a re-signing costs **82% more** than the same player bootstrapped. Age risk is priced on one path and free on three.      |
| **C-P1-4** | MARKET LOGIC     | **No market.** FA price is deterministic; demand picks the winner, never the price.                                                                                                                          |
| **C-P1-5** | CONTRACT FORMULA | **Contract length is near-random w.r.t. quality.** Superstars average 3.2y, all-stars 3.7y. 130 sub-70-OVR players on 3+ year guaranteed deals. All CPU deals are exactly 2y flat.                           |

### P2 — calibration

| ID     | Type                       | Finding                                                                                                                          |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C-P2-1 | CALIBRATION                | Minimum salary is `emptyRosterChargeCents` $1.3M vs a real vet min of $2.1M–$3.6M; 39 players sit pinned to it.                  |
| C-P2-2 | CALIBRATION                | Top of market compressed: 19 players over 25% of cap (real ~30), 9 over 30% (real ~14).                                          |
| C-P2-3 | CONTRACT FORMULA           | Raises hardcoded at 5%/yr in bootstrap, 0% on every CPU deal. Real deals use 5% (Bird) / 8% (non-Bird) with declines also legal. |
| C-P2-4 | CALIBRATION                | `ageValueMultiplier` has a slope kink at 32 (0.02/yr → 0.05/yr). Not a discontinuity, but it makes 33–36 a cliff in practice.    |
| C-P2-5 | INTEGRATION GAP            | In-sim drafted rookies have no `seasonStats`, so `cpuFreeAgentMarket` skips them entirely (`if (!stats) continue`).              |
| C-P2-6 | INTENTIONAL SIMPLIFICATION | No extension mechanism exists at all. Acceptable for now; note it is why every good player eventually reaches free agency.       |

### Confirmed NOT the problem — do not change

- **Potential.** Not an argument to `generateContract`. Zero weight on salary. The leading hypothesis is disproved.
- **Cap space inflating CPU offers.** `MAX_SHARE_OF_CAP_SPACE` gates participation only; ability to pay is already separated from willingness to overpay.
- **Seeded salary data.** There is none. Nothing stale to fix.
- **`scoreToCapFraction`.** Verified in the finance audit by parameter sweep; every alternative made the league 17–45% poorer. The curve is fine — its _input_ is wrong.
- **Aggregate payroll calibration.** $5.16B vs a real $5.10B. Do not retune to chase individual salaries.
- **The GM decision layer.** `evaluateReSigningDecision` and `financialSpendingResistance` behave correctly on the prices they are given.
- **The age curve's shape.** Peak 27 with accelerating decline is right; it is simply not applied on three of four paths.

---

## 16. Realism classification

**NECESSARY** — required for believable contracts:

- Maximum individual salary as a percentage of cap (25/30/35% by experience)
- Sample-size confidence on the valuation input
- One pricing function shared by all paths
- Contract length keyed to quality and age

**USEFUL** — real gain, can be simplified:

- Realistic minimum salary
- Raises as a real structure rather than a constant
- Live in-sim stats feeding valuation
- Demand affecting price within a bounded band

**UNNECESSARY** — complexity without gameplay benefit:

- Exact per-pick rookie-scale table
- Bird / Early-Bird / Non-Bird distinctions beyond what exists
- Trade kickers, poison pills, set-off rights
- Exact 5%/8% raise legality by exception type
- Full CBA extension eligibility rules

---

## 17. Recommended test suite

Existing coverage: `generateContract.test.ts` (10 tests), `playerValue.test.ts` (anchor players, efficiency-without-volume), `ageCurve.test.ts`, `cpuFreeAgentPass.test.ts`. None assert a _relationship_ between quality and pay, and none guard the distribution.

Add — behavioural:

1. A superstar earns materially more than a rotation player at the same age.
2. A player with a low seed OVR cannot reach a max-level salary from any statline.
3. High potential alone never produces a superstar salary (guards the property that potential is not an input).
4. A 15-game sample is priced below an identical 75-game sample.
5. Age reduces salary monotonically past 30 **on every path** — the regression test for C-P1-3.
6. No generated salary exceeds the max tier for the player's experience.
7. No generated salary falls below the veteran minimum.
8. Contract length increases with quality and decreases with age past 32.
9. FA demand moves price within a bounded band and never past the max.
10. CPU cap space never raises an offer (locks in the currently-correct behaviour).

Add — statistical, run over the full dataset: 11. corr(salary, seed OVR) ≥ 0.90 (currently **0.778**). 12. Fewer than 3 players with OVR < 75 earning above 20% of cap (currently **14 above 15%**). 13. Median salary by tier is strictly ordered and each tier's p90 sits below the next tier's p90. 14. Count of players above 30% of cap lands in 10–18 (currently 9). 15. No position's mean (score − seed OVR) exceeds +1.5 (centres currently **+3.7**).

---

## 18. Scores

| Dimension           | Score  | Note     |
| ------------------- | ------ | -------- |
| Dimension           | Before | After    | Note                                                     |
| ---                 | ---    | ---      | ---                                                      |
| Contract Realism    | 4/10   | **8/10** | Tails bounded; top of market still compressed            |
| Salary Calibration  | 6/10   | **9/10** | Payroll $5.104B vs real $5.10B; corr 0.778 → 0.862       |
| Free Agency Market  | 3/10   | **5/10** | Priced correctly now, but still no bidding (C-P1-4 open) |
| Contract Length     | 3/10   | **8/10** | Ordered by quality, capped by age, CPU deals varied      |
| Cap Integration     | 5/10   | **8/10** | Individual maximum now exists and clamps last            |
| Long-Save Stability | 3/10   | **5/10** | Paths unified; frozen stats still open (C-P1-2)          |
| Exploit Resistance  | 3/10   | **6/10** | Max salary and sample weighting close two of four        |

---

## 19. Direct answers

**Why exactly did Queta get ~$48M and Garza ~$42M?**

Garza: the save was created before commit `decd646`. Under that code `FULL_WORKLOAD_MINUTES` was 16, so his 16.1 mpg counted as a full workload and his per-game rates were extrapolated 2.23× to a per-36 basis and taken as fact, while his .682 true shooting was credited at full weight (+17.1 points) despite 8.1 points per game. Score 90.2 → 29.8% of cap → $39.7M–$53.7M. On today's code he scores 72.6 and costs $10.3M–$13.9M.

Queta: still live. 25.4 mpg clears the sample-weight threshold entirely, and 8.4 rebounds (×0.8) plus 1.32 blocks (×2.2) plus .674 true shooting at 68% volume weight (+10.9) sum to a score of 88.1 — **higher than Tatum's 82.6 and Brown's 86.1.** The model rewards what a rim-running centre accumulates and has no term for what a wing does.

**Isolated bug or systemic?**

Systemic, and worse than the two reported cases. Ty Jerome at $51.5M off 15 games is a bigger error than either. Nine of the top 25 earners have a seed OVR below 80. Four independent root causes: no sample-size weighting, no maximum salary, residual positional bias, and two unreconciled rating systems.

**Can this contract generator be trusted for a multi-season simulator?**

Not yet. The aggregate is trustworthy — league payroll is within 1% of real and franchise finances are sound. The individual assignment is not, and §11 guarantees it degrades rather than stabilises over a long save.

**Smallest set of changes to make salary generation believable?**

Four. In this order:

1. **Sample-size confidence on the valuation input** — add `gamesPlayed` to `PlayerValuationStats` and blend toward replacement level below a threshold, exactly as `sampleWeight` already does for minutes. One function, same shape as code that exists. Kills Ty Jerome, Cormac Ryan, Edey, Trae Young, Sabonis, Murray in one change.
2. **Maximum individual salary at 25/30/35% of cap by experience** — a clamp in `generateContract` and a check in `validateSigning`. Bounds the damage of every present and future valuation error, and creates the tier structure §8 says is missing.
3. **One pricing function, called by all four paths** — collapse bootstrap / draft / re-sign / FA onto a single `priceContract()` so age and noise are applied once, consistently. Removes C-P1-3 and the 82% divergence.
4. **Contract length keyed to quality and age** — replace `pickContractLength`'s three flat buckets, and stop hardcoding CPU deals at 2 years.

That set fixes all four P0s and two of five P1s without touching `scoreToCapFraction`, the age curve, the finance model, or the GM decision layer.

The positional bias (C-P1-1) and the frozen-stats drift (C-P1-2) are the two remaining P1s. Both are real, both are larger pieces of work, and neither is required for the reported symptom to go away.

---

## Appendix — reproducing

```
npx tsx scripts/contract-audit.ts        # distribution, anomalies, sweeps, seed ranges
npx tsx scripts/contract-audit-paths.ts  # path divergence, drift, exploits, positional bias
```


---

# C-P1-2 RE-MEASURED AND PARTLY RESOLVED — 2026-08-15

**The headline number above is stale.** C-P1-2 reports "Year-10 Jokic:
re-signs at $3.9M, signs as a free agent at $52.1M." That was measured before
`contractQualityScore` was anchored to `overallRating` (C-P0-4). Re-measured on
current code across 355 players, dropping the performance term entirely moves a
price by **6.9% on average** — not by an order of magnitude. The rating anchor
fixed most of C-P1-2 as a side effect, and nothing had gone back to check.

## What is genuinely wrong, and it is worse than "year ten"

`seasonStats` is seeded real data that never advances. The free-agency paths
query it with `where: { season: league.currentSeason }`, and leagues start at
2026 while the dataset carries mostly 2025:

| Save season | Players with stats at `currentSeason` |
| --- | ---: |
| 2026 (season 1) | 95 / 450 (21%) |
| 2027 (season 2) | **0 / 450 (0%)** |
| 2028+ | **0 / 450 (0%)** |

So this is not a long-save drift that creeps in by year ten. **From the second
season of every save, no free agent has stats at all.**

## The user-visible consequence

`free-agents/page.tsx` priced the board with `scoreToCapFraction(performanceScore)`
— one of the four unreconciled pricing paths C-P1-3 catalogues, and *not* the
one the detail page uses — and returned `null` when stats were missing. A null
price meant no value shown, and because rival interest needs a price to compare
cap space against, `computeRivalInterest` was skipped entirely.

**From season two onward the free-agent board showed no price and no interest
for anybody.** That also silently undercut the acceptance check added the same
day in `docs/FREE_AGENCY_AUDIT.md`: a player would refuse an offer and name a
price the board had never displayed.

## Fixed

The board now prices through `priceContractCents` — the same function the
detail page quotes, a rival club pays, and `signFreeAgentAction` holds the user
to. Because `contractQualityScore` is rating-anchored, a missing performance
score costs ~7% of accuracy instead of producing nothing.

| | Before | After |
| --- | --- | --- |
| Free agents priced on the board, season 2+ | **0%** | **100%** |
| Rival interest computed, season 2+ | **never** | **always** |
| Pricing paths used by the FA surfaces | 2 (board vs detail) | **1** |

Four pricing paths become three, which is progress against C-P1-3.

## C-P1-2 FULLY RESOLVED — in-sim performance now prices contracts

The remaining half shipped separately: pricing reads what a player has actually
done **in this save**, not a frozen real-world line.

`loadInSimPerformance` reads two sources, because a season's box scores are
collapsed once it ends — the `LeaguePlayerSeasonStat` rollup for completed
seasons, raw `PlayerGameStat` for one in progress. Regular season only; playoff
samples are small, selective, and not what a player is paid for. Below ten
games it returns nothing and the caller falls back, mirroring the sample-size
weighting `contractQualityScore` already applies.

Wired into all three pricing surfaces, which had all been reading the frozen
seed line:

| Surface | Was | Now |
| --- | --- | --- |
| Free-agent board | seed stats (empty from season 2) | in-sim, seed fallback |
| Free-agent detail page | seed stats (empty from season 2) | in-sim, seed fallback |
| **CPU free-agent market** | seed stats (empty from season 2) | in-sim, seed fallback |

The third is the one that mattered most: rival clubs price every offer through
it, so from a save's second season the entire CPU market had been valuing free
agents on rating alone.

**This also closes C-P2-5.** An in-sim drafted rookie had no `seasonStats` at
all and was skipped by the market entirely. He now has a real record the moment
he has played ten games.

What the change buys, measured: production and rating are no longer the same
signal. A 30-point scorer and a benchwarmer of equal rating priced identically
before; they no longer do. Rating still dominates — a 65-rated producer cannot
out-earn an 85-rated one — which is the C-P0-4 anchor doing its job, and there
is a test pinning it.


---

# C-P2-1 RESOLVED — the minimum salary was the wrong rule entirely

`emptyRosterChargeCents` is the **cap hold** charged against a team's books for
each roster spot below twelve — a real CBA rule, correctly used by
`computeCapSheet`. It was *also* standing in as the minimum **salary** in four
places: `validateSigning`'s always-legal branch, the acceptance floor in
`signFreeAgentAction`, in-season CPU signings, and the price floor in
`priceContractCents`. Two unrelated rules sharing one number, and the number
belonged to the other one.

C-P2-1 recorded the symptom — a $1.3M minimum against a real $2.1M-$3.6M, with
39 players pinned to it. The cause was the conflation.

## Fixed

`src/lib/cap/veteranMinimum.ts` holds the real service-year scale, expressed as
fractions of the salary cap because the CBA ties them to it — so it stays
correct for any season without a second table to keep in sync.

| | Before | After |
| --- | ---: | ---: |
| Rookie minimum | $1.31M | $1.27M |
| 5-year veteran | $1.31M | $2.67M |
| 10-year veteran | **$1.31M** | **$3.64M** |
| Scales with service | no | **yes** |
| `emptyRosterChargeCents` used as a salary | 4 call sites | **0** |

A ten-year veteran now costs nearly 3x what he did, which is what the real
scale says and what makes a veteran-minimum contract a genuine roster-building
decision rather than a rounding error.

## What it exposed: the re-signing model's identity term is nearly inert

Raising the floor broke a `reSigningDecision` test, and the interesting part is
why. The fixture asserted that team **identity** separates a re-signing
decision from team **personality** — a REBUILDING club with a WIN_NOW GM should
let an aging veteran walk where a CONTENDER keeps him.

Sweeping the offer directly, that separation exists only in a band roughly
$1.3M to $2.0M wide. Below it every club re-signs; above it every club walks.
No (age, rating) pair produces a realistic offer inside that band. The old
fixture sat in it by accident, at the ~$1.4M floor this change replaced.

**So the test was passing for the wrong reason** — it pinned a knife edge, not
a behaviour. Its own comment already suspected as much ("this margin is worth
revisiting when the re-signing model itself is next audited").

The assertion is now scoped to what actually holds, and this is recorded as an
open finding rather than papered over:

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **C-P3-1** | P3 | MODEL | In `evaluateReSigningDecision`, team identity is swamped by GM personality: a WIN_NOW GM makes the same call at a REBUILDING club as at a CONTENDER for every realistic offer. Identity only separates the two inside a ~$0.7M band no real contract lands in. Belongs to a re-signing audit. |
