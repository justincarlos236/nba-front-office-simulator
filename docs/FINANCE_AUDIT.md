# Franchise Finances — Audit

**Date:** 2026-08-11 · **Method:** code trace across all 14 finance modules and
4 finance actions, plus a replay of the real money model over the committed
537-player fixture — 30 teams, real markets, real generated payrolls, and a
15-season projection of cash and debt.

Every figure below was measured by running the shipped functions, not read off
a comment. Where a claim rests on inspection alone, it says so.

Fourth audit in the refinement phase. It inherits, prices, and then fixes the
payroll-calibration question the Cap/Roster work deliberately deferred.

**Status:** all three P0s fixed 2026-08-11 and re-measured, each recorded
inline below — P0-1 including a correction to this audit's own attribution, and
P0-2 including a correction to its own numbers. P1 and below remain open.

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

Both genuine finance-side defects are now fixed as well: franchise value no
longer tracks the bank balance, and insolvency finally costs something — the
owner covers the shortfall and thinks less of you for it, which compounds into
the existing firing check.

**What remains is design, not correctness.** Revenue barely responds to anything
the player does, there is no salary floor, and the luxury tax is flat. The model
is now sound; it is not yet a deep business game.

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

Before → after all three P0 fixes. Gameplay depth and structure are untouched,
so those scores are unchanged.

| Dimension          | Score          | Note                                                                               |
| ------------------ | -------------- | ---------------------------------------------------------------------------------- |
| **Overall**        | **6 → 8.5/10** | Solvent, realistic, bounded, with a real failure state; shallow as a business game |
| Calibration        | 8 → **10/10**  | League payroll within 1.2% of real, net income within 7%                           |
| Correctness        | 7 → **9/10**   | No known modelling defects left; remaining gaps are design choices                 |
| Long-run stability | 3 → **8/10**   | Downside bounded by the bailout; cash still compounds upward without limit         |
| Gameplay depth     | 5/10           | Revenue barely responds to anything the player does                                |
| Structure          | 9/10           | Pure money model, zero Prisma, fully consumed by the app                           |
| Test confidence    | 6 → **8/10**   | 15 regressions added across the three fixes; multi-season shape still untested     |

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

### P0-2 — Unbounded debt spiral, and no failure state — FIXED

**This finding's original numbers were wrong twice over, and are corrected
here.** They were measured against the pre-P0-1 inflated payrolls, and the debt
column misread the CPU loan policy — the audit said teams borrow "$90M at a time"
to a $1.35B balance, but `shouldCpuTakeLoan` takes a **SMALL** loan, $15M, and
the worst team in the league reaches $135M of debt, not $1.35B. An order of
magnitude. Re-measured 2026-08-11 against corrected payrolls:

| Payroll assumption            | Teams with negative cash at S15 | Worst team | Total league debt |
| ----------------------------- | ------------------------------- | ---------- | ----------------- |
| Held flat (as originally run) | **3 / 30**                      | −$0.68B    | $0.27B            |
| +5%/yr, tracking cap growth   | **15 / 30**                     | −$3.43B    | $0.66B            |

**The finding survives, but its shape has changed.** The debt spiral is far
milder than first reported — debt is a rounding error against the deficits, because
$15M loans cannot fund a $108M annual loss. What actually diverges is **cash**,
and it diverges at the _top_ more than the bottom: Houston reaches **+$3.71B**
against Milwaukee's −$0.68B, a **$4.39B** spread across a league whose franchises
are supposed to be broadly comparable.

Which assumption is right matters enormously, and neither is verified — this is
the single biggest open question in the finance model. Payroll held flat is
optimistic here, not pessimistic as originally stated: it lets revenue grow with
the cap while costs stand still. Payroll tracking cap growth is the realistic
case, and it puts half the league underwater.

Nothing stops either end. There is no bankruptcy, no forced sale, no owner
bailout, no hard payroll constraint. `financialSpendingResistance` returns 1.5×
at negative cash — a nudge on _adding_ salary that cannot shed a contract already
signed.

**Gameplay impact — this was the reason it was a P0.** Insolvency meant nothing.
A franchise could run −$3.4B and keep playing exactly as before.

**Fix — an owner bailout, priced in confidence.** `resolveOwnerBailout` in
`finances.ts`: below −$50M the owner covers the shortfall and leaves a small
cushion, charging the user roughly 0.3 owner-confidence per $1M he had to find
(floor 8, ceiling 30). It is automatic rather than offered, deliberately — a
loan, a capital call and distressed financing are all things you _decide_ to do,
and being bailed out is the consequence of having run out of decisions. It is
priced worse than a capital call (~0.23/$1M) because you did not ask for it.

Repeated bailouts compound into the existing `MIN_OWNER_CONFIDENCE` firing
check rather than needing a separate failure path, so the confidence cost is
applied in `advanceSeasonAction` where confidence is already owned and clamped.
For CPU teams the bailout is a pure bound — no confidence exists to charge.

| 15 seasons              | Negative cash at S15 | Worst team | Bailouts (worst team) |
| ----------------------- | -------------------- | ---------- | --------------------- |
| Payroll flat — before   | 3 / 30               | −$0.68B    | —                     |
| Payroll flat — after    | **2 / 30**           | −$0.02B    | 5                     |
| Payroll +5%/yr — before | 15 / 30              | −$3.43B    | —                     |
| Payroll +5%/yr — after  | **0 / 30**           | +$0.01B    | 14                    |

Milwaukee needing 14 rescues in 15 seasons is the system working: a user
franchise run that badly is fired long before season 15. CPU bailout news is
filed at MINOR so a chronically broke team fills the wire rather than repeatedly
leading the page; the user's own is BREAKING.

**What this does _not_ fix.** Only the downside is bounded. Cash still diverges
upward — Houston reaches +$3.0B — and that is P1-4 and P1-5's territory
(unresponsive revenue, no salary floor), not a failure state. P0-3 bounded the
_valuation_ consequence of that runaway, so franchise values cluster sensibly
between $2.0B and $4.3B while the balances behind them still span $3.0B.

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

### P1-5 — Still no salary floor — FIXED

Carried from the cap audit, and it mattered more here. Nothing forced minimum
spending and no penalty existed. Houston's $104.5M payroll — roughly $35M below
a real 90%-of-cap floor — was rewarded with the best net income in the league.

**The most profitable strategy available was to field a cheap team**, and the
finance model offered no resistance.

**Fix — the CBA's own penalty, which needed nothing invented.** A team ending
the season below the minimum team salary pays the shortfall anyway, split among
the players on its roster. So there is no fine to design and no multiplier to
tune: the penalty is simply that being cheap does not save you the money.
`salaryFloorCents` derives the floor as 90% of the cap rather than hand-entering
it per season, because that is how the CBA defines it.

It is its own expense bucket rather than an inflation of `payrollCents`, since
payroll is the cap-sheet figure and has to keep matching the cap engine — this
is money leaving the franchise that was never a cap charge.

| Season one         | Payroll | Before     | After        |
| ------------------ | ------- | ---------- | ------------ |
| Houston (cheapest) | $104.5M | +$239.5M   | **+$204.9M** |
| Philadelphia       | $144.4M | +$199.7M   | +$199.7M     |
| Gap                | —       | **$39.8M** | **$5.2M**    |

Five teams pay a shortfall. Note what the rule does and does not do: Houston is
still the most profitable team in the league, by $5.2M instead of $39.8M. That
is the real rule working the way it really works — it removes the advantage of
being cheap without turning frugality into a loss. Making a cheap team
_unprofitable_ would have required inventing a penalty the CBA does not have.

**Knock-on fix.** The finances report page was summing only five of its eight
persisted expense buckets, so any team carrying debt saw a total that did not
reconcile with its own net income. Adding this bucket to that list meant fixing
the omission rather than adding to it; debt interest and business costs now
appear too, when non-zero.

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

**~~Stage 2 — the two real finance defects~~ — DONE**

2. ~~P0-3: bound the cash contribution to franchise value.~~ Done — saturating
   curve, ordinary balances unchanged.
3. ~~P0-2: give insolvency a consequence.~~ Done — automatic owner bailout
   priced in confidence, compounding into the existing firing check. The
   projection was re-run against corrected payrolls first, which is what caught
   this finding's own numbers being wrong.

**Stage 3 — the remaining work, all design rather than correctness**

4. P2-6: graduated luxury tax with a revenue-sharing offset. Still warranted —
   the six unprofitable teams are five SMALL/MID markets and Cleveland, which is
   exactly the asymmetry revenue sharing exists to correct.
5. ~~P1-5: salary floor with the CBA's own penalty.~~ Done — the shortfall is
   paid to the players, exactly as the CBA writes it.
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


---

# GAMEPLAY DEPTH RE-MEASURED — 2026-08-16

The scorecard above rates **gameplay depth 5/10**, "revenue barely responds to
anything the player does". That predates the Finances as a Gameplay Pillar
work — business decisions (Phase 1), sponsorship deals (Phase 2), capital
projects, and front-office departments (Phase 4) — none of which existed when it
was written. Nothing had re-measured it.

Sweeping every input of `computeSeasonRevenue` from a mid-market baseline of
$318.3M:

| Lever | Swing | % of baseline | Player-controlled? |
| --- | ---: | ---: | --- |
| Market size (SMALL → LARGE) | $121.9M | **38.3%** | no — fixed at team selection |
| Playoff home games (0 → 12) | $48.0M | 15.1% | indirect — winning |
| **Sponsorship ($0 → $40M)** | **$40.0M** | **12.6%** | **yes — direct** |
| Attendance (70% → 100%) | $33.0M | 10.4% | indirect — winning |
| Popularity (30 → 95) | $27.3M | 8.6% | indirect — winning |
| **Ticket posture (fan-friendly → premium)** | **$21.8M** | **6.8%** | **yes — direct** |
| **Business income ($0 → $15M)** | **$15.0M** | **4.7%** | **yes — direct** |
| Championship | $12.0M | 3.8% | indirect — winning |
| Star tier (none → superstar) | $7.8M | 2.4% | yes — roster |

**Directly controllable levers move about 24% of revenue** and winning drives
another ~38%. The expense side adds more: department budgets and business
decisions are both player-set line items in `SeasonExpenseInputs`.

So "revenue barely responds" is no longer true.

## What is still fair in the original criticism

**Market size remains the single largest determinant at 38.3%** — larger than
every player-controlled lever combined, and fixed once a team is chosen. A
small-market club cannot out-earn a large-market one by managing well; it can
only close part of the gap. That is arguably realistic, and it is also the
reason this does not score higher.

## Rescored

| Dimension | Was | Now | Why |
| --- | ---: | ---: | --- |
| **Gameplay depth** | **5/10** | **7/10** | Three direct revenue levers worth ~24% of the total, plus player-set department budgets on the expense side. Held at 7 because market size still outweighs everything the player decides. |

> **Scope.** This measures whether the revenue *model* responds to its inputs.
> Whether the decisions behind those inputs are *interesting* is a design
> judgement a sweep cannot make, and is not claimed here.
