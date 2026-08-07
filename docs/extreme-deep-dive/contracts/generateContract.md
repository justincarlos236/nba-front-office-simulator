# `contracts/generateContract.ts` — building a realistic multi-year contract

**What this whole file is about:** the sim doesn't use players' real salaries — it _generates_
believable contracts from how good a player is. This file takes a player's value and produces a full
contract: how many years, and the salary for each year (with small raises), plus a dose of
"negotiation luck." It's a nice synthesis file — it pulls together the value math (`valuation/`), the
season rules (`cap/`), and the repeatable randomness (`seededRandom`) we've already covered.

Open the real file: `src/lib/contracts/generateContract.ts`.

---

## Part 1 — imports and shapes

```ts
import { getSeasonCapRules } from "../cap/constants";
import { scoreToCapFraction } from "../valuation/playerValue";
import { createSeededRandom, randomInRange } from "./seededRandom";

export interface GenerateContractInput {
  season: number;
  ageAdjustedScore: number;
  yearsOfExperience: number;
  seed: string;
}

export interface GeneratedContractYear {
  season: number;
  salaryCents: bigint;
  guaranteedCents: bigint;
}

export interface GeneratedContract {
  startSeason: number;
  endSeason: number;
  years: GeneratedContractYear[];
}
```

- The imports are old friends: `getSeasonCapRules` (season dollar figures), `scoreToCapFraction` (turn
  a score into a fraction of the cap — from `valuation/playerValue.md`), and the seeded random tools
  from the last doc.
- `GenerateContractInput` — what you feed in: the `season`, the player's `ageAdjustedScore` (their
  value score after the age adjustment), their `yearsOfExperience`, and a `seed` (for repeatable
  randomness — usually the player's ID).
- `GeneratedContractYear` — one year of the contract: which `season`, the `salaryCents`, and the
  `guaranteedCents` (how much is guaranteed money).
- `GeneratedContract` — the whole deal: a `startSeason`, an `endSeason`, and a **list of years**.

---

## Part 2 — two small helpers

```ts
function rookieScaleDiscount(yearsOfExperience: number): number {
  if (yearsOfExperience <= 0) return 0.35;
  if (yearsOfExperience === 1) return 0.4;
  if (yearsOfExperience === 2) return 0.45;
  if (yearsOfExperience === 3) return 0.55;
  return 1;
}
```

Newly-drafted players are paid _below_ their market value by rule (the "rookie scale"). This returns a
**discount multiplier** based on experience:

- A brand-new rookie (`<= 0` years) gets paid only **35%** (`0.35`) of market value.
- The discount shrinks each year: 40%, 45%, 55%...
- `return 1;` — after 4+ years, the multiplier is `1` (no discount) — a veteran gets full market value.

So this is why draft picks are cheap: their contract value is deliberately multiplied down.

```ts
function pickContractLength(ageAdjustedScore: number, rng: () => number): number {
  if (ageAdjustedScore >= 80)
    return rng() < 0.6 ? randomLength(4, 5, rng) : randomLength(2, 3, rng);
  if (ageAdjustedScore >= 55) return randomLength(2, 4, rng);
  return randomLength(1, 2, rng);
}

function randomLength(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
```

`pickContractLength` decides how many years the contract runs, based on how good the player is (better
players get longer deals) with some randomness:

- `if (ageAdjustedScore >= 80)` — a star. `rng() < 0.6 ? randomLength(4, 5, rng) : randomLength(2, 3,
rng)` — a ternary using a coin flip: 60% of the time (`rng() < 0.6`) they get a long **4–5 year**
  deal, otherwise a shorter **2–3 year** one.
- `if (ageAdjustedScore >= 55)` — a solid player: a **2–4 year** deal.
- otherwise — a fringe player: a short **1–2 year** deal.

`randomLength(min, max, rng)` picks a random _whole number_ between `min` and `max` (inclusive):

- `min + Math.floor(rng() * (max - min + 1))` — `rng()` is 0-to-1; multiply by the count of possible
  values (`max - min + 1`); `Math.floor(...)` rounds **down** to a whole number; add `min`. For
  `randomLength(2, 4, ...)` this yields 2, 3, or 4. (`Math.floor` always rounds toward the smaller
  whole number, so `Math.floor(2.9)` is `2`.)

---

## Part 3 — the main machine

```ts
export function generateContract(input: GenerateContractInput): GeneratedContract {
  const rules = getSeasonCapRules(input.season);
  const rng = createSeededRandom(input.seed);
```

- Look up the season's dollar figures.
- `const rng = createSeededRandom(input.seed);` — build a **repeatable** random-number generator seeded
  by this player. Because the seed is the player's ID, this player always negotiates the _same_
  contract on a re-run. Every use of randomness below draws from this generator.

**Step 1 — the player's fair market value in dollars:**

```ts
const marketValueCents = BigInt(
  Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(input.ageAdjustedScore)),
);
```

- `scoreToCapFraction(input.ageAdjustedScore)` — turn the player's value score into a fraction of the
  cap (the S-curve from `valuation/playerValue.md`).
- Multiply the season's cap by that fraction to get the fair dollar value (with the usual
  to-number-multiply-round-back-to-`bigint` dance).

**Step 2 — apply the rookie discount and negotiation luck:**

```ts
const discount = rookieScaleDiscount(input.yearsOfExperience);
const negotiationNoise = randomInRange(rng, 0.85, 1.15);
const rawSalaryCents = BigInt(Math.round(Number(marketValueCents) * discount * negotiationNoise));
```

- `discount` — the rookie-scale multiplier (1.0 for veterans).
- `negotiationNoise = randomInRange(rng, 0.85, 1.15)` — a random factor between **0.85 and 1.15** (±15%),
  drawn from our seeded generator. This is the "negotiation luck" — two equally-good players won't sign
  _identical_ deals; one lands a slightly better number. (Because it's seeded, it's the same each
  re-run.)
- `rawSalaryCents` — the first-year salary: market value × discount × noise.

**Step 3 — enforce a salary floor:**

```ts
const floorCents = rules.emptyRosterChargeCents;
const firstYearSalaryCents = rawSalaryCents < floorCents ? floorCents : rawSalaryCents;
```

- No contract can pay less than roughly the league minimum. `floorCents` uses the season's
  empty-roster-charge figure as a stand-in for that minimum. The ternary: if the raw salary is below
  the floor, use the floor; otherwise use the raw salary. So even the worst player is paid at least the
  minimum.

**Step 4 — decide the length and end season:**

```ts
const lengthYears = pickContractLength(input.ageAdjustedScore, rng);
const endSeason = input.season + lengthYears - 1;
```

- Get the number of years (using the helper + the seeded rng). `endSeason` is the last season: if it
  starts in 2025 and runs 3 years, `2025 + 3 - 1 = 2027` (2025, 2026, 2027).

**Step 5 — build each year's salary with a raise:**

```ts
const years: GeneratedContractYear[] = [];
for (let i = 0; i < lengthYears; i++) {
  const salaryCents = BigInt(Math.round(Number(firstYearSalaryCents) * (1 + 0.05 * i)));
  years.push({ season: input.season + i, salaryCents, guaranteedCents: salaryCents });
}

return { startSeason: input.season, endSeason, years };
```

- Start an empty `years` list, then a `for` loop runs once per year (`i` goes 0, 1, 2, …).
- `firstYearSalaryCents * (1 + 0.05 * i)` — apply a **5% raise per year.** In year 0 (`i = 0`) it's `×
(1 + 0) = ×1` (the base salary); year 1 is `× 1.05`; year 2 is `× 1.10`; and so on. Real NBA contracts
  usually have modest annual raises, and this copies that.
- `years.push({ season: input.season + i, salaryCents, guaranteedCents: salaryCents });` — add this
  year to the list: its season, its salary, and its guaranteed money (here the whole salary is
  guaranteed, so `guaranteedCents` equals `salaryCents`).
- Finally, return the complete contract: the start season, end season, and the list of years.

---

## Zooming out

This file is a great example of **composition** — building something from smaller pieces you already
understand. It doesn't reinvent anything: it reuses `scoreToCapFraction` for value, `getSeasonCapRules`
for the numbers, and `createSeededRandom`/`randomInRange` for repeatable luck, then adds its own contract
logic (rookie discount, length by quality, 5% raises) on top. The result is a believable, varied, and
_reproducible_ contract from just a player's score and experience.

That completes the `contracts/` folder — and with it, the entire "player value & money" half of the
codebase at the beginner level (`cap/`, `trade/`, `valuation/`, `contracts/` all done). **Next up:** the
big `simulation/` folder — how games and seasons are actually played out.
