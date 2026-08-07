# `valuation/playerValueTier.ts` — turning a rating number into a friendly label

**What this whole file is about:** "this player is a 91" doesn't mean much to a casual fan, but
"this player is a **Superstar**" does. This small file sorts a rating (60–99) into one of five
plain-English tiers. It's pure presentation on top of the rating scale — it doesn't create any new
opinion, it just gives a number a name.

Open the real file: `src/lib/valuation/playerValueTier.ts`. It's short, and by now every piece of it
should look familiar.

---

## The whole file

```ts
export type PlayerValueTier = "SUPERSTAR" | "STAR" | "STARTER" | "ROTATION" | "MINIMUM";

export const PLAYER_VALUE_TIER_LABEL: Record<PlayerValueTier, string> = {
  SUPERSTAR: "Superstar",
  STAR: "Star",
  STARTER: "Starter",
  ROTATION: "Rotation Player",
  MINIMUM: "Minimum-Level Player",
};

export function getPlayerValueTier(overallRating: number): PlayerValueTier {
  if (overallRating >= 90) return "SUPERSTAR";
  if (overallRating >= 80) return "STAR";
  if (overallRating >= 72) return "STARTER";
  if (overallRating >= 65) return "ROTATION";
  return "MINIMUM";
}
```

**The tier type:**

- `export type PlayerValueTier = "SUPERSTAR" | "STAR" | "STARTER" | "ROTATION" | "MINIMUM";` — a
  string-literal union (we've seen these): a `PlayerValueTier` is exactly one of these five words.
  These are the internal, all-caps codes.

**The label lookup table:**

- `PLAYER_VALUE_TIER_LABEL` is a `Record` (lookup table) mapping each internal code to its nice
  display text — e.g. `MINIMUM` → `"Minimum-Level Player"`. So the code uses the tidy `MINIMUM`
  everywhere, and the screen shows the friendly version. (Same "internal code vs. display text"
  pattern as `capStatusLabel.md`.)

**The machine:**

- `getPlayerValueTier(overallRating)` — takes a rating number, hands back a tier.
- It's a chain of `if` checks from highest to lowest (like `getApronLevel` back in `apron.md`):
  - `>= 90` → `SUPERSTAR` (the very best players).
  - `>= 80` → `STAR` (All-Star-caliber).
  - `>= 72` → `STARTER` (a solid starter — note 72, the "average starter" anchor from the rating
    formula).
  - `>= 65` → `ROTATION` (a useful bench/rotation player).
  - otherwise → `MINIMUM` (fringe, minimum-salary-level).
- The order matters for the same reason as always: a rating of 95 is "≥ 90" _and_ "≥ 80" _and_ "≥
  72"… — by checking the highest cutoff first and returning immediately, we correctly report the
  _top_ tier it clears.

---

## Zooming out

This file looks trivial, but it's used _all over_ the codebase — and that's the point. Whenever some
other system needs to reason in terms of "is this a star or a role player?" instead of raw numbers,
it calls `getPlayerValueTier`. The trade AI uses it to decide who's untouchable; the "does this
player fill a need?" check uses it; the news system uses it to decide how big a story about a player
is; the fans react to star power through it. Because they _all_ call this one function, "what counts
as a star" means the exact same thing everywhere — change the cutoffs here, and the whole app updates
together. It's the "single source of truth" idea again, applied to a simple label.

That completes the `valuation/` folder. **Next up:** the `contracts/` folder — `seededRandom.md` (the
predictable random-number machine) and `generateContract.md` (which turns a player's value into an
actual multi-year contract).
