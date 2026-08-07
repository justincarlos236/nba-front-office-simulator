# Deep Dive 05 — Finances, Fans & Morale

Folders: `src/lib/finances/`, `src/lib/fans/`, `src/lib/morale/`. All pure. These three
**consume signals other systems already produce** rather than re-simulating — that's the
recurring design theme here. **Code blocks are real source.**

---

# `finances/` — the money model

`finances.ts` header sums up the philosophy: _"a consumer of signals other systems
already produce (attendance/popularity from fans, star power from getPlayerValueTier,
market from the Team fixture, payroll from the cap engine, playoff depth from
PlayoffSeries)… Money is pressure and consequence, never a cap bypass."_ Amounts are
**cents as plain numbers** (a season tops out ~$500M = 5e10, inside JS's safe integer
range), converted to `BigInt` only at the Prisma boundary. `const M = 1_000_000 * 100`
= one million dollars in cents.

## Revenue — `computeSeasonRevenue`

```ts
const MARKET_GATE_BASELINE = { LARGE: 150 * M, MID: 110 * M, SMALL: 85 * M };
const MARKET_MEDIA_BASELINE = { LARGE: 165 * M, MID: 120 * M, SMALL: 95 * M };
const LEAGUE_REVENUE_BASE = 90 * M; // national TV / revenue sharing floor
const SMALL_MARKET_REVENUE_SHARING_BOOST = 12 * M;
const PLAYOFF_GATE_PER_HOME_GAME = { LARGE: 6 * M, MID: 4 * M, SMALL: 3 * M };
const CHAMPIONSHIP_BONUS = 12 * M;
const TICKET_POSTURE_REVENUE_MULTIPLIER = { FAN_FRIENDLY: 0.9, STANDARD: 1.0, PREMIUM: 1.12 };
const STAR_SPONSORSHIP_BONUS = { SUPERSTAR: 0.06, STAR: 0.03, STARTER: 0, ROTATION: 0, MINIMUM: 0 };

export function computeSeasonRevenue(inputs: SeasonRevenueInputs): SeasonRevenue {
  const ticketCents = Math.round(
    MARKET_GATE_BASELINE[inputs.marketSize] *
      inputs.attendancePct *
      TICKET_POSTURE_REVENUE_MULTIPLIER[inputs.ticketPosture],
  );
  const popularityFactor = 0.85 + (inputs.franchisePopularity / 100) * 0.35;
  const starBonus = inputs.starTier ? STAR_SPONSORSHIP_BONUS[inputs.starTier] : 0;
  const mediaCents = Math.round(
    MARKET_MEDIA_BASELINE[inputs.marketSize] * popularityFactor * (1 + starBonus),
  );
  const playoffCents =
    inputs.playoffHomeGames * PLAYOFF_GATE_PER_HOME_GAME[inputs.marketSize] +
    (inputs.wonChampionship ? CHAMPIONSHIP_BONUS : 0);
  const leagueCents =
    LEAGUE_REVENUE_BASE + (inputs.marketSize === "SMALL" ? SMALL_MARKET_REVENUE_SHARING_BOOST : 0);
  return {
    ticketCents,
    mediaCents,
    playoffCents,
    leagueCents,
    totalCents: ticketCents + mediaCents + playoffCents + leagueCents,
  };
}
```

**Four revenue buckets:** gate (baseline × **attendance from the fans model** × posture),
media (× popularity × a small star bump), playoff gate (home playoff games × per-game
gate + a title bonus — so deep runs pay), and a flat league distribution floor (small
markets get a sharing boost) that keeps a struggling team operational. Note `attendancePct`
is _consumed_ from `computeAttendancePct`, never re-derived.

## Expenses & net income

```ts
const LUXURY_TAX_MULTIPLIER = 1.5; // real tax is graduated 1.5x-4.75x; one coarse multiplier
const INVESTMENT_COST = { MINIMAL: 2 * M, STANDARD: 6 * M, PREMIUM: 14 * M };
const MARKET_OPERATING_BASELINE = { LARGE: 70 * M, MID: 58 * M, SMALL: 50 * M };

export function computeLuxuryTax(payrollCents, luxuryTaxLineCents): number {
  const over = payrollCents - luxuryTaxLineCents;
  return over > 0 ? Math.round(over * LUXURY_TAX_MULTIPLIER) : 0;
}
export function computeNetIncome(revenue, expenses): number {
  return revenue.totalCents - expenses.totalCents;
}
```

Expenses = payroll + luxury tax (only on the amount over the tax line) + staff salaries +
investment spend (the two levers) + a flat market operating baseline. Net income is just
revenue − expenses.

## Financial health & franchise value

```ts
const NET_STRAINED = -20 * M,
  NET_HEALTHY = 20 * M,
  NET_THRIVING = 80 * M;
export function computeFinancialHealth(cashReserveCents, netIncomeCents): FinancialHealth {
  if (cashReserveCents < 0) return "IN_THE_RED";
  if (netIncomeCents < NET_STRAINED) return "STRAINED";
  if (netIncomeCents >= NET_THRIVING) return "THRIVING";
  if (netIncomeCents >= NET_HEALTHY) return "HEALTHY";
  return "STABLE";
}

const MARKET_VALUE_BASELINE = { LARGE: 3_500 * M, MID: 2_400 * M, SMALL: 1_900 * M };
const VALUE_SMOOTHING_PRIOR = 0.75,
  VALUE_SMOOTHING_TARGET = 0.25;
export function computeFranchiseValue(inputs: FranchiseValueInputs): number {
  const popularityFactor = 0.8 + (inputs.franchisePopularity / 100) * 0.4;
  const contentionFactor = 1 + inputs.playoffOutcomeIndex * 0.03;
  const iconFactor = 1 + (inputs.iconPremiumFraction ?? 0);
  const cashComponent = Math.max(0, inputs.cashReserveCents) * 0.5;
  const target = Math.round(
    MARKET_VALUE_BASELINE[inputs.marketSize] * popularityFactor * contentionFactor * iconFactor +
      cashComponent,
  );
  if (inputs.priorValueCents <= 0) return target;
  return Math.round(
    inputs.priorValueCents * VALUE_SMOOTHING_PRIOR + target * VALUE_SMOOTHING_TARGET,
  ); // slow blend
}
```

Franchise value is a **slow-moving asset**: each season it blends 75% of last value with
25% of a freshly computed target (market × popularity × contention × icon premium + a bit
of cash), so it appreciates like a real asset instead of whipsawing.

## CPU & bootstrap helpers, and the levers

```ts
export function financialSpendingResistance(cashReserveCents: number): number {
  if (cashReserveCents < 0) return 1.5; // in the red → sheds salary
  if (cashReserveCents < 25 * M) return 1.2; // thin cushion → cautious
  return 1.0; // healthy → spends freely
}
export function pickCpuTicketPosture(marketSize): TicketPricingPosture {
  if (marketSize === "LARGE") return "PREMIUM";
  if (marketSize === "SMALL") return "FAN_FRIENDLY";
  return "STANDARD";
}
export const TICKET_POSTURE_FAN_DELTA = { FAN_FRIENDLY: 2, STANDARD: 0, PREMIUM: -3 }; // the pricing tradeoff
export const INVESTMENT_QUALITY_DELTA = { MINIMAL: -6, STANDARD: 0, PREMIUM: 8 }; // feeds development / injury systems
```

`financialSpendingResistance` is the multiplier that makes a cash-strapped CPU team pickier
about _adding_ salary (used in `reSigningDecision`). The two lever tables show the
tradeoffs: PREMIUM pricing earns more revenue but costs fan happiness; PREMIUM investment
costs cash but improves player development / lowers injuries.

## `finances/franchiseIcon.ts` — value beyond production

```ts
const STAR_TIER_BASE = { SUPERSTAR: 55, STAR: 40, STARTER: 22, ROTATION: 10, MINIMUM: 5 };
export function computeFranchiseIconScore(input: FranchiseIconInput): number {
  const base = STAR_TIER_BASE[input.starTier];
  const tenureBonus = Math.min(12, Math.max(0, input.tenureSeasons)) * 2.5;
  const homegrownBonus = input.homegrown ? 12 : 0;
  const awardBonus = Math.min(8, Math.max(0, input.careerAwards)) * 2.5;
  return Math.round(Math.max(0, Math.min(100, base + tenureBonus + homegrownBonus + awardBonus)));
}

export function computeIconDepartureImpact(iconScore: number): IconDepartureImpact {
  if (iconScore < ICON_DEPARTURE_THRESHOLD)
    return { notable: false, franchiseValueHitCents: 0, fanHappinessHit: 0 };
  const intensity = (iconScore - 50) / (100 - 50); // 0 at threshold, 1 at a max icon
  return {
    notable: true,
    franchiseValueHitCents: Math.round(80 * M + intensity * 320 * M),
    fanHappinessHit: -(4 + Math.round(intensity * 8)),
  };
}
```

A **derived** icon score (never a user label): star tier + tenure + homegrown + awards. It
distinguishes a homegrown, decorated 10-year legend from a superstar acquired at the
deadline — and `computeIconDepartureImpact` is why trading away the former is a
"business earthquake" (up to a $400M value hit + fan drop) while moving a role player does
nothing. `iconValuePremiumFraction` (up to +0.18) is the value premium a marquee icon adds
each season.

## `finances/ownershipFinance.ts` (briefly)

`computeFinancialStanding(recentNetIncome[], cash)` → `STRONG…DISTRESSED`, which
`financialStandingPatienceFactor` and `financialStandingConfidenceBonus` feed into the
owner-confidence system: a financially strong franchise earns patience and backing to
spend into the tax; sustained losses issue an escalating "return to profitability"
mandate (`League.financialMandateSeason`) that can push toward firing. `financeNews.ts`
turns the season P&L into the news feed; `formatFinance.ts` formats cents for display.

## `finances/businessDecisions.ts` — the Front Office Inbox card catalog

```ts
export interface BusinessDecisionOption {
  id: string;
  label: string;
  description: string;
  cashDeltaCents: number;
  fanHappinessDelta: number;
  ownerConfidenceDelta: number;
}

const CATALOG: CatalogEntry[] = [
  {
    kind: "TICKETING_SCANDAL",
    severity: "BREAKING",
    eligible: (ctx) => ctx.ticketPricingPosture === "PREMIUM",
    build: () => ({
      headline: "Ticketing scandal breaks",
      options: [
        {
          id: "refund-fans",
          label: "Refund affected fans",
          cashDeltaCents: -3 * M,
          fanHappinessDelta: 4,
          ownerConfidenceDelta: -1,
        },
        {
          id: "deny-wrongdoing",
          label: "Deny wrongdoing",
          cashDeltaCents: 0,
          fanHappinessDelta: -6,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "deny-wrongdoing",
    }),
  },
  // ...7 more cards
];

export function rollForBusinessDecision(
  ctx: BusinessDecisionContext,
  rng = Math.random,
): BusinessDecisionContent | null {
  const eligible = CATALOG.filter((c) => c.eligible(ctx));
  if (eligible.length === 0) return null;
  const chosen = eligible[Math.floor(rng() * eligible.length)];
  return {
    kind: chosen.kind,
    severity: chosen.severity,
    deadlineDays: DEADLINE_DAYS_BY_SEVERITY[chosen.severity],
    ...chosen.build(ctx),
  };
}
```

**Finances as a Gameplay Pillar (Phase 1).** This is System 7 from
`docs/FINANCES_PILLAR_DESIGN.md` — the weighted card deck rolled during
simulation so the finance side generates decisions instead of waiting to be
visited. Every card is gated on real state (`ticketPricingPosture`,
`fanHappiness`, `hasStarPlayer`) computed by the caller, never invented
here — same "pure content generation over already-computed signals"
philosophy as the rest of this file. The catalog is a plain array precisely
so growing it later is a data change, not an architecture change. A
property test (`businessDecisions.test.ts`) checks every option on every
card is never free and never strictly dominates a sibling option — the
actual enforcement of "no obvious optimal choice" from the design brief.

`applyBusinessDecisionEvents` (`src/lib/actions/leagueEvents.ts`) is the
thin DB shell around this: called once per simulated batch, it rolls a
`shouldTriggerEvent`-gated chance at a new card (same convention as the
existing CPU-trade/signing rolls), capped at `MAX_PENDING_BUSINESS_DECISIONS`
so an ignored inbox can't flood, and separately auto-resolves anything past
its `deadlineDayIndex` to the card's own default option — the "ignoring the
business side has a real cost" mechanic. If a freshly-rolled or still-
pending card is `BREAKING` severity, it reports that back up so
`simulateGamesAction` halts the batch loop, the same "must resolve before
continuing" shape the All-Star-weekend `PENDING` gate already established.

---

# `fans/` — fan happiness & attendance

## `fans/fanHappiness.ts`

```ts
const VERDICT_DELTA = { EXCEEDED: 10, MET: 2, FELL_SHORT: -8, DRASTICALLY_FELL_SHORT: -18 };
const STAR_POWER_DELTA = { SUPERSTAR: 4, STAR: 2, STARTER: 0, ROTATION: -1, MINIMUM: -2 };

export function computeFanHappinessDelta(inputs: FanHappinessInputs): number {
  const outcomeDelta = inputs.evaluationVerdict
    ? VERDICT_DELTA[inputs.evaluationVerdict]
    : (inputs.teamWinPct - 0.5) * 20;
  const transactionDelta = clamp(inputs.transactionSentiment * 3, -15, 15);
  const starPowerDelta = inputs.starPowerTier ? STAR_POWER_DELTA[inputs.starPowerTier] : 0;
  const coachStyleDelta = inputs.coachStyle ? COACH_STYLE_DELTA[inputs.coachStyle] : 0;
  return Math.round(outcomeDelta + transactionDelta + starPowerDelta + coachStyleDelta);
}
```

Fan happiness is **separate** from owner confidence (fans weigh excitement/stars/patience;
owners weigh spending vs. results) but **reuses the same `EvaluationVerdict`** — a
rebuilding fanbase with a low expectation reads a modest record as MET/EXCEEDED, so
"patience while rebuilding" is free, no separate model. For CPU teams (no user
expectation) it falls back to win%.

Two derived, presentational numbers other systems consume:

```ts
export function computeFranchisePopularity(fanHappiness, starPowerTier, marketSize): number {
  const starScore = STAR_POWER_SCORE[starPowerTier ?? "STARTER"];
  const base = fanHappiness * 0.6 + starScore * 0.4;
  return Math.round(clamp(base * MARKET_SIZE_POPULARITY_MULTIPLIER[marketSize], 0, 100));
}
export function computeAttendancePct(fanHappiness, marketSize): number {
  const happinessAdjustment = ((fanHappiness - 65) / 100) * 0.3;
  return clamp(MARKET_SIZE_ATTENDANCE_BASELINE[marketSize] + happinessAdjustment, 0.3, 1.0);
}
```

`computeFranchisePopularity` (½ happiness, ½ star power, market-adjusted) and
`computeAttendancePct` (a market baseline nudged by happiness, large markets keep a higher
floor) are exactly the inputs the finance model reads for media and gate revenue.
`getFranchisePopularityTier` buckets popularity into `TRENDING…WEAK` for the UI.

## `fans/sentimentEvents.ts` / `transactionSentiment.ts` / `fanReactions.ts` (briefly)

Per-event fan-happiness deltas (a trade, a signing, a big win streak) applied inline where
the event happens — the same pure-delta pattern as morale below. `transactionSentiment`
sums a season's events into the `transactionSentiment` input above.

---

# `morale/` — player morale & personality

## `morale/generatePersonality.ts`

```ts
export interface PlayerPersonalityAxes {
  competitiveness: number; // team success/fit weight
  roleSensitivity: number; // role/minutes change weight
  loyalty: number; // higher = slower to sour, more forgiving
  financialMotivation: number; // pay/contract weight
}
const MIN_AXIS_VALUE = 10,
  MAX_AXIS_VALUE = 95; // bounded away from 0/100

export function generatePersonalityProfile(leaguePlayerId: string): PlayerPersonalityAxes {
  const rng = createSeededRandom(`${leaguePlayerId}-personality`); // deterministic per player
  return {
    competitiveness: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    roleSensitivity: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    loyalty: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    financialMotivation: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
  };
}
```

**Four independent 0–100 axes** (unlike `GmPersonality`'s single archetype), generated once
per player, seeded off the player id so it's stable and reproducible.
`describePersonalityLabel` derives a cosmetic label ("Ring Chaser," "Mercenary," "Diva")
from the axes on read (never stored) — the same "derive a label from real data" pattern as
`getPlayerValueTier`.

## `morale/moraleEvents.ts`

The axes turn into a weight, and every event is a bounded, personality-weighted delta:

```ts
function axisWeight(axisValue: number): number {
  return 0.5 + axisValue / 100; // 0.5x (axis 0) … 1.5x (axis 100); never zero
}

export function computeRoleChangeMoraleDelta(input: RoleChangeMoraleInput): number {
  const rankDelta =
    ROLE_RANK[input.newRole ?? "BENCH_PLAYER"] - ROLE_RANK[input.previousRole ?? "BENCH_PLAYER"];
  if (rankDelta === 0) return 0;
  const baseDelta = rankDelta * 4; // one rank step = 4 raw
  const sensitivity = axisWeight(input.personality.roleSensitivity);
  const stakes = VALUE_TIER_ROLE_STAKES[input.valueTier]; // stars care more
  const ageMultiplier = input.age <= 24 && rankDelta < 0 ? 0.5 : 1; // youth tolerates demotion
  return Math.round(
    clamp(baseDelta * sensitivity * stakes * ageMultiplier, -ROLE_CHANGE_CAP, ROLE_CHANGE_CAP),
  );
}
```

A demotion stings a role-sensitive, valuable, older player far more than a young one still
earning his role. Other events follow the same shape:

- `computeMinutesShortfallMoraleDelta` — promised N minutes, getting M (only if a real
  rotation target was set; a small gap is noise).
- `computeTeamPerformanceMoraleDelta` — reacts to the team's competitiveness + streak,
  weighted by `competitiveness`.
- `computeContractSituationMoraleDelta` — a financially-motivated player sours when paid
  below ~70% of market, more so in a contract year.
- `computeCoachFitMoraleDelta` — a competitive player notices a weak coach.

A trade is a **reset**, not a continuation:

```ts
export function computeMoraleAfterTrade(
  currentMorale: number,
  input: TransactionMoraleInput,
): number {
  const reset = Math.round((currentMorale + TRANSACTION_RESET_TARGET) / 2); // pull halfway to ~60
  const competitiveWeight = axisWeight(input.personality.competitiveness);
  let fitDelta = 0;
  if (["CONTENDER", "PLAYOFF_TEAM"].includes(input.newTeamIdentity))
    fitDelta += 4 * competitiveWeight;
  else if (input.newTeamIdentity === "TANKING") fitDelta -= 4 * competitiveWeight;
  if (input.fillsNeed) fitDelta += 3;
  return applyMoraleDelta(reset, clamp(fitDelta, -TRANSACTION_FIT_CAP, TRANSACTION_FIT_CAP));
}

export function decayMoraleTowardBaseline(morale: number, loyalty: number): number {
  const rate = OFFSEASON_DECAY_RATE * (0.5 + loyalty / 200); // loyal players forgive faster
  return applyMoraleDelta(morale, (BASELINE_MORALE - morale) * rate);
}
```

A trade drags extreme morale most of the way back toward neutral, then applies new-team
fit; each offseason `decayMoraleTowardBaseline` regresses lingering grudges toward 70, with
loyal players forgiving faster. `moraleLevel.ts` (`applyMoraleDelta`, plus a
`getMoraleLevel` bucket) keeps morale clamped 0–100.

---

## The consume-don't-duplicate web (why these three are one doc)

```
fans.computeAttendancePct / computeFranchisePopularity ─► finances revenue
gm.EvaluationVerdict ─► fans.computeFanHappinessDelta AND finances (owner confidence nudge)
valuation.getPlayerValueTier ─► fans star power, finances star sponsorship, franchiseIcon
finances.FinancialHealth ─► gm owner-confidence delta
finances.INVESTMENT_QUALITY_DELTA ─► development + injury systems
morale ─► trade AI (a player who wantsOut surfaces on the market)
```

## Interview one-liners

- "The finance model is coarse on purpose — four revenue buckets, five expense buckets —
  and it _consumes_ attendance, popularity, star power, and payroll from systems that
  already compute them, so it's a consequence layer, not a second simulation. Money never
  grants cap space."
- "Fan happiness reuses the same season verdict the owner does, so a rebuilding fanbase is
  automatically patient — a low expectation reads a modest record as a success with no
  separate patience model."
- "Franchise-icon status is derived from tenure + homegrown + star tier + awards, so losing
  a homegrown legend is a business earthquake while moving a rental is just a trade."
- "Player morale is four independent seeded personality axes turned into bounded,
  personality-weighted event deltas, with trades resetting morale and offseasons decaying
  grudges — loyal players forgive faster."
