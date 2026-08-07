# `cap/financialFlexibilityGrade.ts` — one A–F grade for a team's cap health

**What this whole file is about:** a casual player shouldn't have to study several seasons of cap
sheets to know if their books are healthy. This file boils a team's whole cap situation — current
spending, future commitments, and any bad long-term contracts — into a single **letter grade from
A to F.** It starts everyone at a perfect 100 and subtracts penalties.

Open the real file: `src/lib/cap/financialFlexibilityGrade.ts`. It teaches changeable variables
(`let`), loops (`for...of`), and dividing money.

---

## Part 1 — the shapes

```ts
import { ApronLevel } from "./apron";
import { getSeasonCapRules } from "./constants";
import type { SeasonProjection } from "./multiYearProjection";

export type FinancialFlexibilityLetter = "A" | "B" | "C" | "D" | "F";

export interface RosterContractForGrading {
  currentSalaryCents: bigint;
  yearsRemaining: number;
}

export interface FinancialFlexibilityResult {
  score: number;
  grade: FinancialFlexibilityLetter;
  summary: string;
}
```

- Three imports: the five tiers, the season-rules function, and the `SeasonProjection` shape from
  the previous file (this grader _consumes_ the projection we just built).
- `FinancialFlexibilityLetter` — a string-literal union (like in `capStatusLabel.md`): the grade is
  exactly one of `"A"`, `"B"`, `"C"`, `"D"`, `"F"`.
- `RosterContractForGrading` — one contract, reduced to what the grader cares about: its
  `currentSalaryCents` and how many `yearsRemaining` are on it.
- `FinancialFlexibilityResult` — the answer: a numeric `score` (0–100), the `grade` letter, and a
  one-line `summary` sentence.

---

## Part 2 — the penalty settings

```ts
const APRON_PENALTY: Record<ApronLevel, number> = {
  [ApronLevel.UNDER_CAP]: 0,
  [ApronLevel.BETWEEN_CAP_AND_TAX]: 8,
  [ApronLevel.TAXPAYER]: 16,
  [ApronLevel.FIRST_APRON]: 26,
  [ApronLevel.SECOND_APRON]: 38,
};

const LONG_TERM_YEARS_THRESHOLD = 3;
const LONG_TERM_SALARY_FRACTION_THRESHOLD = 0.15;
const LONG_TERM_CONTRACT_PENALTY = 6;
const MAX_LONG_TERM_PENALTY = 18;
```

- `APRON_PENALTY` is a lookup table (a `Record`) mapping each spending tier to how many points it
  costs your grade. Under the cap? No penalty. Deep into the second apron? A hefty 38-point hit.
  (The `[ApronLevel.UNDER_CAP]:` square-bracket syntax just means "use the value of
  `ApronLevel.UNDER_CAP` as this key" — needed because the key is a variable, not plain text.)
- The four `LONG_TERM_*` constants define what counts as a bad "albatross" contract and how much it
  hurts: **3+** years remaining, taking up **15%+** (`0.15`) of the cap, costs **6** points each,
  capped at **18** total. (More on these below.)

There's also a `GRADE_SUMMARY` lookup table (not shown) holding the one-line sentence for each
letter, e.g. an "A" says _"Excellent flexibility — your books are clean for years to come."_

---

## Part 3 — the grading machine

```ts
export function computeFinancialFlexibilityGrade(
  currentApronLevel: ApronLevel,
  futureProjections: SeasonProjection[],
  contracts: RosterContractForGrading[],
  currentSeasonCapCents: bigint,
): FinancialFlexibilityResult {
  let score = 100;
```

- The machine takes the team's current tier, its future projections (from the last file), its list
  of contracts, and this season's cap figure.
- `let score = 100;` — **`let`** (not `const`) creates a box whose value **can change.** We'll
  subtract from `score` as we find problems, so it has to be changeable. Everyone starts at a
  perfect 100.

**Penalty 1 — current spending tier:**

```ts
score -= APRON_PENALTY[currentApronLevel];
```

- `-=` means "subtract from and store back." `score -= 8` is shorthand for `score = score - 8`.
- `APRON_PENALTY[currentApronLevel]` looks up the penalty for the team's current tier and subtracts
  it. A tax team immediately loses points; a cap-space team loses none.

**Penalty 2 — being over-committed in future years:**

```ts
for (const projection of futureProjections) {
  const rules = getSeasonCapRules(projection.season);
  const fraction = Number(projection.committedSalaryCents) / Number(rules.salaryCapCents);
  score -= Math.max(0, fraction - 0.4) * 20;
}
```

- `for (const projection of futureProjections) { ... }` — a **loop** that runs the code inside once
  for **each** item in the `futureProjections` list. Each time, `projection` is the next future
  season's projection.
- `const fraction = Number(...) / Number(...)` — compute what **share** of that season's cap is
  already committed. We convert both money values to regular numbers with `Number(...)` so we can
  **divide** (`/`) them (you divide to get a fraction like `0.5` = "half the cap is used"). Money
  is normally `bigint`, and bigints don't do decimals, so we temporarily switch to regular numbers
  here.
- `score -= Math.max(0, fraction - 0.4) * 20;` — the penalty. `fraction - 0.4` measures how far
  _past 40%_ committed you are. `Math.max(0, ...)` clamps that to 0, so being _under_ 40% costs
  nothing (no negative penalty). Whatever's left is multiplied by 20 and subtracted. And because
  this runs inside the loop, **every** heavily-committed future season chips away at your grade —
  being locked up far in advance costs you repeatedly, not just once.

**Penalty 3 — bad long-term "albatross" contracts:**

```ts
let longTermPenalty = 0;
for (const contract of contracts) {
  const fraction = Number(contract.currentSalaryCents) / Number(currentSeasonCapCents);
  if (
    contract.yearsRemaining >= LONG_TERM_YEARS_THRESHOLD &&
    fraction >= LONG_TERM_SALARY_FRACTION_THRESHOLD
  ) {
    longTermPenalty += LONG_TERM_CONTRACT_PENALTY;
  }
}
score -= Math.min(MAX_LONG_TERM_PENALTY, longTermPenalty);
```

- Start a separate running penalty at 0 (`let longTermPenalty = 0;`).
- Loop over every contract. For each, compute what fraction of the cap its salary eats.
- The `if` uses `&&`, which means **"and"** — both conditions must be true: `yearsRemaining >= 3`
  **AND** `fraction >= 0.15`. If a contract is both long (3+ years left) _and_ expensive (15%+ of
  the cap), it's an "albatross" — a big, locked-in deal you can't easily escape — so add 6 penalty
  points (`+=` = "add to and store back").
- `score -= Math.min(MAX_LONG_TERM_PENALTY, longTermPenalty);` — subtract the total albatross
  penalty, but `Math.min(18, ...)` caps it at 18 so a few bad deals can't tank the grade _entirely_
  on their own.

**Finish — clamp and convert to a letter:**

```ts
score = Math.max(0, Math.min(100, Math.round(score)));

const grade: FinancialFlexibilityLetter =
  score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

return { score, grade, summary: GRADE_SUMMARY[grade] };
```

- `score = Math.max(0, Math.min(100, Math.round(score)));` — tidy the final number: `Math.round`
  makes it whole, `Math.min(100, ...)` stops it exceeding 100, and `Math.max(0, ...)` stops it
  going below 0. So the final score is a clean whole number between 0 and 100.
- The `grade` line is a **chained ternary** — several if/else checks strung together. Read it
  top-down: "if score ≥ 90 it's an A; otherwise if ≥ 75 it's a B; otherwise if ≥ 60 a C; otherwise
  if ≥ 40 a D; otherwise F." The first condition that's true wins.
- `return { score, grade, summary: GRADE_SUMMARY[grade] };` — hand back the number, the letter, and
  the matching one-line summary looked up from `GRADE_SUMMARY`.

---

## Zooming out

This is the same "keep detail inside, show a simple thing outside" idea as `capStatusLabel.md`, but
richer: it _combines_ several concerns (current tier + future commitments + bad long deals) into one
number and one letter. A player sees a "B — your future commitments are manageable" and instantly
understands their cap health, without ever reading a cap sheet. And the design is transparent —
start at 100, subtract clearly-defined penalties — so it's easy to reason about _why_ a team got the
grade it did.

That completes the whole `cap/` folder. **Next up:** the `trade/` folder — starting with
`trade/salaryMatching.md`, the real formula for how much salary a team can take back in a trade.
