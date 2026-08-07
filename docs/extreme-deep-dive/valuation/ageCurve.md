# `valuation/ageCurve.ts` — how age changes a player's value

**What this whole file is about:** two players with the _identical_ stats aren't worth the same if
one is 22 and the other is 34. The young one has upside and years ahead; the old one has decline and
injury risk. This tiny file produces a **multiplier** that captures that — a number you multiply a
player's value by, based on their age. It peaks at age 27, gently rewards youth, and steadily
discounts age.

Open the real file: `src/lib/valuation/ageCurve.ts`. It's one short function — a nice, gentle read.

---

## The whole file

```ts
const PEAK_AGE = 27;

export function ageValueMultiplier(age: number): number {
  const distanceFromPeak = age - PEAK_AGE;

  if (distanceFromPeak <= 0) {
    // Young players: mild bonus that grows the further they are from peak.
    return Math.min(1.15, 1 + Math.abs(distanceFromPeak) * 0.015);
  }

  // Past peak: accelerating discount for decline/injury risk.
  const yearsPastPeak = distanceFromPeak;
  const discount = yearsPastPeak * 0.02 + Math.max(0, yearsPastPeak - 5) * 0.03;
  return Math.max(0.4, 1 - discount);
}
```

**Setup:**

- `const PEAK_AGE = 27;` — the age the model treats as a player's prime. Value is highest here.
- `ageValueMultiplier(age)` — takes an age, hands back a multiplier (a plain number like `1.1` or
  `0.8`). A multiplier of `1.0` means "no change"; above 1 boosts value, below 1 shrinks it.
- `const distanceFromPeak = age - PEAK_AGE;` — how many years from the peak. This is **negative** for
  players younger than 27, `0` at 27, and **positive** for players older than 27. The sign is how the
  function knows which branch to take.

**Branch 1 — young players (at or before peak):**

```ts
if (distanceFromPeak <= 0) {
  return Math.min(1.15, 1 + Math.abs(distanceFromPeak) * 0.015);
}
```

- `distanceFromPeak <= 0` is true for anyone 27 or younger.
- `Math.abs(distanceFromPeak)` — the **absolute value**, i.e. drop the minus sign to get a positive
  "how many years young." A 22-year-old is `abs(22 - 27) = abs(-5) = 5` years from peak.
- `1 + 5 * 0.015` = `1 + 0.075` = `1.075` — so a 22-year-old's value is boosted about 7.5%. The
  younger they are, the bigger the boost (more years of prime ahead).
- `Math.min(1.15, ...)` **caps** the bonus at `1.15` (15%). Without this cap, a 15-year-old would get
  an absurd boost — so we clamp it so youth is nice but never valued as some huge multiple of a
  proven star.

**Branch 2 — players past their peak:**

```ts
const yearsPastPeak = distanceFromPeak;
const discount = yearsPastPeak * 0.02 + Math.max(0, yearsPastPeak - 5) * 0.03;
return Math.max(0.4, 1 - discount);
```

- For players over 27, `distanceFromPeak` is already positive, so `yearsPastPeak` is just "how many
  years past 27."
- The `discount` has two parts that make decline **accelerate**:
  - `yearsPastPeak * 0.02` — a steady 2% discount for each year past peak.
  - `Math.max(0, yearsPastPeak - 5) * 0.03` — an _extra_ 3% per year, but only for years **more than 5
    past peak** (i.e. age 33+). `Math.max(0, yearsPastPeak - 5)` is 0 until you're 6+ years past peak,
    then it grows. So decline speeds up as players get into their mid-30s — just like real life.
  - Example, a 34-year-old (7 years past peak): `7*0.02 + max(0, 7-5)*0.03 = 0.14 + 0.06 = 0.20`.
- `return Math.max(0.4, 1 - discount);` — the multiplier is `1 - discount` (so the 34-year-old above
  gets `1 - 0.20 = 0.80`, a 20% cut). `Math.max(0.4, ...)` **floors** it at `0.4` — even an ancient
  player retains at least 40% of their value (they can still play).

---

## Zooming out

This is a **hand-tuned curve**, not a scientific formula — a reasonable shape (rise gently to 27,
then fall faster and faster) expressed as simple arithmetic with two clamps (a 1.15 ceiling on the
youth bonus, a 0.4 floor on the age discount) to keep it from producing silly extremes. The valuation
file (last doc) multiplies a player's raw score by this, so a 24-year-old and a 33-year-old with the
same stats end up with meaningfully different _values_ — which is exactly why the trade AI treats
youth and age so differently.

**Next file:** `valuation/playerValueTier.md` — turning a rating number into a friendly tier label.
