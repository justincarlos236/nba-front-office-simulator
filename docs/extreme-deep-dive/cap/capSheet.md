# `cap/capSheet.ts` — adding up a team's salaries into a "cap sheet"

**What this whole file is about:** given a team's list of player contracts, this file adds up
everything the team is spending and produces a **cap sheet** — a summary that answers "total
salary, which spending tier are they in, how much cap room do they have, and how far are they
from each apron?" It's the machine that turns a pile of contracts into the numbers the rest of
the app reasons about.

Open the real file: `src/lib/cap/capSheet.ts`. It builds directly on the two files we've
already covered (`apron.md` and `constants.md`).

---

## Part 1 — borrowing from the neighbor files

```ts
import { getApronLevel, type ApronLevel } from "./apron";
import { getSeasonCapRules } from "./constants";
```

- The first line borrows two things from `apron.ts` (the file right next door). Notice you can
  mix "real code" and "just a description" in one import: `getApronLevel` is a **function** we'll
  call (real code), and `type ApronLevel` is just the **five-tier description** (the `type`
  keyword marks it as description-only).
- The second line borrows `getSeasonCapRules` from `constants.ts` — the "give me this season's
  dollar figures" machine from the last doc.

So before any of its own code, this file is saying: "I'll use the tool that decides a team's
tier, and the tool that gives me the season's rules."

---

## Part 2 — describing the inputs and the output

```ts
export interface CapSheetContract {
  playerId: string;
  salaryCents: bigint;
}

export interface CapSheetInput {
  season: number;
  contracts: CapSheetContract[];
  deadMoneyCents?: bigint;
  retainedSalaryCents?: bigint;
}
```

- `CapSheetContract` is a tiny shape: one contract, boiled down to just what the cap math needs
  — a `playerId` (text) and this season's `salaryCents` (money). It deliberately ignores
  everything else about a contract; the cap only cares about the salary number.
- `CapSheetInput` is the shape of the **input** to the main machine below:
  - `season: number` — which season we're calculating.
  - `contracts: CapSheetContract[]` — the `[]` means "a list of," so this is the team's list of
    contracts.
  - `deadMoneyCents?: bigint` — the `?` means **optional / might be missing.** "Dead money" is
    money still owed to a player the team already let go. Not every team has any, so it's
    optional.
  - `retainedSalaryCents?: bigint` — also optional; a rare case where a team still pays part of a
    traded-away player's salary.

```ts
export interface CapSheet {
  season: number;
  committedSalaryCents: bigint;
  deadMoneyCents: bigint;
  emptyRosterChargeCents: bigint;
  totalSalaryCents: bigint;
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
  distanceToFirstApronCents: bigint;
  distanceToSecondApronCents: bigint;
}
```

This is the shape of the **answer** the machine hands back. Reading down: the season; the salary
actually committed to signed players; dead money; the empty-roster charge (explained below); the
grand total; the `apronLevel` (one of the five tiers from `apron.md`); the cap space (room under
the cap); and how far the total is from each apron. In other words, a complete financial picture
of one team.

---

## Part 3 — one small constant

```ts
const MIN_ROSTER_SIZE_FOR_CAP_PURPOSES = 12;
```

A fixed value of `12`. NBA rules pretend a team always has at least 12 players _for cap-counting
purposes_ — even if it has fewer signed — so a nearly-empty team can't claim to have tons of
free cap space. We'll use this in a moment.

---

## Part 4 — the machine itself, step by step

```ts
export function computeCapSheet(input: CapSheetInput): CapSheet {
  const rules = getSeasonCapRules(input.season);
```

- `computeCapSheet(input: CapSheetInput): CapSheet` — a machine that takes one `CapSheetInput`
  bundle and hands back one `CapSheet` bundle.
- `const rules = getSeasonCapRules(input.season);` — first, look up this season's dollar figures
  by calling the function we imported. Now `rules` holds the cap, tax line, aprons, etc. for the
  right year.

**Step 1 — add up the committed salaries:**

```ts
const committedSalaryCents = input.contracts.reduce(
  (sum, contract) => sum + contract.salaryCents,
  0n,
);
```

- `.reduce(...)` is a list tool that **combines a whole list into a single value.** Think of it
  as a running total.
- It takes two parts: a mini-function `(sum, contract) => sum + contract.salaryCents`, and a
  **starting value** `0n` (zero, as a `bigint`).
- Read it like this: "start the total (`sum`) at `0n`; then go through each `contract` in the
  list, and for each one, set the new total to the old total plus that contract's
  `salaryCents`." When it finishes, `committedSalaryCents` holds the sum of every player's
  salary.

**Step 2 — handle the two optional amounts:**

```ts
const deadMoneyCents = input.deadMoneyCents ?? 0n;
const retainedSalaryCents = input.retainedSalaryCents ?? 0n;
```

- The `??` is the **"or, if missing"** operator (called "nullish coalescing"). `a ?? b` means
  "use `a`, but if `a` is missing/nothing, use `b` instead."
- So: "use the given `deadMoneyCents`, but if none was provided, treat it as `0n`." Same for
  retained salary. This is the tidy way to give an optional input a default of zero.

**Step 3 — the empty-roster charge:**

```ts
const emptyRosterSpots = Math.max(0, MIN_ROSTER_SIZE_FOR_CAP_PURPOSES - input.contracts.length);
const emptyRosterChargeCents = rules.emptyRosterChargeCents * BigInt(emptyRosterSpots);
```

- `input.contracts.length` is **how many contracts the team has** (`.length` = the count of
  items in a list).
- `MIN_ROSTER_SIZE_FOR_CAP_PURPOSES - input.contracts.length` = 12 minus that count = how many
  spots below 12 the team is.
- `Math.max(0, ...)` = "the bigger of 0 and that number." This protects against a negative
  result: if the team has _more_ than 12 players, the subtraction goes negative, and we clamp it
  up to 0 (you can't have a negative number of empty spots).
- `rules.emptyRosterChargeCents * BigInt(emptyRosterSpots)` — multiply the per-spot charge by the
  number of empty spots. `BigInt(emptyRosterSpots)` converts the count (a plain number) into a
  `bigint` first, because you can only multiply a `bigint` by another `bigint`.
- **The point:** a team with, say, only 8 signed players gets charged for its 4 empty spots, so
  it can't pretend to have a huge amount of unused cap space.

**Step 4 — the grand total:**

```ts
const totalSalaryCents =
  committedSalaryCents + deadMoneyCents + retainedSalaryCents + emptyRosterChargeCents;
```

Straightforward addition: the players' salaries, plus dead money, plus retained salary, plus the
empty-roster charge. This total is what everything else keys off.

**Step 5 — the tier and the cap space:**

```ts
const apronLevel = getApronLevel(totalSalaryCents, rules);
const capSpaceCents =
  totalSalaryCents < rules.salaryCapCents ? rules.salaryCapCents - totalSalaryCents : 0n;
```

- `getApronLevel(totalSalaryCents, rules)` — hand the total and the rules to the `apron.md`
  machine, which returns which of the five tiers the team is in.
- The next line uses a **ternary** — a compact if/else written as `condition ? valueIfTrue :
valueIfFalse`. Read `totalSalaryCents < rules.salaryCapCents ? rules.salaryCapCents -
totalSalaryCents : 0n` as: _"IF the total is below the cap, THEN the cap space is (cap −
  total); OTHERWISE it's `0n`."_ In plain terms: if you're under the cap, your cap space is
  however far under you are; if you're at or over the cap, you have no cap space (zero).

**Step 6 — hand back the full picture:**

```ts
return {
  season: input.season,
  committedSalaryCents,
  deadMoneyCents: deadMoneyCents + retainedSalaryCents,
  emptyRosterChargeCents,
  totalSalaryCents,
  apronLevel,
  capSpaceCents,
  distanceToFirstApronCents: rules.firstApronCents - totalSalaryCents,
  distanceToSecondApronCents: rules.secondApronCents - totalSalaryCents,
};
```

- This builds and returns the `CapSheet` answer object.
- Where you see just a name (like `committedSalaryCents,`), it's shorthand for "a field of that
  name set to the value of the box with that name" — e.g. `committedSalaryCents:
committedSalaryCents`.
- `deadMoneyCents: deadMoneyCents + retainedSalaryCents` — for display purposes, it lumps
  retained salary in with dead money (both are "money paid for players not on the active
  roster").
- `distanceToFirstApronCents: rules.firstApronCents - totalSalaryCents` — how far the team is
  from the first apron. If the team is _under_ the apron this is positive (room to spare); if
  _over_, it comes out **negative**, which is a handy signal meaning "you've already crossed
  it." Same idea for the second apron.

---

## Zooming out

`computeCapSheet` takes plain data (a season and a list of salaries) and hands back plain data
(a full financial summary) — it never touches the database. That's why it's a **pure function**:
easy to test, and reusable everywhere. The trade screen, the team dashboard, the computer
opponents, and the "is this trade legal?" checker all call this same machine, so they can never
disagree about a team's cap situation.

**Next file:** `trade/salaryMatching.md` — the formula that decides how much salary a team is
allowed to take back in a trade, which uses these same rules and tiers.
