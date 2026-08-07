# `cap/constants.ts` — the season-by-season rulebook of dollar figures

**What this whole file is about:** the salary cap, the luxury-tax line, and the apron
thresholds are **different amounts each NBA season** (they grow over time). This file is the
single place that stores those dollar figures, and it provides one machine that answers:
_"give me the money rules for season X."_ Every other cap file gets its numbers from here.

Open the real file next to this: `src/lib/cap/constants.ts`. We'll go through it in order.
(If any syntax is unfamiliar, the folder's `README.md` primer has the basics.)

---

## Part 1 — describing the _shape_ of one season's rules

```ts
export interface SeasonCapRules {
  season: number; // e.g. 2025 => the 2025-26 season
  salaryCapCents: bigint;
  luxuryTaxCents: bigint;
  firstApronCents: bigint;
  secondApronCents: bigint;
  nonTaxpayerMLECents: bigint;
  taxpayerMLECents: bigint;
  roomMLECents: bigint;
  biAnnualExceptionCents: bigint;
  emptyRosterChargeCents: bigint;
  tradeMatchLowerBreakpointCents: bigint;
  tradeMatchUpperBreakpointCents: bigint;
}
```

- `export` = "let other files use this." `interface` = **a named description of a shape** —
  it's like a form template. It says: "anything called a `SeasonCapRules` must have all of
  these labeled fields, with these types." It's not real data; it's a description the
  type-checker uses to catch mistakes.
- `season: number` — one field named `season`, holding a plain **number** (like `2025`). The
  `//` after it is a comment (a human note the computer ignores) clarifying that `2025` means
  the 2025-26 season.
- Every other field ends in `Cents` and is a `bigint` — a **big whole number of cents**
  (remember from the primer: money is stored in cents to avoid rounding errors, and `bigint`
  is a number type for very large whole numbers). Reading down the list, these are all the
  dollar figures for one season:
  - `salaryCapCents` — the salary cap.
  - `luxuryTaxCents` — the luxury-tax line.
  - `firstApronCents`, `secondApronCents` — the two apron thresholds.
  - `nonTaxpayerMLECents`, `taxpayerMLECents`, `roomMLECents` — the sizes of the different
    "mid-level exception" signing tools.
  - `biAnnualExceptionCents` — the size of the bi-annual exception.
  - `emptyRosterChargeCents` — a minimum amount charged per empty roster spot (explained in
    `capSheet.md`).
  - `tradeMatchLowerBreakpointCents`, `tradeMatchUpperBreakpointCents` — two cutoff amounts
    used by the trade-matching formula (explained in `salaryMatching.md`).

**Why write this description at all?** So the rest of the code knows _exactly_ what a
"season's rules" contains. If someone tries to read a field that doesn't exist, or forgets to
fill one in, the type-checker complains _before the program runs._

---

## Part 2 — the actual numbers

```ts
export const SEASON_CAP_RULES: readonly SeasonCapRules[] = [
  {
    season: 2023,
    salaryCapCents: 136_021_000_00n,
    luxuryTaxCents: 165_294_000_00n,
    firstApronCents: 172_346_000_00n,
    secondApronCents: 182_794_000_00n,
    // ...the exception amounts and trade breakpoints...
  },
  {
    season: 2024,
    // ...that season's figures...
  },
  {
    season: 2025,
    salaryCapCents: 154_647_000_00n,
    // ...
  },
];
```

- `export const SEASON_CAP_RULES` — a named box (`const` = it never changes) called
  `SEASON_CAP_RULES`.
- `: readonly SeasonCapRules[]` — its type. The `[]` on the end means **"a list (array) of."**
  So this reads: "a list of `SeasonCapRules` items." The word `readonly` means the list can't
  be modified after it's set — these are fixed facts.
- `= [ ... ]` — the square brackets hold the list. Inside are three **objects** (the curly-brace
  bundles), one per season (2023, 2024, 2025), each filling in every field the interface above
  demands.
- **Reading a number like `136_021_000_00n`:**
  - The underscores `_` are just visual separators to make big numbers readable (the computer
    ignores them) — like commas in `136,021,000`.
  - The `n` on the end marks it as a `bigint`.
  - The value is in **cents**, so `136_021_000_00` is `$136,021,000` written as cents (the last
    `_00` is the cents). So season 2023's salary cap was about **$136 million.**
- These three seasons' figures are real, publicly reported NBA numbers, entered by hand.

---

## Part 3 — a small helper for scaling money

```ts
const CAP_GROWTH_RATE = 0.05;

function scaleCents(cents: bigint, factor: number): bigint {
  return BigInt(Math.round(Number(cents) * factor));
}
```

- `const CAP_GROWTH_RATE = 0.05;` — a fixed value of `0.05`, meaning **5%.** (The real NBA cap
  grows a few percent most years; 5% is a reasonable stand-in for _future_ seasons we don't have
  exact numbers for.) Note there's no `export`, so this is private to this file.
- `function scaleCents(cents: bigint, factor: number): bigint` — a little machine that takes a
  money amount (`cents`, a `bigint`) and a multiplier (`factor`, a plain number like `1.05`),
  and hands back a `bigint`.
- The body does a careful dance you'll see all over the codebase, because you **can't directly
  multiply a `bigint` by a decimal like `1.05`** (bigints are whole-number-only):
  - `Number(cents)` — temporarily convert the big cents value into a regular number so we _can_
    multiply by a decimal.
  - `... * factor` — multiply it (e.g. grow it by 5%).
  - `Math.round(...)` — round to the nearest whole number (no fractional cents allowed).
  - `BigInt(...)` — convert the result back into a `bigint` to store as money again.
- So `scaleCents` means "take this money amount and grow/shrink it by this factor, safely."

---

## Part 4 — the machine everyone actually calls

```ts
export function getSeasonCapRules(season: number): SeasonCapRules {
  const exact = SEASON_CAP_RULES.find((rules) => rules.season === season);
  if (exact) return exact;

  const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
  if (season > latest.season) {
    const factor = (1 + CAP_GROWTH_RATE) ** (season - latest.season);
    return {
      season,
      salaryCapCents: scaleCents(latest.salaryCapCents, factor),
      // ...every other field scaled the same way...
    };
  }

  const closest = [...SEASON_CAP_RULES].sort(
    (a, b) => Math.abs(a.season - season) - Math.abs(b.season - season),
  )[0];
  if (!closest) throw new Error("No season cap rules configured");
  return closest;
}
```

This is the important part — the one function the rest of the app uses. Its job: _"give me the
rules for any season, and always give me a sensible answer, even for seasons I don't have exact
numbers for."_ It handles three cases.

**The signature:** `getSeasonCapRules(season: number): SeasonCapRules` — takes a season number,
hands back a full `SeasonCapRules` bundle.

**Case 1 — we have the exact season:**

```ts
const exact = SEASON_CAP_RULES.find((rules) => rules.season === season);
if (exact) return exact;
```

- `.find(...)` looks through the list and returns the **first item that matches a test.** The
  test is written as a mini-function: `(rules) => rules.season === season` reads as "for each
  `rules` entry, is its `season` exactly equal (`===`) to the season we want?"
- If a matching season was found, `exact` holds it. `if (exact) return exact;` — "if we found
  one, hand it back and stop." (In this language, a found value counts as "yes/true"; not
  finding anything gives a special "nothing" value that counts as "no/false.")

**Case 2 — a _future_ season we don't have numbers for (project it forward):**

```ts
const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
if (season > latest.season) {
  const factor = (1 + CAP_GROWTH_RATE) ** (season - latest.season);
  return { season, salaryCapCents: scaleCents(latest.salaryCapCents, factor) /* ... */ };
}
```

- `SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1]` — grabs the **last** item in the list.
  (`.length` is how many items there are; lists are numbered starting at 0, so the last item's
  position is `length - 1`.) That's the most recent season we have real numbers for (2025).
- `if (season > latest.season)` — "if the season we're asked about is _later_ than our latest
  known season..."
- `const factor = (1 + CAP_GROWTH_RATE) ** (season - latest.season);` — compute a growth
  multiplier. `**` means **"to the power of"** (exponent). `season - latest.season` is how many
  years past our data we are. So this is `1.05` raised to that many years — i.e. **compound 5%
  growth per year.** (Two years out = `1.05 × 1.05`.)
- Then it builds a **brand-new** rules object for that future season, scaling every dollar
  figure by that factor using `scaleCents`. `{ season, ... }` — the shorthand `season` just
  means "a field called `season` set to the `season` value we were given."
- **Why do this?** So a save that runs 10, 20 seasons into the future still has a
  sensibly-growing cap, instead of freezing at 2025's numbers forever or crashing.

**Case 3 — a season _before_ our data (fall back to the nearest one):**

```ts
const closest = [...SEASON_CAP_RULES].sort(
  (a, b) => Math.abs(a.season - season) - Math.abs(b.season - season),
)[0];
if (!closest) throw new Error("No season cap rules configured");
return closest;
```

- `[...SEASON_CAP_RULES]` — the `...` (called "spread") makes a **copy** of the list. We copy
  before sorting so we don't scramble the original.
- `.sort((a, b) => ...)` — reorders the list. The mini-function compares two entries `a` and `b`
  and decides which comes first. Here it sorts by **how far each season is from the one we
  want**: `Math.abs(a.season - season)` is the distance (`Math.abs` = "absolute value," i.e.
  drop any minus sign, so distance is always positive). The entry with the _smallest_ distance
  ends up first.
- `[0]` — take the **first** item (position 0), i.e. the closest season.
- `if (!closest) throw new Error("...")` — `!` means "not," so this reads "if there is _no_
  closest (the list was somehow empty), **throw an error**." Throwing an error stops everything
  and reports a problem — a safety net that should never actually trigger here.
- `return closest;` — otherwise hand back the nearest season's rules.

---

## Zooming out — what this file gives the rest of the app

One tidy list of real dollar figures, plus one smart function, `getSeasonCapRules(season)`,
that **always** returns a valid rulebook: the exact one if we have it, a sensibly-grown one for
future seasons, or the nearest one for past seasons. Because _every_ other cap calculation
starts by calling this, no dollar amount is ever hardcoded anywhere else — change a number here
and it updates everywhere at once. That's the "single source of truth" idea in action.

**Next file:** `cap/capSheet.md` — the machine that adds up a team's contracts into a full "cap
sheet" and uses `getSeasonCapRules` to decide their spending tier.
