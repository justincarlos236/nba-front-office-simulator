# `cap/multiYearProjection.ts` — how much of _future_ seasons is already spent

**What this whole file is about:** long contracts don't just cost money this year — they tie up
money for _years to come._ This file looks at a team's contracts and projects, for each of the
next several seasons, how much they've **already committed** and how much cap room they'd have
left. It's what powers the "your books are locked up through 2028" kind of insight. It does _not_
guess what the team _will_ do (no new signings assumed) — only what's already on the books.

Open the real file: `src/lib/cap/multiYearProjection.ts`. It teaches list-building and two very
common list tools, `.filter` and `.map`.

---

## Part 1 — the input and output shapes

```ts
import { getSeasonCapRules } from "./constants";

export interface ContractYearForProjection {
  season: number;
  salaryCents: bigint;
}

export interface SeasonProjection {
  season: number;
  committedSalaryCents: bigint;
  projectedCapSpaceCents: bigint;
  playersUnderContract: number;
}
```

- We import `getSeasonCapRules` again — we'll need each future season's cap figure.
- `ContractYearForProjection` — the shape of one **year of one contract**, boiled down to just
  what we need: which `season` it's for, and the `salaryCents` owed that year. (Recall a contract
  is stored as one record _per year_, so a 4-year deal is four of these.)
- `SeasonProjection` — the shape of the **answer for one future season**: the season, the total
  committed that year, the projected cap space, and how many players are still under contract that
  year.

---

## Part 2 — the machine

```ts
export function computeMultiYearProjection(
  contractYears: ContractYearForProjection[],
  startSeason: number,
  yearsAhead: number,
): SeasonProjection[] {
  const seasons = Array.from({ length: yearsAhead }, (_, i) => startSeason + i);
  return seasons.map((season) => {
    const rows = contractYears.filter((cy) => cy.season === season);
    const committedSalaryCents = rows.reduce((sum, cy) => sum + cy.salaryCents, 0n);
    const rules = getSeasonCapRules(season);
    const projectedCapSpaceCents =
      committedSalaryCents < rules.salaryCapCents
        ? rules.salaryCapCents - committedSalaryCents
        : 0n;
    return {
      season,
      committedSalaryCents,
      projectedCapSpaceCents,
      playersUnderContract: rows.length,
    };
  });
}
```

**The signature:** takes the team's full list of contract-years, the season to start from, and how
many years ahead to look; hands back a list (`SeasonProjection[]`) — one projection per future
season.

**Step 1 — build the list of seasons to look at:**

```ts
const seasons = Array.from({ length: yearsAhead }, (_, i) => startSeason + i);
```

- `Array.from({ length: yearsAhead }, ...)` is a way to **build a list of a given length.** The
  `{ length: yearsAhead }` says "make a list this many items long," and the second part is a
  mini-function that decides what each item is.
- `(_, i) => startSeason + i` — the mini-function. `i` is the position number, counting `0, 1, 2,
…`. (The `_` is the first input, which we don't need here — writing `_` is the convention for
  "an input I'm required to accept but won't use.") So each item is `startSeason + i`: if
  `startSeason` is 2025 and `yearsAhead` is 3, this builds `[2025, 2026, 2027]`.

**Step 2 — for each of those seasons, compute a projection:**

```ts
return seasons.map((season) => { ... });
```

- `.map(...)` is a list tool that **transforms every item in a list into something new**, giving
  back a new list of the same length. Here it turns each season _number_ into a full
  `SeasonProjection` _object._ The mini-function `(season) => { ... }` runs once per season.

Inside that mini-function:

```ts
const rows = contractYears.filter((cy) => cy.season === season);
```

- `.filter(...)` is a list tool that **keeps only the items that pass a test**, giving back a
  smaller list. The test `(cy) => cy.season === season` reads: "keep each contract-year `cy` whose
  `season` matches the season we're currently projecting." So `rows` ends up being just the
  salaries owed _in this particular year._

```ts
const committedSalaryCents = rows.reduce((sum, cy) => sum + cy.salaryCents, 0n);
```

- Same `.reduce` running-total trick from `capSheet.md`: add up all those salaries into one total
  for this season.

```ts
const rules = getSeasonCapRules(season);
const projectedCapSpaceCents =
  committedSalaryCents < rules.salaryCapCents ? rules.salaryCapCents - committedSalaryCents : 0n;
```

- Look up that future season's cap (using our projection-forward function — this is exactly why
  `getSeasonCapRules` handles future seasons!).
- Then the same ternary as before: if the committed amount is under the cap, the projected space is
  (cap − committed); otherwise it's `0n`. This tells you how much room you'd _theoretically_ have
  that year, given only what's already promised.

```ts
return { season, committedSalaryCents, projectedCapSpaceCents, playersUnderContract: rows.length };
```

- Hand back the projection object for this season. `playersUnderContract: rows.length` = how many
  contract-years landed in this season, i.e. how many players are still signed that far out.

---

## Zooming out — the point of "no new signings assumed"

Notice the machine only counts money **already committed.** It deliberately does _not_ try to guess
future signings or re-signings. That's intentional: the whole value of this view is showing "how
much of 2028 have I _already_ spoken for by decisions I've _already_ made?" A team that hands out a
lot of long contracts will see its future cap space shrink years in advance — which is exactly what
"long contracts hurt future flexibility" means in real basketball. This projection makes that
future consequence visible _now._

**Next file:** `cap/financialFlexibilityGrade.md` — squeezing all of this into a single A–F letter
grade.
