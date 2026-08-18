# Salary & Contract System — Adversarial Audit

**Opened** 2026-08-16. Commissioned specifically because implausible contracts
had been observed in play and a surface review was not wanted.

**Method.** Two read-only harnesses, no database:
`scripts/salary-system-audit.ts` (distribution, tiers, sensitivity, large-sample,
outlier detector) and `scripts/salary-market-audit.ts` (demand, cap space,
CPU bidding, payroll, multi-season drift). Every number below reproduces.

**Relationship to `docs/audits/CONTRACT_AUDIT.md`.** That file is the running history
and is largely closed — C-P0-1 through C-P0-4, C-P1-2/3/5, C-P2-1/3/4 are all
resolved, several within the last two days. This audit is a fresh adversarial
pass that assumes none of it and measures the system as it stands today.

---

## HEADLINE

The contract system's *mechanics* are in good shape. Cap rules, signing
mechanisms, escalators, minimums, maximum tiers, the demand premium and the
acceptance model are all present, correct and consistent with each other.

**Two calibration failures dominate everything else, and they are the same
failure seen from two ends:**

1. **The market prices a 15-man roster at $220.0M against a $162.4M cap.**
   Only **1 of 30 teams** would be under the cap; **20 of 30 would be over the
   second apron.**
2. **Every player above roughly 86 OVR is priced identically** — an 87-rated
   All-Star, a 93-rated All-NBA player and a 99-rated MVP all cost exactly
   $48.7M.

The first makes cap space nearly nonexistent, which starves free agency of the
mechanism it needs to work at all. The second erases the distinction between
good and generational at the top of the league.

Neither is a bug. Both are the same curve being too generous in the middle and
saturating at the top.

---

## 1. CONTRACT LIFECYCLE MAP

Every path by which a contract comes into existence:

| # | Path | Entry point | Pricing |
| --- | --- | --- | --- |
| 1 | Seeded / league bootstrap | `actions/league.ts` | `generateContract` → `priceContractCents` + noise 0.85-1.15 |
| 2 | Rookie (drafted) | `actions/draft.ts` | `generateContract` with `yearsOfExperience: 0` → 0.35 discount |
| 3 | User free-agent signing | `actions/freeagency.ts` | user-chosen, gated by `validateSigning` + `evaluateFreeAgentOffer` |
| 4 | CPU re-signing | `actions/offseason.ts` | `computeReSigningMaxOfferCents` → `priceContractCents` |
| 5 | CPU free-agent signing | `freeagency/cpuFreeAgentMarket.ts` | `priceContractCents` → `demandAdjustedPriceCents` |
| 6 | In-season CPU signing | `actions/leagueEvents.ts` | `veteranMinimumCents` — always a minimum deal |
| 7 | Trade (contract moves) | `actions/trade.ts` | `contract.update` — salary unchanged, team reassigned |
| 8 | Expiry | `actions/offseason.ts` | contract rows deleted; player becomes a free agent |

**There is no extension mechanism** (C-P2-6, marked intentional). Every good
player therefore reaches free agency eventually, which concentrates the whole
economy through paths 3–5.

**There is no waive/release path.** A player cannot be cut, so no dead money
exists and bad contracts can only be escaped by trade or expiry.

### The single pricing formula

Every path except 6 and 7 funnels into one function:

```
price = cap
      × scoreToCapFraction(quality)          logistic: max 0.35, midpoint 80, steepness 0.17
      × ageValueMultiplier(age)              1.15 max, quadratic decline past 27, floor 0.40
      × rookieScaleDiscount(experience)      0.35 / 0.40 / 0.45 / 0.55 / 1.00
      × positionalMarketFactor(position)     fitted to real pay by position
      × noise                                0.85-1.15, generateContract only
  floored at veteranMinimumCents(season, experience)
  clamped at maxIndividualSalaryCents(age, season, experience)   25% / 30% / 35% by service
```

where `quality = overallRating + 10, tilted toward performanceScore by
min(1, gamesPlayed/58) × 0.5`.

**Potential is not an argument to any of it.** Confirmed by inspection and by
test: 78/78, 78/85, 78/92 and 78/99 all price at $33.5M.

---

## FINDINGS

### P0-1 — League payroll is 135% of the cap
**Type: CONTRACT FORMULA · Severity: P0**

**Observed.** Pricing all 450 rostered players at market and summing by team:

| | Measured | Real NBA |
| --- | ---: | ---: |
| Average payroll per team | **$220.0M** | ~$170-190M |
| As % of cap | **135%** | ~110-120% |
| Lowest team payroll | $154.4M | — |
| Median team payroll | $229.7M | — |
| Highest team payroll | $261.7M | — |
| Teams under the cap | **1 of 30** | ~8-12 |
| Teams over the tax line | **24 of 30** | ~6-8 |
| **Teams over the second apron** | **20 of 30** | ~2-3 |

**Root cause.** `scoreToCapFraction` has `MIDPOINT = 80`, meaning a player rated
80 earns *half of the maximum* — 17.5% of the cap. On this rating scale 80 is an
ordinary starter, not a near-max player. The curve is calibrated so the middle
of the league is paid like the top of it.

**Downstream consequences**, and this is why it is P0 rather than P1:

- **Free agency cannot function.** `computeRivalInterest` requires
  `capSpace >= askingPrice`. With one team under the cap, almost no club is ever
  a suitor, so the CPU market signs almost nobody and the demand premium never
  fires.
- **The apron rules become universal rather than exceptional.** Two thirds of
  the league is hard-capped out of every mid-level exception.
- **The user's own club is permanently taxed**, so payroll-reduction directives
  and financial mandates fire constantly.
- It cascades into `financialSpendingResistance`, luxury-tax bills, owner
  confidence and job security.

**Reproduction.** `npx tsx scripts/salary-market-audit.ts`, section 24.

**Recommended fix.** Move `MIDPOINT` upward (85-87) so a mid-tier starter costs
mid-tier money, and re-measure aggregate payroll as the acceptance criterion.
The target is a per-team average near 110-115% of cap with 8-12 clubs under it.
**Do not simply scale the curve down** — that lowers the top too, and the top is
already compressed (P0-2).

**Regression test.** Aggregate: pricing the seeded league must produce a mean
team payroll between 105% and 125% of the cap, and at least six clubs under it.

---

### P0-2 — Everything above ~86 OVR costs exactly the same
**Type: PLAYER VALUATION · Severity: P0**

**Observed.** Sensitivity sweep, age 27, 7 years' service, SF:

| OVR | Salary | Change |
| ---: | ---: | ---: |
| 78 | $32.1M | — |
| 82 | $42.8M | +6.4% |
| **86** | **$48.7M** | +13.7% |
| **90** | **$48.7M** | **0.0%** |
| **94** | **$48.7M** | **0.0%** |
| **98** | **$48.7M** | **0.0%** |

In the seeded league this puts **Zion Williamson (85), Lauri Markkanen (89),
Jayson Tatum (93), Luka Dončić (95) and Shai Gilgeous-Alexander (98) on the
identical $48.7M salary.**

**Root cause.** Two ceilings stack. `scoreToCapFraction` asymptotes at 0.35 of
cap, and the individual maximum for a 7-9 year player is 0.30. Because the curve
is already generous in the middle (P0-1), it crosses 0.30 at roughly 86 OVR —
so the max clamp, not the valuation, decides every salary above that.

The max tier is doing its job correctly. The problem is that the curve arrives
at the ceiling twelve rating points too early.

**Downstream consequences.**
- The trade system cannot express that a 98 is worth more than an 86 *in
  salary* — it only shows up in trade value, so a swap of the two looks like a
  clean salary match.
- `docs/audits/FREE_AGENCY_AUDIT.md` FA-P2-1 is a direct symptom: the demand premium
  is absorbed entirely for any player at the max, so competition for the best
  players moves nothing.
- Star acquisition is under-costed relative to its on-court effect, which is
  amplified by the team-strength re-weighting that made stars 24.9% of a team.

**Reproduction.** `npx tsx scripts/salary-system-audit.ts`, sections 9 and 30.

**Recommended fix.** Same lever as P0-1 — moving `MIDPOINT` right delays the
crossing and restores separation across 86-99 without touching the max tiers.
Verify with the sensitivity table: each +4 OVR above 86 should still move salary.

**Regression test.** `price(98) > price(93) > price(88)` strictly, at fixed age
and service.

---

### P1-1 — The middle of the league is paid like the top of it
**Type: CONTRACT FORMULA · Severity: P1**

Same root cause as P0-1, recorded separately because it is what a player
actually *sees*.

| Archetype | OVR | Simulator | Real NBA equivalent |
| --- | ---: | ---: | ---: |
| Average starter | 76 | **$26.3M** (16.2% cap) | ~$8-14M |
| High-end starter | 81 | **$39.8M** (24.5% cap) | ~$25-30M |
| Rotation player | 70 | **$12.8M** (7.9% cap) | ~$5-8M |
| League median | — | **$9.4M** (5.8% cap) | ~$5M (3.2%) |

A 78-rated 24-year-old commands **$33.5M**. That is the shape of the observed
"implausible contracts": not a broken formula, a curve that pays an ordinary
starter like a second option.

---

### P1-2 — Rookie contracts are half price and ignore draft slot
**Type: INTENTIONAL SIMPLIFICATION · Severity: P1**

**Observed.**

| Pick | Expected OVR | Year-1 salary | % of cap | Real #1 pick |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 72 | **$6.5M** | 4.0% | ~$12.5M (8%) |
| 14 | 70 | $5.0M | 3.1% | ~$4.5M |
| 60 | 62 | $1.5M | 0.9% | ~$1.2M |

`rookieScaleDiscount` keys off years of service alone, so **every rookie gets
the identical 39% discount** and slot only matters through the small rating
difference the draft curve produces. The real rookie scale is steeply
pick-dependent — the first pick earns roughly five times the thirtieth.

**Consequence.** The top of the draft is *too cheap* and the bottom is about
right, which makes a high pick an even better asset than it should be — on top
of `docs/audits/DRAFT_AUDIT.md`'s pick valuation. Late firsts are correspondingly
under-rewarded.

Marked INTENTIONAL SIMPLIFICATION because the docstring says so, but the
simplification is now doing measurable harm at the top of round one.

---

### P1-3 — Positional premium is 29% at identical rating
**Type: PLAYER VALUATION · Severity: P1**

| Position | Salary at 82 OVR | vs cheapest |
| --- | ---: | ---: |
| C | $33.2M | — |
| PG | $34.2M | +3.0% |
| SG | $36.5M | +9.9% |
| PF | $39.7M | +19.8% |
| **SF** | **$42.8M** | **+29.1%** |

`positionalMarketFactor` was fitted against real pay-by-position and is
defensible in *direction* — the league does pay centres less. A 29% spread
between two players of identical rating is large enough to be the dominant term
for mid-tier players, and it compounds with P0-1: an 82-rated small forward is
pushed to the max clamp while an 82-rated centre is not.

---

## P2 FINDINGS

| ID | Type | Finding |
| --- | --- | --- |
| S-P2-1 | MARKET LOGIC | The demand premium is inert above 86 OVR — 1 suitor and 10 suitors both pay $48.7M. Duplicate of FA-P2-1; the cause is P0-2, not the premium. |
| S-P2-2 | MARKET LOGIC | A star with **zero** rival suitors accepts 60% of his ask (`NO_DEMAND_FLOOR`). Correct in direction, but 60% of a max is a $19M discount available to any club with room. |
| S-P2-3 | CONTRACT FORMULA | Contract length has only 4 quality bands and ignores position, injury history and team context. Archetypes still come out sensible (superstar 4-5y, fringe 1-2y, 36-year-old 1y). |
| S-P2-4 | INTEGRATION GAP | No waive/release path, so no dead money exists and a bad contract can never be eaten. |
| S-P2-5 | DATA ISSUE | The largest single-OVR salary jump is +17.4% at 61→62, where the veteran minimum floor stops binding. Harmless but a visible discontinuity. |

---

## WHAT IS WORKING — DO NOT CHANGE

Measured and sound. Several of these are the exact things an audit of this kind
usually finds broken.

- **Cap space does not feed into price.** Team room is not an argument to any
  pricing function. Verified: a player's ask is $48.7M whether the club has $5M
  or $60M of room. **The classic cap-space overpay exploit does not exist here.**
- **CPU teams cannot bid against themselves.** `computeRivalInterest` gates on
  `capSpace >= ask`, so a club that cannot afford a player is never counted as a
  suitor and cannot inflate his price.
- **The demand premium is bounded.** 8% per extra suitor, capped at 32%. No
  runaway auction is possible.
- **Everything is cap-relative.** Max, minimum, and every price are fractions of
  the cap, so all scale together automatically. Measured across ten seasons, an
  82-rated player costs 26.4% of the cap in 2026 and 26.4% in 2035.
- **Long-save salary structure is stable.** Median salary holds at 7.0% → 7.6%
  of cap across ten simulated seasons. No inflation spiral, no compression.
- **The minimum-salary exploit is closed.** A 90-rated player refuses the
  veteran minimum; a 68-rated fringe player accepts it. Both correct.
- **Potential does not buy salary.** Exactly the separation asked for — a
  developmental player cannot draw star money on ceiling alone.
- **Contract length is sensibly archetyped.** 36-year-olds get one year;
  superstars get four to five; fringe players one to two.

---

## SENSITIVITY SUMMARY — which variables distort most

| Variable | Effect size | Verdict |
| --- | --- | --- |
| **OVR, 70→86** | $13.0M → $48.7M (**+275%**) | dominant, and too steep in the middle |
| **OVR, 86→98** | $48.7M → $48.7M (**0%**) | dominant defect (P0-2) |
| Position | ±29% | too large for a secondary term (P1-3) |
| Age, 26→38 | $40.6M → $26.9M (−34%) | smooth, no cliffs — sound |
| Service (rookie scale) | ×0.35 → ×1.00 | correct shape, wrong slot-independence |
| Demand (1→5 suitors) | +32% max | bounded, sound |
| **Potential** | **0%** | by design |
| Cap growth | proportional | sound |

---

## MULTI-SEASON RESULTS

| Season | Cap | >$10M | >$20M | >$30M | >$40M | Median | Median/cap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026 | $162.4M | 240 | 146 | 101 | 55 | $11.3M | 7.0% |
| 2028 | $179.0M | 241 | 150 | 93 | 63 | $11.0M | 6.1% |
| 2030 | $197.4M | 291 | 140 | 89 | 59 | $12.4M | 6.3% |
| 2035 | $251.9M | 361 | 200 | 122 | 78 | $17.6M | 7.0% |
| 2036 | $264.5M | 367 | 225 | 142 | 95 | $20.2M | 7.6% |

Median-to-cap moves 7.0% → 7.6% over ten seasons. **There is no inflation
spiral.** The rise in absolute counts tracks cap growth and the 80+ population,
not a runaway formula.

---

## USER EXPLOIT PROBES

| Probe | Legal? | Accepted? | Verdict |
| --- | --- | --- | --- |
| 90 OVR for the veteran minimum, no rivals | legal | **refuses** | closed |
| 82 OVR for the veteran minimum, no rivals | legal | **refuses** | closed |
| 68 OVR fringe for the minimum | legal | accepts | correct |
| 90 OVR at 60% of ask, no rivals | **illegal** (cap) | accepts | S-P2-2 — needs room |
| 90 OVR at 60% of ask, 5 rivals | illegal | **refuses** | closed |

**No practical exploit was found in the pricing or acceptance layer.** The one
live discount — 60% of ask when nobody else is bidding — requires cap space,
which P0-1 has made almost nonexistent. Fixing P0-1 will make S-P2-2 reachable,
so it should be re-probed after.

---

## SCORECARD

| Dimension | Score | Why |
| --- | ---: | --- |
| Contract Realism | **4** | Mechanically complete; an average starter earns 16% of the cap and every star earns the same. |
| Salary Calibration | **3** | 135% of cap per team. The single worst number in the system. |
| Free Agency Market Logic | **6** | Demand premium, suitor gating and acceptance are all correct — and mostly inert because nobody has room. |
| Contract Length Logic | **7** | Believable by archetype; ignores position, injury and context. |
| Cap Integration | **5** | Every rule modelled correctly, and the league cannot fit inside them. |
| CPU Contract Decision-Making | **6** | Judges AAV, respects roster limits and cash, reuses one engine — starved of cap space to act on. |
| Long-Save Stability | **8** | Cap-relative throughout; median/cap flat across ten seasons. |
| Exploit Resistance | **7** | No cap-space feedback, no self-bidding, minimum exploit closed. One discount pending re-probe. |

---

## DIRECT ANSWERS

**Is the current contract system trustworthy enough to support a multi-season
simulator?**
For *stability*, yes — it will not spiral or corrupt itself over ten seasons.
For *believability*, not yet. A league where 20 of 30 teams are over the second
apron and every star earns the same is not a credible NBA.

**Are absurd contracts isolated bugs or a systemic valuation problem?**
**Systemic, and singular.** They are one mis-calibrated parameter —
`scoreToCapFraction`'s midpoint — seen from different angles. There is no
scattering of independent bugs.

**Which variables are responsible for the biggest distortions?**
`scoreToCapFraction`'s `MIDPOINT` first and by a distance; then
`positionalMarketFactor`'s spread; then `rookieScaleDiscount`'s
slot-independence.

**Does the system preserve believable separation between tiers?**
Below 86 OVR, yes — superstar/star/starter/rotation/minimum bands are ordered
and mostly distinct. Above 86, **no**: the separation collapses entirely.

**Does it remain stable after 5-10 seasons?**
Yes. This is the system's strongest property and it is worth protecting through
any fix.

**Smallest set of fixes before trusting contracts again?**
Two, and the first may be sufficient for both:
1. **Re-fit `scoreToCapFraction`'s midpoint** against aggregate league payroll,
   with top-end separation as a hard constraint. Fixes P0-1, P0-2 and P1-1.
2. **Make the rookie scale slot-dependent.** Fixes P1-2, independent of the above.

`positionalMarketFactor` (P1-3) should be re-measured *after* the refit — some
of its apparent size is the curve's steepness in the band where it was measured.

---

## RECOMMENDED STAGED FIX ORDER

1. **Re-fit the pricing curve** against two simultaneous targets: mean team
   payroll 105-125% of cap, and strict salary ordering across 86-99 OVR. Nothing
   else moves until this is measured.
2. **Re-run both harnesses unchanged** and compare every table in this document.
3. **Re-probe the exploits**, because cap space will exist again and S-P2-2
   becomes reachable.
4. **Re-measure `positionalMarketFactor`** on the new curve.
5. **Rookie scale by slot**, independently.
6. **Regression tests** as listed below.

---

## RECOMMENDED REGRESSION TESTS

Deterministic:
- superstar (95) earns strictly more than star (88) earns strictly more than starter (79)
- salary is strictly increasing across 86 → 90 → 94 → 98 OVR
- a rotation player (70) can never reach 25% of the cap at any age or position
- potential alone moves salary by exactly zero
- a 38-year-old gets a shorter term than a 27-year-old of equal rating
- cap space is not an argument to any pricing function *(guards the exploit that does not exist)*
- generated salary never exceeds the service-tier maximum, at any quality
- generated salary never falls below the service-year minimum

Statistical:
- mean team payroll is 105-125% of cap on the seeded league
- at least six of thirty clubs are under the cap
- salary/rating rank correlation above 0.8
- fewer than five outlier flags from `salary-system-audit.ts`
- median salary as a share of cap moves less than 2pp across ten simulated seasons

---

## REPRODUCING

```
npx tsx scripts/salary-system-audit.ts
npx tsx scripts/salary-market-audit.ts
```

Both are read-only and take no database.


---

# STAGE 1 APPLIED — pricing curve refit — 2026-08-16

`scoreToCapFraction`: **MIDPOINT 80 → 82, STEEPNESS 0.17 → 0.21.** Fitted in
`scripts/pricing-curve-calibration.ts` against the real payroll shape already in
`realPayrollShape.ts`.

## Result — identical diagnostics, re-run

| | Before | **After** | Real |
| --- | ---: | ---: | ---: |
| **Mean team payroll** | **$220.0M (135%)** | **$176.6M (109%)** | ~110% |
| **Total league payroll** | $6,599.8M | **$5,297.4M** | **$5,291M** |
| Median salary | $9.4M (5.8%) | **$4.8M (3.0%)** | ~3.2% |
| Teams under the cap | **1 of 30** | **7 of 30** | ~8-12 |
| Teams over the tax | 24 of 30 | **8 of 30** | ~6-8 |
| **Teams over the 2nd apron** | **20 of 30** | **0 of 30** | ~2-3 |
| Players above 19.4% of cap | 75 | **57** | 59 |
| Average starter (76 OVR) | $26.3M | **$18.9M** | ~$8-14M |
| Rotation player (70 OVR) | $12.8M | **$6.8M** | ~$5-8M |
| Long-save median/cap drift | 7.0% → 7.6% | **3.7% → 4.4%** | — |

**Total league payroll lands within 0.1% of the real figure measured from
imported contracts** ($5,297.4M against $5,291M). That was not a fitted target —
the fit used the mean-payroll ratio and the $30M+ band — so it is an independent
check.

**P0-1 is closed. P1-1 is closed.**

## P0-2 was wrong as filed, and is withdrawn

P0-2 claimed "every player above 86 OVR costs the same" as an independent defect
and proposed strict price ordering across 88/93/98 as a hard constraint.

**That is wrong about the NBA.** Max-contract players genuinely do earn
identical salaries; differentiation at the top comes from service tier, not
talent. Sweeping under that constraint proved it — no curve satisfies both it
and the payroll target, because the constraint asks the model not to have
maximum salaries at all.

The real question is *who* reaches the clamp, and that is P0-1. Before the
refit the lowest-rated player reaching his maximum was **82 OVR**; after, it is
**85**, with 3.6% of the league at a maximum against a real ~5.8%.

**P0-2 is withdrawn and folded into P0-1.** Recorded rather than quietly
dropped, because it was the audit's own headline finding.

## An unreachable target, excluded from the fit

The real $50M+ band holds 14 players. $50M is 32.3% of the 2026 cap, and only
the 35% service tier can exceed 30% — so reaching 14 needs the **Designated
Veteran (supermax)** rule, which this model does not have. Fitting to it would
have dragged every other number off. Excluded deliberately; filed below.

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| S-P2-6 | P2 | INTENTIONAL SIMPLIFICATION | No supermax tier, so the $50M+ population caps at ~1 against a real 14. Only 10+ year veterans can exceed 30% of the cap. |

## Six tests moved, and one bug was found by moving them

Every failure was a fixture pinned to the old salary scale. Each was re-anchored
by measurement, not by loosening an assertion:

| Test | Change | Why |
| --- | --- | --- |
| `priceContract` ordering | qualities 62-92 → 74-98 | an 11-year veteran below ~70 quality now correctly prices at the minimum, and two minimum players earn the same |
| re-signing identity split | 65 → 66 | marginal band moved |
| re-signing roster ceiling | 70 → 67 | marginal band moved |
| re-signing trade request | 74 → 68 | marginal band moved |
| trade personality bar | incoming 74 → 75 | contract surplus shares `scoreToCapFraction` |
| CPU trade targeting | seeker's piece 64 → 65 | same |

**C-P3-1 is closed as a side effect.** That finding recorded that team identity
never separated a WIN_NOW GM's re-signing decision at any realistic price. After
the refit it does: at 66 OVR a rebuilding club lets the player walk where a
contender keeps him. The finding was real, and the cause was the salary scale
rather than the re-signing model.

## Still open after stage 1

| ID | Sev | Finding |
| --- | --- | --- |
| P1-2 | P1 | Rookie contracts ignore draft slot — every rookie takes the same 39% discount |
| P1-3 | P1 | Positional premium is 29% between SF and C at identical rating — **re-measure on the new curve before acting** |
| S-P2-2 | P2 | A star with no rival suitors accepts 60% of ask — now reachable, since cap space exists again |
| S-P2-6 | P2 | No supermax tier |


---

# STAGES 3 & 4 — re-probe and re-measure — 2026-08-16

Both were specified in the fix order as checks to run *after* the curve moved,
because both could change what the remaining findings need.

## Stage 3 — exploits re-probed now that cap space exists

The pricing and acceptance layers hold. What changed is that the no-demand
discount is now reachable, exactly as predicted.

Measured against an offseason-shaped league — 12 players under contract per club
after expiries, 10 of 30 with room, largest room $63.9M:

| OVR | Ask | Suitors with room | He requires | Discount |
| ---: | ---: | ---: | ---: | ---: |
| 70 | $6.9M | 6 | $9.1M | **−32%** (a premium) |
| 75 | $16.4M | 4 | $20.3M | −24% (a premium) |
| 80 | $32.0M | 2 | $29.9M | 6% |
| 85 | $47.8M | 1 | $35.1M | **27%** |
| 95 | $48.7M | 1 | $35.7M | **27%** |

The mid-market works well — competition raises price where several clubs can
afford a player. **The top is discounted 27%, and the mechanism is an
inconsistency rather than a design choice:**

`computeRivalInterest` counts a club as a suitor only if `capSpace >= the FULL
ask`. But `evaluateFreeAgentOffer` will let that same player sign for as little
as 60% of it. So a club that could comfortably afford 27% below asking is not
counted as competition, the suitor count comes back at 1, and the player
concludes nobody wants him.

**The two halves of the market use different prices for the same question.**

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **S-P1-4** | P1 | MARKET LOGIC | Suitor counting gates on the full ask while acceptance permits 60-100% of it, so expensive players systematically under-count their own market and take a 27% discount. A club with room gets stars cheap. |

**Recommended fix.** Gate `computeRivalInterest` on what the player would
actually accept — the same floor `evaluateFreeAgentOffer` applies — rather than
on the headline ask. That is a one-line change to the comparison, not a new
mechanism, and it should raise star suitor counts and close the discount.

> **A correction.** A first probe of this reported the discount as 40% at every
> rating with zero suitors league-wide. That was a harness artefact: it built
> rival clubs from the seeded roster, where `selectTopPerTeam` gives every team
> exactly 15 players, and `computeRivalInterest` also gates on `rosterCount < 15`
> — so no club could ever be a suitor regardless of money. The numbers above use
> a 12-man offseason shape and are the real ones.

## Stage 4 — positional premium re-measured. **P1-3 is withdrawn.**

The spread is unchanged by the refit, because the factor is multiplicative:

| Position | Factor | OVR 72 | OVR 82 | OVR 90 |
| --- | ---: | ---: | ---: | ---: |
| SF | 1.149 | $9.9M | $38.7M | $48.7M |
| PF | 1.066 | $9.2M | $35.9M | $48.7M |
| SG | 0.978 | $8.4M | $33.0M | $48.7M |
| PG | 0.917 | $7.9M | $30.9M | $46.2M |
| C | 0.890 | $7.7M | $30.0M | $44.9M |

High-to-low spread: **29.1%** at OVR 72 and 82, 8.6% at 90 where the maximum
compresses it.

P1-3 called 29% "large enough to be the dominant term for mid-tier players".
Checking the derivation rather than the size: **these factors are measured**,
not chosen. `POSITIONAL_MARKET_FACTOR` is actual pay over rating-predicted pay
across 213 veterans on real contracts, normalised so league payroll is
unchanged — it moves money between positions without creating any. The follow-up
to `docs/audits/RATING_AUDIT.md` R-P1-1 established that the rating model measures
quality correctly and the league simply pays centres less.

A 29% gap between a small forward and a centre of equal rating is what the real
market does. **P1-3 is withdrawn — it was a finding about the size of a number
without checking where the number came from.**

## Revised open list after stages 1, 3 and 4

| ID | Sev | Finding |
| --- | --- | --- |
| **S-P1-4** | **P1** | **Suitor gate and acceptance floor use different prices — 27% star discount** |
| P1-2 | P1 | Rookie contracts ignore draft slot |
| S-P2-6 | P2 | No supermax tier, so the $50M+ population caps at ~1 against a real 14 |
| ~~P0-2~~ | — | withdrawn in stage 1 — max players earn the same by design |
| ~~P1-3~~ | — | withdrawn here — positional factors are empirically measured |
| ~~S-P2-2~~ | — | superseded by S-P1-4, which is the real mechanism |


---

# STAGE 5 — S-P1-4 FIXED — 2026-08-16

`computeRivalInterest` now gates on what the player would **sign for**, not what
he is **asking** — `NO_DEMAND_FLOOR` of the ask, the same floor
`evaluateFreeAgentOffer` applies. One comparison changed.

| | Before | **After** | |
| --- | ---: | ---: | --- |
| Suitors for an 85-rated player | 1 | **2** | |
| Star discount (85-95 OVR) | **27%** | **12%** | |
| 80 OVR | 6% discount | **24% premium** | competition now bids him up |
| 75 OVR | 24% premium | 32% premium | unchanged in direction |
| 70 OVR | 32% premium | 32% premium | unchanged |

The residual 12% is not the bug — it is the demand model working. Two suitors is
genuinely thin demand, and `SUITORS_FOR_FULL_PRICE = 3` is where a player holds
out for his whole ask. A star wanted by two clubs taking 12% under is a market
outcome; a star wanted by *five* clubs taking 27% under was an inconsistency.

## Why counting a floor-only club is right

A club that can reach 60% of the ask but not 100% is genuinely able to sign him
— if nobody else bids, that is exactly the price he takes. Excluding it was
asserting that a club which could sign the player was not competition for the
player.

## One test rewritten, not loosened

`rivalInterest.test.ts` had a test named *"requires cap space to cover the
player's full expected price"* — the old rule written down as an assertion. It
now asserts the new rule with three cases: a club below the floor is not
interested, a club exactly at the floor is, and so is one that can pay the ask
outright.

## Final state of the audit

| ID | Sev | Status |
| --- | --- | --- |
| P0-1 | P0 | **Fixed** — payroll 135% → 109% of cap |
| P1-1 | P1 | **Fixed** — same refit |
| **S-P1-4** | **P1** | **Fixed** — star discount 27% → 12% |
| P1-2 | P1 | Open — rookie contracts ignore draft slot |
| S-P2-6 | P2 | Open — no supermax tier |
| ~~P0-2~~ | — | Withdrawn — max players earn the same by design |
| ~~P1-3~~ | — | Withdrawn — positional factors are empirically measured |
| ~~S-P2-2~~ | — | Superseded by S-P1-4 |

**Every P0 is closed and two of three P1s are.** The one substantive item left
is the rookie scale, which is independent of everything above.


---

# STAGE 6 — P1-2 FIXED — rookie scale by draft slot — 2026-08-16

`rookieScale.ts` holds the published first-year scale as fractions of the cap,
interpolated between anchors. `generateContract` takes an optional
`overallPickNumber`; the draft passes it, every other caller omits it and is
untouched.

| Pick | Before | **After** | Real |
| ---: | ---: | ---: | ---: |
| **1** | **$6.5M (4.0%)** | **$13.1M (8.1%)** | **8.1%** |
| 5 | $5.7M (3.5%) | $8.6M (5.3%) | 5.3% |
| 10 | $5.0M (3.1%) | $6.0M (3.7%) | 3.7% |
| 14 | $5.0M (3.1%) | $4.9M (3.0%) | 3.0% |
| 20 | — | $3.7M (2.3%) | 2.3% |
| 30 | $3.3M (2.0%) | $2.8M (1.7%) | 1.7% |
| 45 (2nd rd) | $2.4M | $1.3M (0.8%) | ~0.9% |
| 60 (2nd rd) | $1.5M | $1.3M (0.8%) | ~0.9% |

**Every first-round slot now matches the published scale.** The first pick earns
4.6x the thirtieth, which is the scale's defining property and the thing a
service-year-only discount erased entirely.

First-rounders also get the real **four-year** term. Second-rounders have no
scale — as in reality, they price normally and land at the minimum.

## Two things worth recording

**The seeded league is unaffected.** Only `actions/draft.ts` passes a pick
number, so bootstrap contracts price exactly as before and stage 1's payroll
figures still hold.

**A latent inversion, which does not arise in play.** Compared at an *equal*
rating, a second-round pick costs slightly more than pick 30 — generic rookie
pricing sits just above the pick-30 scale. It never occurs in a real draft
because the class curve does not put a 70-rated prospect at pick 45, but it is
why the regression test compares realistic ratings per slot rather than holding
rating constant.

## Audit closed

| ID | Sev | Status |
| --- | --- | --- |
| P0-1 | P0 | **Fixed** — payroll 135% → 109% of cap |
| P1-1 | P1 | **Fixed** |
| S-P1-4 | P1 | **Fixed** — star discount 27% → 12% |
| **P1-2** | **P1** | **Fixed** — rookie scale by slot |
| S-P2-6 | P2 | Open — no supermax tier (documented simplification) |
| ~~P0-2~~ | — | Withdrawn |
| ~~P1-3~~ | — | Withdrawn |
| ~~S-P2-2~~ | — | Superseded |

**Every P0 and every P1 is closed.** The only open item is the missing supermax
tier, which is a documented simplification rather than a defect.

---

# S-P2-6 — supermax, implemented

## Before

`maxSalary.ts` modelled the three CBA service tiers correctly — 25% of the cap
at 0-6 years, 30% at 7-9, 35% at 10+ — and stopped there. The mechanism the
real league uses to let a club pay *its own* franchise player above his tier did
not exist, so a 29-year-old with eight years of service and an MVP was capped at
30% exactly like any other eight-year veteran.

## What was done

A new pure module, `src/lib/cap/supermax.ts`, holding the eligibility rule, and
an optional `supermaxEligible` flag threaded through the existing pricing chain:

```
isSupermaxEligible()            <- the rule, award-driven
  -> computeReSigningMaxOfferCents()   <- the ONLY path that may grant it
    -> priceContractCents()
      -> clampToMaxSalary()
        -> maxSalaryFractionFor()     <- re-checks the band itself
```

Two properties of the real rule are modelled deliberately:

- **Incumbent club only.** A rival cannot offer a supermax in free agency, so
  the flag enters at `computeReSigningMaxOfferCents` and nowhere else. Like Bird
  rights, it makes keeping a homegrown star expensive rather than making him
  cheap to poach.
- **7-9 band only.** At 10+ the ordinary tier is already 35%, so there is
  nothing to raise, and 0-6 cannot qualify at all.

Eligibility is read from `SeasonAward` over a three-season window ending with
the season just completed: MVP anywhere in the window, or Defensive Player of
the Year in the most recent season or two of the three.

## After

At the 2027 cap of $170.5M, for a player rated 95:

| Service | Standard | Supermax | Delta | % of cap |
| --- | --- | --- | --- | --- |
| 6 years | $42.6M | $42.6M | — | 25% (cannot qualify) |
| 7 years | $51.1M | $59.7M | **+$8.5M** | 30% → 35% |
| 8 years | $51.1M | $59.7M | **+$8.5M** | 30% → 35% |
| 9 years | $51.1M | $59.7M | **+$8.5M** | 30% → 35% |
| 10 years | $59.7M | $59.7M | — | 35% (already) |

## What the measurement caught

The first implementation applied `Math.max(tier, 0.35)` whenever the flag was
set, which raised a **six-year** player from 25% to 35% — skipping two tiers on
a single boolean. `isSupermaxEligible` returns false there, so it was
unreachable through the live path, but `maxSalaryFractionFor` is exported and
this module's stated contract is that a bad input must never unlock a supermax.
The band is now re-checked inside `maxSalaryFractionFor` rather than trusted
from the caller, with a regression test for the two-tier skip.

## Stated simplification

The real criteria admit a third qualifying path — All-NBA, on the same recency
pattern as DPOY — and **this cannot be modelled, because the simulator has no
All-NBA selection.** `AwardCategory` runs MVP, Rookie of the Year, Most
Improved, Defensive Player of the Year and Sixth Man; nothing anywhere picks
positional teams.

The omission is one-directional: All-NBA is the most common route in reality, so
this recognises *fewer* supermax players than the real league would, never more.
Synthesising an All-NBA from `overallRating` was rejected — it would make the
salary ceiling depend on a rating rather than on an achievement, which is
exactly the confusion the service tiers were rewritten to remove.

| ID | Severity | Outcome |
| --- | --- | --- |
| S-P2-6 | P2 | **Fixed.** Designated Veteran Extension modelled on the MVP and DPOY paths; All-NBA path documented as unmodellable. |
