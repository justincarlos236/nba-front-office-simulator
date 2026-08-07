# `gm/seasonEvaluation.ts` — did you meet the bar, and how does the owner react?

**What this whole file is about:** at the end of a season, this file figures out **how far your team
actually got**, compares it to the owner's **expectation** (from `expectationLevel.md`), and turns the
result into a change in **owner confidence** (your job-security meter). It's the moment the accountability
loop pays off.

Open the real file: `src/lib/gm/seasonEvaluation.ts`. It has three functions: measure the outcome, judge
it, and score it.

---

## Part 1 — the shapes

```ts
export type EvaluationVerdict = "EXCEEDED" | "MET" | "FELL_SHORT" | "DRASTICALLY_FELL_SHORT";

export interface PlayoffSeriesForOutcome {
  round: number;
  higherSeedTeamId: string;
  lowerSeedTeamId: string;
  winnerTeamId: string | null;
}

export interface ActualOutcome {
  index: number;
  label: string;
}
```

- `EvaluationVerdict` — the four possible judgments of your season.
- `PlayoffSeriesForOutcome` — the info about one playoff series needed to figure out how far a team got
  (its round, the two teams, and who won — `null` if not finished).
- `ActualOutcome` — how far the team got, as a **number** (`index`) on a 0–6 scale plus a text `label`.

There's a lookup table `OUTCOME_LABEL` (not shown) mapping each index to text: `0` = "Missed the
playoffs," `1` = "Eliminated in the play-in," … up to `6` = "Won the championship."

---

## Part 2 — measuring how far the team got

```ts
export function computeActualOutcome(
  teamId: string,
  madePlayIn: boolean,
  series: PlayoffSeriesForOutcome[],
): ActualOutcome {
  const teamSeries = series.filter(
    (s) => s.higherSeedTeamId === teamId || s.lowerSeedTeamId === teamId,
  );

  if (teamSeries.length === 0) {
    const index = madePlayIn ? 1 : 0;
    return { index, label: OUTCOME_LABEL[index] };
  }

  const latest = [...teamSeries].sort((a, b) => b.round - a.round)[0];
  const won = latest.winnerTeamId === teamId;
  const index = latest.round === 4 ? (won ? 6 : 5) : latest.round + 1;
  return { index, label: OUTCOME_LABEL[index] };
}
```

- `const teamSeries = series.filter((s) => s.higherSeedTeamId === teamId || s.lowerSeedTeamId === teamId);`
  — keep only the playoff series this team was in (it could be either the higher or lower seed, hence the
  `||`).
- `if (teamSeries.length === 0)` — if the team played no playoff series, it either made the play-in
  (`index = 1`) or missed the playoffs entirely (`index = 0`). The ternary `madePlayIn ? 1 : 0` picks
  which.
- Otherwise, find the team's **last** (deepest) series: `[...teamSeries].sort((a, b) => b.round - a.round)[0]`
  copies the list, sorts by round highest-first, and takes the first one — the furthest round they
  reached.
- `const won = latest.winnerTeamId === teamId;` — did they _win_ that last series?
- `const index = latest.round === 4 ? (won ? 6 : 5) : latest.round + 1;` — convert to the 0–6 scale. Round
  4 is the Finals, so winning it is `6` (champion) and losing is `5` (lost in Finals). For any earlier
  round, the outcome index is `round + 1` (getting eliminated in round 2, the conference semis, is index
  3 — meaning "you won your first-round series"). This clever mapping lines up **exactly** with the
  expectation ladder's 0–5 positions.

**Nice design detail:** this reads the outcome from the _existing_ playoff records rather than storing a
separate "how the season ended" field — so there's no second source of truth to keep in sync.

---

## Part 3 — judging the season

```ts
export function evaluateSeason(
  expectationLevel: ExpectationLevel,
  actualOutcome: ActualOutcome,
): EvaluationVerdict {
  const expectationIndex = EXPECTATION_LEVEL_ORDER.indexOf(expectationLevel);
  const diff = actualOutcome.index - expectationIndex;
  if (diff >= 1) return "EXCEEDED";
  if (diff === 0) return "MET";
  if (diff === -1) return "FELL_SHORT";
  return "DRASTICALLY_FELL_SHORT";
}
```

- `EXPECTATION_LEVEL_ORDER.indexOf(expectationLevel)` — `.indexOf(...)` finds the **position** of the
  expectation in that ordered ladder (from `expectationLevel.md`). So an expectation of "make the
  playoffs" becomes a number.
- `const diff = actualOutcome.index - expectationIndex;` — how far the actual result was above or below
  the bar, in ladder steps.
- The chain of `if`s turns that difference into a verdict: at least one step above → **EXCEEDED**; exactly
  on the bar → **MET**; one step below → **FELL_SHORT**; two or more below → **DRASTICALLY_FELL_SHORT**.
- Because both the expectation and the outcome use the same 0–6 numbering, this comparison is just simple
  subtraction. That alignment is why the two files were designed to share a scale.

---

## Part 4 — scoring it into a confidence change

```ts
const BASE_CONFIDENCE_DELTA: Record<EvaluationVerdict, number> = {
  EXCEEDED: 8,
  MET: 2,
  FELL_SHORT: -8,
  DRASTICALLY_FELL_SHORT: -20,
};
const PAYROLL_DELTA_MULTIPLIER: Record<PayrollTier, number> = {
  MODEST: 0.5,
  MODERATE: 0.75,
  SIGNIFICANT: 1.25,
  EXTREME: 1.75,
};
const FINANCIAL_HEALTH_NUDGE = { THRIVING: 2, HEALTHY: 1, STABLE: 0, STRAINED: -2, IN_THE_RED: -4 };

export function computeConfidenceDelta(
  verdict: EvaluationVerdict,
  payrollTier: PayrollTier,
  fanHappiness?: number,
  financialHealth?: FinancialHealth,
): number {
  const base = BASE_CONFIDENCE_DELTA[verdict] * PAYROLL_DELTA_MULTIPLIER[payrollTier];
  const fanNudge = fanHappiness !== undefined ? (fanHappiness - 65) * 0.08 : 0;
  const financialNudge =
    financialHealth !== undefined ? FINANCIAL_HEALTH_NUDGE[financialHealth] : 0;
  return Math.round(base + fanNudge + financialNudge);
}
```

This turns the verdict into a number to add to (or subtract from) owner confidence.

- `BASE_CONFIDENCE_DELTA` — the base swing per verdict: +8 for exceeding, +2 for meeting, −8 for falling
  short, −20 for a disaster.
- `PAYROLL_DELTA_MULTIPLIER` — **this is the key twist.** The base swing is multiplied by how much you're
  spending: ×0.5 for a modest team, up to ×1.75 for an extreme-payroll team. So spending **amplifies both
  the reward and the punishment** — an expensive team that flops is a crisis (−20 × 1.75 = −35), while a
  cheap team missing its low bar barely registers (−8 × 0.5 = −4).
- `const fanNudge = fanHappiness !== undefined ? (fanHappiness - 65) * 0.08 : 0;` — an optional small
  nudge from the fanbase. **`fanHappiness !== undefined`** checks whether the caller actually passed this
  optional value; if not (`undefined`), the nudge is 0. If passed, a happy fanbase (above the neutral 65)
  helps, an angry one hurts — but only a little (`× 0.08`).
- `financialNudge` — the same idea for the team's financial health (thriving helps, in-the-red hurts),
  again only applied if the caller passed it.
- `return Math.round(base + fanNudge + financialNudge);` — add the three parts and round to a whole
  number. That's the amount owner confidence moves this season.

**Why the optional nudges use `!== undefined`:** it lets this function be _extended_ without breaking
older callers. Code written before fans/finances existed calls it with just the verdict and payroll tier,
and those callers behave exactly as before (nudges = 0). Newer callers pass the extra info. This "optional,
defaults to no effect" pattern shows up all over the codebase.

---

## Zooming out

This file is the payoff of the accountability system: measure how far you actually got (from the real
playoff records), compare to the spending-scaled expectation, and move the owner's confidence — with big
spending raising the stakes in both directions. The number this produces feeds straight into your
job-security level, and if confidence hits zero, you're fired. Next files cover exactly that.

**Next file:** `gm/jobSecurity.md` — turning the confidence number into a readable "how safe is my job?"
label.
