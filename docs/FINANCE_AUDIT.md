# Franchise Finances — Audit

**Date:** 2026-08-11 · **Method:** code trace across all 14 finance modules and
4 finance actions, plus a replay of the real money model over the committed
537-player fixture — 30 teams, real markets, real generated payrolls, and a
15-season projection of cash and debt.

Every figure below was measured by running the shipped functions, not read off
a comment. Where a claim rests on inspection alone, it says so.

Fourth audit in the refinement phase. It inherits, prices, and then fixes the
payroll-calibration question the Cap/Roster work deliberately deferred.

**Status:** P0-1 and P0-3 fixed 2026-08-11 and re-measured; both fixes are
recorded inline below, P0-1 including a correction to this audit's own
attribution. P0-2 and everything below it remain open.

---

## Verdict

**Well built and well calibrated — and it was reporting a defect that lived two
modules upstream, in a rating formula that mistook backup centres for MVPs.**

The audit's original headline was that 17 of 30 teams lose money. That is now
fixed, and no finance constant was touched to fix it: the money model was right
all along. What was wrong was what it was being fed.

The audit also got the attribution wrong on the way to being right about the
symptom — it named `scoreToCapFraction`, and correcting that curve would have
made the league _poorer_, not more realistic. See P0-1.

Of the two genuine finance-side defects, franchise value being swallowed by
hoarded cash is now fixed. **One P0 remains open: the debt spiral has no failure
state** — a franchise can run −$3.7B and keep playing exactly as before, which is
what still drains the pillar of stakes.

---

## The measurement that decided everything

Same model, same teams, same everything — only payroll changes.

|                                         | Profitable    | League net income | Median team | Worst team |
| --------------------------------------- | ------------- | ----------------- | ----------- | ---------- |
| **Payrolls as audited** (median ~$213M) | **13 / 30**   | **−$441.5M**      | −$12.6M     | −$290.3M   |
| **Payrolls as fixed** (median ~$168M)   | **24 / 30**   | **+$2.14B**       | +$70.9M     | −$108.0M   |
| _Real NBA_                              | _~20–25 / 30_ | _~+$2B_           | _~+$70M_    | —          |

Milwaukee was the clearest case. Payroll **$304.4M** against a **$187.9M** tax
line produced a **$174.8M** tax bill on **$268.9M** of total revenue — the tax
alone was 65% of everything the franchise earned. Its payroll is now $231.5M.

Note the direction of the error. The model's flat **1.5×** tax multiplier is
_more forgiving_ than the real CBA's graduated 1.5×–4.75× with repeater
penalties. A lenient tax still bankrupted a third of the league, which isolated
the cause beyond argument: payroll, not the tax.

---

## Scores

Before → after P0-1 and P0-3. Gameplay depth and structure are untouched by both
fixes, so those scores are unchanged.

| Dimension          | Score         | Note                                                                         |
| ------------------ | ------------- | ---------------------------------------------------------------------------- |
| **Overall**        | **6 → 8/10**  | Solvent, realistic, bounded at one end; insolvency still costs nothing       |
| Calibration        | 8 → **10/10** | League payroll within 1.2% of real, net income within 7%                     |
| Correctness        | 7 → **8/10**  | One modelling defect left: insolvency has no consequence                     |
| Long-run stability | 3 → **6/10**  | Cash no longer diverges in value terms; debt still does                      |
| Gameplay depth     | 5/10          | Revenue barely responds to anything the player does                          |
| Structure          | 9/10          | Pure money model, zero Prisma, fully consumed by the app                     |
| Test confidence    | 6 → **8/10**  | Eight regressions added across both fixes; multi-season shape still untested |

---

## Findings

### P0-1 — The league is insolvent, and the cause is upstream — FIXED

**Observed.** 13/30 teams profitable, league-wide net income −$441.5M, six teams
with negative cash at the end of season one.

**Root cause — and a correction to this audit.** This finding originally named
`scoreToCapFraction` as the culprit, inheriting that attribution from the cap
work. **That was wrong, and it was wrong in a way that would have made things
worse.** Sweeping the curve's `MIDPOINT`/`STEEPNESS` against real 2025-26 league
payroll showed the shipped values were already close to correct: at 0.35/80/0.17
the simulated league total came out within 1.2% of the real $5.1B once the true
defect was fixed, and every alternative tried was 17–45% _too low_. Retuning the
curve, as this audit instructed, would have broken a component that was right.

The actual defect was in `computePerformanceScore`, two modules upstream:

1. **Shooting efficiency was not weighted by shooting volume.** The true-shooting
   term applied in full to a player taking four shots a night. Measured on the
   seeded roster, Ryan Kalkbrenner (7.5 ppg, .762 TS) drew **+28.3** from this
   one term and Jaxson Hayes (7.5 ppg, .758) **+27.7**, against **+15.3** for
   Jokić and **+14.7** for SGA. A backup centre earned nearly double the MVP's
   efficiency bonus, and every other term combined moved him under a point.
2. **Per-36 rates were extrapolated without limit.** A 17-minute player's rates
   were multiplied by 2.1 and taken as fact.

Together these clamped nine players to the 99 ceiling, five of them backup
centres, and the contract generator paid them accordingly.

**Fix.** Efficiency is now scaled by scoring volume against the formula's own
15-ppg baseline, and rate extrapolation is capped at `36 / 24` — one claim,
"24 minutes is a full workload", stated twice. `scoreToCapFraction` was left
untouched. Four regression tests were added and verified to fail on the previous
version; the whole 1,306-test suite passes.

**Validation — the prediction held.** Re-running the replay with no finance
constant changed:

|                    | Before   | After       | Predicted | Real NBA  |
| ------------------ | -------- | ----------- | --------- | --------- |
| Profitable         | 13/30    | **24/30**   | ~25/30    | ~20–25/30 |
| League net income  | −$441.5M | **+$2.14B** | —         | ~+$2B     |
| Median team        | −$12.6M  | **+$70.9M** | ~+$66M    | ~+$70M    |
| League payroll     | $6.54B   | **$5.16B**  | —         | $5.10B    |
| Teams over apron 2 | 16/30    | 6/30        | —         | 1/30      |

Reproduce with `npx tsx scripts/payroll-calibration.ts`.

**Two side-effects worth recording.** The same score drives All-Star selection
and award voting, so both were carrying the same bias — a 24-man All-Star field
now contains 19 genuine 85+ players and one sub-24-minute player. And the
remaining shape error is no longer calibration: the model still has too many
players in the $30–45M band and too many at the floor, because it prices every
player at market value, where real teams sign many below market for cap reasons.
That is a structural gap, not a constant to tune.

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

### P0-3 — Franchise value becomes a function of hoarded cash — FIXED

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

**Fix.** Diminishing returns rather than a hard ceiling, so there is no cliff
where one more dollar of cash abruptly stops counting. The contribution now
saturates toward `MAX_CASH_VALUE_CONTRIBUTION` ($400M), with the saturation
constant _derived_ so the curve's slope at zero is exactly the old
`CASH_VALUE_WEIGHT` — ordinary balances behave as they always did, and only the
runaway end is bounded.

| Cash reserve        | Old contribution | New         |
| ------------------- | ---------------- | ----------- |
| $120M (fresh save)  | $60.0M           | $52.2M      |
| $300M               | $150.0M          | $109.1M     |
| $1.0B               | $500.0M          | $222.2M     |
| $3.68B (P0-2's HOU) | **$1,840M**      | **$328.6M** |
| $10B                | $5,000M          | $370.4M     |

**Validation.** Four tests added, two of which were verified to fail on the
previous version; the other two assert that the ordinary case is _unchanged_,
which is the point of deriving the saturation constant rather than picking it.
Against a MID market's $2.4B baseline, even $10B in the bank now moves franchise
value less than a championship does.

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

**~~Stage 1 — fix the input, then re-measure~~ — DONE**

1. ~~P0-1: correct payroll calibration.~~ Fixed in `computePerformanceScore`,
   not `scoreToCapFraction`; the curve was already right. 24/30 profitable.

**Stage 2 — the two real finance defects — half done**

2. ~~P0-3: bound the cash contribution to franchise value.~~ Done — saturating
   curve, ordinary balances unchanged.
3. P0-2: give insolvency a consequence — owner bailout at a confidence cost, a
   forced salary dump, or ending the save. Note that Stage 1 changed the shape
   of this problem rather than removing it: six teams still lose money in season
   one, and the P0-2 projection should be re-run against the new payrolls before
   any fix is designed against its old numbers.

**Stage 3 — only if still warranted after Stage 1**

4. P2-6: graduated luxury tax with a revenue-sharing offset. Still warranted —
   the six unprofitable teams are five SMALL/MID markets and Cleveland, which is
   exactly the asymmetry revenue sharing exists to correct.
5. P1-5: salary floor with the CBA's own penalty. Still warranted — Houston is
   at $104.5M and is now the _most_ profitable team in the league at +$239.5M.
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
- **Real-NBA comparison figures started as memory and were later sourced.** The
  original draft of this audit cited remembered numbers, flagged as such. The
  P0-1 fix needed a real target, so the payroll figures now come from published
  sources and live in `src/lib/valuation/realPayrollShape.ts` with their
  provenance. That module records only what two independent sources agreed on —
  public payroll trackers disagreed by as much as $60M on individual teams, so
  no per-team table is claimed, only the aggregate shape.
- **Team-level net income figures are not directly comparable to real NBA
  ones.** The league's own franchises do not publish audited accounts; the
  ~$2B/~$70M comparisons are against widely-reported estimates, and the model's
  expense side omits things a real P&L carries (arena debt service, non-basketball
  staff, amortisation).
- **No live save was queried.** Everything here is a replay of the bootstrap
  path over committed fixture data.
