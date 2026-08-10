# Franchise Finances — Audit

**Date:** 2026-08-11 · **Method:** code trace across all 14 finance modules and
4 finance actions, plus a replay of the real money model over the committed
537-player fixture — 30 teams, real markets, real generated payrolls, and a
15-season projection of cash and debt.

Every figure below was measured by running the shipped functions, not read off
a comment. Where a claim rests on inspection alone, it says so.

Fourth audit in the refinement phase. It inherits, and finally prices, the
payroll-calibration question the Cap/Roster work deliberately deferred.

---

## Verdict

**Well built and well calibrated — and currently producing a league where 17 of
30 teams lose money, because it is faithfully reporting a defect that lives
somewhere else.**

The revenue and expense curves are close to right. Point them at realistic
payrolls and the model lands almost exactly on the real NBA's distribution.
Point them at the payrolls the game actually generates and a third of the
league is insolvent in season one.

There are two genuine finance-side defects — an unbounded debt spiral with no
failure state, and franchise value being swallowed by hoarded cash. Neither is
the headline symptom.

---

## The measurement that decides everything

Same model, same teams, same everything — only payroll changes.

|                                        | Profitable    | League net income | Median team | Worst team |
| -------------------------------------- | ------------- | ----------------- | ----------- | ---------- |
| **Current payrolls** (median ~$213M)   | **13 / 30**   | **−$441.5M**      | −$12.6M     | −$290.3M   |
| **Realistic payrolls** (median ~$175M) | **25 / 30**   | **+$1.83B**       | +$66.5M     | −$154.5M   |
| _Real NBA_                             | _~20–25 / 30_ | _~+$2B_           | _~+$70M_    | —          |

Milwaukee is the clearest case. Payroll **$304.4M** against a **$187.9M** tax
line produces a **$174.8M** tax bill on **$268.9M** of total revenue. The tax
alone is 65% of everything the franchise earns.

Note the direction of the error. The model's flat **1.5×** tax multiplier is
_more forgiving_ than the real CBA's graduated 1.5×–4.75× with repeater
penalties. A lenient tax still bankrupts a third of the league, which isolates
the cause beyond argument: payroll, not the tax.

---

## Scores

| Dimension          | Score    | Note                                                     |
| ------------------ | -------- | -------------------------------------------------------- |
| **Overall**        | **6/10** | Good model, correct arithmetic, no stabilising feedback  |
| Calibration        | 8/10     | Matches reality once fed realistic payrolls              |
| Correctness        | 7/10     | Units and arithmetic sound; two real modelling defects   |
| Long-run stability | 3/10     | Debt and cash both diverge without bound                 |
| Gameplay depth     | 5/10     | Revenue barely responds to anything the player does      |
| Structure          | 9/10     | Pure money model, zero Prisma, fully consumed by the app |
| Test confidence    | 6/10     | Units well covered; nothing tests the multi-season shape |

---

## Findings

### P0-1 — The league is insolvent, and the cause is upstream

**Observed.** 13/30 teams profitable, league-wide net income −$441.5M, six teams
with negative cash at the end of season one.

**Root cause.** Not in `finances.ts`. It is the ~20% payroll inflation recorded
in the cap work — `scoreToCapFraction`'s shape — propagating into the expense
side and amplified by the luxury tax.

**Fix.** Correct payroll calibration first. Nothing in this module should be
tuned beforehand, or the tuning will be compensating for a defect and will need
undoing once that defect is fixed.

**Validation.** Re-run the replay above; expect roughly 25/30 profitable and a
median near +$66M without touching a single finance constant.

---

### P0-2 — Unbounded debt spiral, and no failure state

**Observed**, 15 seasons with payroll held flat and CPU borrowing exactly as
`shouldCpuTakeLoan` does:

| Team | Cash after S1 | Cash after S15 | Debt   | Annual interest |
| ---- | ------------- | -------------- | ------ | --------------- |
| MIL  | −$220M        | **−$3.69B**    | $1.35B | $108M           |
| IND  | −$173M        | −$2.98B        | $1.35B | $108M           |
| UTA  | −$100M        | −$1.88B        | $1.35B | $108M           |
| HOU  | +$358M        | **+$3.68B**    | $0     | $0              |

Nothing stops either end. There is no bankruptcy, no forced sale, no owner
bailout, no hard payroll constraint. `financialSpendingResistance` returns 1.5×
at negative cash — a nudge on _adding_ salary that cannot shed a contract
already signed. A team locked into bad deals falls forever, borrowing $90M at a
time at 8%.

**Caveat on this projection.** Payroll was held flat, which is pessimistic: real
CPU behaviour sheds some salary as contracts expire. The divergence is real; its
slope is gentler than the table shows.

**Gameplay impact.** Insolvency currently means nothing. A franchise can run
−$3.7B and keep playing exactly as before, which drains the entire finance
pillar of stakes.

---

### P0-3 — Franchise value becomes a function of hoarded cash

**Evidence.** `src/lib/finances/finances.ts`:

```ts
const CASH_VALUE_WEIGHT = 0.5; // "Small next to the billions of baseline"
cashComponent = Math.max(0, cashReserveCents) * CASH_VALUE_WEIGHT;
```

The comment is true at the scale it was written for: $120M of starting cash adds
$60M against a $3.5B baseline. It stops being true once cash compounds. Houston
at $3.68B adds **$1.84B** — franchise value is then driven by the bank balance
rather than by market, winning or popularity.

**Root cause.** A weight calibrated at one scale, applied to a quantity with no
upper bound.

**Fix.** Diminishing returns or a hard ceiling on the cash component.

---

### P1-4 — Revenue barely responds to anything the player does

**Observed**, revenue spread _within_ each market tier:

| Market | Range across teams | Spread |
| ------ | ------------------ | ------ |
| LARGE  | $436M – $444M      | 1.8%   |
| MID    | $314M – $325M      | 3.4%   |
| SMALL  | $261M – $269M      | 3.0%   |

Regular-season success reaches revenue only through fan happiness → attendance,
worth about **±$15M** on a $150M gate. Playoffs are the real lever (~$6M per
home game, $12M for a title).

**Assessment.** The business game is currently "spend less", not "grow the
franchise". For a section that presents ticket pricing, marketing and capital
projects as strategy, the revenue side is close to a constant.

**Classification: design gap**, not a bug. Deliberately not proposed as a fix
until P0-1 lands, since payroll correction changes the whole margin picture.

---

### P1-5 — Still no salary floor

Carried from the cap audit, and it matters more here. Nothing forces minimum
spending and no penalty exists. Houston's $106M payroll — roughly $33M below a
real 90%-of-cap floor — is rewarded with **+$237.6M** net income and the best
financial health in the league.

**The most profitable strategy available is to field a cheap team**, and the
finance model offers no resistance.

---

### P2-6 — Luxury tax is flat and market-blind

A single 1.5× multiplier, documented as a deliberate simplification. It applies
identically to Milwaukee (SMALL, $269M revenue) and the Lakers (LARGE, $444M).
Graduated rates and revenue sharing exist in the real CBA precisely because that
asymmetry is unfair.

Given the project's "the rules are the product" positioning, this is the most
visible remaining CBA simplification.

---

### P2-7 — CPU teams never touch their business levers

`pickCpuTicketPosture` assigns a posture by market and it never changes. All 30
CPU teams sit on STANDARD departments permanently — documented in
`finances.ts` as "a later pass". Every CPU team's finances are therefore a
deterministic function of market and payroll, with no variety and no divergence
across a long save.

---

### P3-8 — A constant that outlived its model

`describeGameEvents.ts` still calibrates blowouts against a `MAX_MARGIN` of 22
that no longer exists — the margin rework replaced it with a normal distribution
(SD 15), so 30-point wins now happen and are not flagged. Finance-adjacent only
through playoff revenue, but it is the same family of defect as P0-3: a number
correct for a model that has since been replaced.

---

## Systems that are already strong — do not touch

- **The pure/impure split is exemplary.** `finances.ts` has zero Prisma imports:
  385 lines of testable arithmetic. Structurally the best module in the codebase.
- **It consumes rather than re-simulates.** Attendance from `fans/`, star power
  from `getPlayerValueTier`, payroll from the cap engine, playoff depth from
  `PlayoffSeries`. No parallel truth anywhere.
- **The cap guardrail holds.** Checked specifically: nothing in finance grants
  cap space or unlocks a roster move. Money is pressure, never a bypass. That
  design commitment survived contact with six systems.
- **No dead systems.** `FinancialSnapshot`, `BusinessLedgerEntry`,
  `CapitalProject`, `SponsorshipDeal`, `BusinessDecision` and `Negotiation` are
  each both written and read. This was the failure mode most expected and it is
  absent.
- **Units are safe.** Cents-as-numbers peaks near 5×10¹¹, far inside the 9×10¹⁵
  safe-integer range; BigInt conversion happens only at the Prisma boundary.
- **Debt has real repayment** (`financing.ts`), not just accumulation.

---

## Prioritised plan

**Stage 1 — fix the input, then re-measure**

1. P0-1: correct payroll calibration (`scoreToCapFraction`). Re-run the replay
   before touching any finance constant.

**Stage 2 — the two real finance defects**

2. P0-3: bound the cash contribution to franchise value.
3. P0-2: give insolvency a consequence — owner bailout at a confidence cost, a
   forced salary dump, or ending the save.

**Stage 3 — only if still warranted after Stage 1**

4. P2-6: graduated luxury tax with a revenue-sharing offset.
5. P1-5: salary floor with the CBA's own penalty.
6. P1-4: let winning move revenue.

P2-7 and anything beyond (local TV negotiation, dynamic CPU business strategy)
is new scope rather than refinement, and should stay closed unless the pillar
still feels thin after the above.

---

## Limitations

- **Fresh-league state only.** Every team at fanHappiness 65, no playoffs, no
  resolved business decisions. Real saves diverge; these are opening positions.
- **Staff cost is an estimate** ($12M per team). Actual staff contracts were not
  traced, so the expense side carries that uncertainty.
- **The business-decision catalogue was not audited** — 1,083 lines of card
  content in `businessDecisions.ts`. Whether the choices are balanced, or whether
  any option strictly dominates, is a separate pass.
- **Real-NBA comparison figures are from memory**, not a fetched dataset. The
  relative conclusions hold regardless; the exact percentages deserve a real
  source before they are cited anywhere load-bearing.
- **No live save was queried.** Everything here is a replay of the bootstrap
  path over committed fixture data.
