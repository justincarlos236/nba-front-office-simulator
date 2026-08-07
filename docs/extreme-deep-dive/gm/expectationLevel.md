# `gm/expectationLevel.ts` — setting the bar the owner holds you to

**What this whole file is about:** at the start of each season, the owner sets an **expectation** — from
"just develop your young players" up to "compete for a championship." This file computes that
expectation from two things: how much you're spending (the payroll tier) and how good your roster is.
Later, the season's actual result is compared to this bar to decide if you kept your job.

Open the real file: `src/lib/gm/expectationLevel.ts`. It teaches working with an ordered list of levels
by their _position number_.

---

## Part 1 — the ladder of expectations

```ts
export type ExpectationLevel =
  | "DEVELOP_YOUNG_PLAYERS"
  | "COMPETE_FOR_PLAY_IN"
  | "MAKE_PLAYOFFS"
  | "WIN_PLAYOFF_SERIES"
  | "DEEP_PLAYOFF_RUN"
  | "CHAMPIONSHIP_CONTENTION";

export const EXPECTATION_LEVEL_ORDER: ExpectationLevel[] = [
  "DEVELOP_YOUNG_PLAYERS",
  "COMPETE_FOR_PLAY_IN",
  "MAKE_PLAYOFFS",
  "WIN_PLAYOFF_SERIES",
  "DEEP_PLAYOFF_RUN",
  "CHAMPIONSHIP_CONTENTION",
];
```

- `ExpectationLevel` — the six possible bars, from lowest to highest ambition.
- `EXPECTATION_LEVEL_ORDER` — the same six as an **ordered list.** This is the key idea: because they're
  in a list, each level has a **position number** (0 for "develop young players," up to 5 for
  "championship contention"). The code works with these numbers so it can do math like "bump the
  expectation up one level." (There's the usual `_LABEL` table for display text, not shown.)

---

## Part 2 — the settings

```ts
const BASE_INDEX_BY_TIER: Record<PayrollTier, number> = {
  MODEST: 0,
  MODERATE: 2,
  SIGNIFICANT: 3,
  EXTREME: 4,
};

const ELITE_ROSTER_STRENGTH_THRESHOLD = 80;
const WEAK_ROSTER_STRENGTH_THRESHOLD = 65;
```

- `BASE_INDEX_BY_TIER` — a lookup table mapping each spending tier to a **starting position** on the
  expectation ladder. A modest-payroll team starts at 0 ("develop young players"); an extreme-payroll
  team starts at 4 ("deep playoff run"). **Spending sets the baseline** — you pay big, you're expected to
  win.
- `ELITE_ROSTER_STRENGTH_THRESHOLD = 80` / `WEAK_ROSTER_STRENGTH_THRESHOLD = 65` — roster-strength
  cutoffs that nudge the expectation up or down from that baseline.

---

## Part 3 — the machine

```ts
export function computeExpectationLevel(
  payrollTier: PayrollTier,
  teamStrength: number,
): ExpectationLevel {
  let index = BASE_INDEX_BY_TIER[payrollTier];

  if (teamStrength >= ELITE_ROSTER_STRENGTH_THRESHOLD) index += 1;
  else if (teamStrength <= WEAK_ROSTER_STRENGTH_THRESHOLD) index -= 1;

  index = Math.max(0, Math.min(EXPECTATION_LEVEL_ORDER.length - 1, index));
  return EXPECTATION_LEVEL_ORDER[index];
}
```

- `let index = BASE_INDEX_BY_TIER[payrollTier];` — start at the position set by spending. It's `let`
  (changeable) because we're about to adjust it.
- `if (teamStrength >= 80) index += 1;` — if the roster is genuinely elite, bump the expectation up one
  level. `else if (teamStrength <= 65) index -= 1;` — if it's actually weak, drop it one level. (A
  middling roster leaves the baseline unchanged.)
- `index = Math.max(0, Math.min(EXPECTATION_LEVEL_ORDER.length - 1, index));` — **clamp** the position so
  it stays a valid spot in the list. `Math.min(length - 1, index)` stops it going past the last level
  (position 5); `Math.max(0, ...)` stops it going below the first (position 0). This guards against, say,
  a weak modest-payroll team dropping below position 0.
- `return EXPECTATION_LEVEL_ORDER[index];` — look up the level at that final position and return it.

**Why this is fair:** an expensive _elite_ roster is held to a title standard (baseline 4, bumped to 5),
but an expensive _mediocre_ roster (bad contracts) gets some benefit of the doubt (baseline 4, dropped to
3). And a cheap-but-surprisingly-good team earns a bump above the modest baseline. You're judged against
_your own situation._

---

## Zooming out

This is the "bar" half of the accountability system. It uses the ordered list of levels as a numeric
ladder: spending picks your starting rung, roster quality nudges you up or down one, and a clamp keeps
you on the ladder. The next file, `seasonEvaluation`, compares this expectation to what actually happened
to decide whether the owner's confidence in you rises or falls.

**Next file:** `gm/seasonEvaluation.md` — comparing the actual season result to this expectation.
