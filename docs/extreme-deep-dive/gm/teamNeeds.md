# `gm/teamNeeds.ts` — figuring out what a roster is missing

**What this whole file is about:** the AI values a player more if they fill a real hole on the team.
This file looks at a roster and produces a list of its **needs** — no star scorer, no starting point
guard, thin bench, etc. The trade and draft AIs then give a bonus to any player who fills one of these.

Open the real file: `src/lib/gm/teamNeeds.ts`.

---

## Part 1 — the possible needs

```ts
export type TeamNeed =
  "STAR_SCORER" | "POINT_GUARD" | "RIM_PROTECTOR" | "WING_DEFENDER" | "BENCH_DEPTH";

export interface TeamNeedRosterPlayer {
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
}
```

- `TeamNeed` — the five kinds of holes a team can have: no star scorer, no starting-caliber point guard,
  no rim-protecting center, no wing defender, or not enough bench depth. (There's no "shooting" need,
  because the data doesn't track shooting well enough to judge it honestly — a documented choice.)
- `TeamNeedRosterPlayer` — the two things we need about each player to judge needs: their `position` and
  `overallRating`.

---

## Part 2 — the settings and a helper

```ts
const STARTER_THRESHOLD = 72;
const ROTATION_THRESHOLD = 65;
const MIN_BENCH_ROTATION_PLAYERS = 3;

function bestRatingAtPositions(
  roster: TeamNeedRosterPlayer[],
  positions: TeamNeedRosterPlayer["position"][],
): number {
  return roster
    .filter((p) => positions.includes(p.position))
    .reduce((best, p) => Math.max(best, p.overallRating), 0);
}
```

- `STARTER_THRESHOLD = 72` / `ROTATION_THRESHOLD = 65` — the same rating cutoffs used everywhere: 72 =
  "starter-caliber," 65 = "rotation-caliber." (Reusing the app-wide cutoffs means "starter" means the
  same thing here as elsewhere.)
- `MIN_BENCH_ROTATION_PLAYERS = 3` — beyond a 5-man starting group, a team needs at least 3 more
  rotation-caliber players to count as having real depth.
- `bestRatingAtPositions(roster, positions)` — finds the **best player** the team has at a given set of
  positions:
  - `.filter((p) => positions.includes(p.position))` — keep only players whose position is in the list
    we're asking about (`.includes` checks membership).
  - `.reduce((best, p) => Math.max(best, p.overallRating), 0)` — the running-total trick, but here it
    keeps a running **maximum** instead of a sum. It starts at `0` and, for each remaining player, keeps
    whichever is bigger (`Math.max`) — the current best or this player's rating. So it returns the highest
    rating at those positions (or 0 if the team has nobody there).

---

## Part 3 — the machine

```ts
export function computeTeamNeeds(roster: TeamNeedRosterPlayer[]): TeamNeed[] {
  const needs: TeamNeed[] = [];

  const hasStarOrBetter = roster.some((p) => {
    const tier = getPlayerValueTier(p.overallRating);
    return tier === "SUPERSTAR" || tier === "STAR";
  });
  if (!hasStarOrBetter) needs.push("STAR_SCORER");

  if (bestRatingAtPositions(roster, ["PG"]) < STARTER_THRESHOLD) needs.push("POINT_GUARD");
  if (bestRatingAtPositions(roster, ["C"]) < STARTER_THRESHOLD) needs.push("RIM_PROTECTOR");
  if (bestRatingAtPositions(roster, ["SF", "SG"]) < STARTER_THRESHOLD) needs.push("WING_DEFENDER");

  const rotationCaliberCount = roster.filter((p) => p.overallRating >= ROTATION_THRESHOLD).length;
  if (rotationCaliberCount < 5 + MIN_BENCH_ROTATION_PLAYERS) needs.push("BENCH_DEPTH");

  return needs;
}
```

- Start with an empty `needs` list, then check each possible hole and `.push` it if found.
- **Star scorer:** `roster.some((p) => ...)` — `.some(...)` returns true if **any** player passes the
  test (here, is a STAR-or-better tier). `if (!hasStarOrBetter)` — if the team has _no_ star (`!` =
  "not"), it needs one.
- **Point guard / rim protector / wing defender:** each checks whether the team's _best_ player at that
  position (via the helper) is below starter-caliber (72). If yes, that's a need. Note the wing check
  looks at both SF and SG positions together.
- **Bench depth:** count how many players are at least rotation-caliber (`.filter(...).length` = how many
  pass the test). `if (rotationCaliberCount < 5 + 3)` — a team needs at least 8 rotation-quality players
  (5 starters + 3 bench). Fewer than that = a bench-depth need.
- Return the list of needs found (possibly empty for a complete team).

**A subtle design choice:** positional needs are judged by the team's _best_ player at that spot, not the
average. A team with a great point guard and no backup isn't "thin at PG" in the way that matters for
adding a starter — so using the best player is the right measure.

---

## Zooming out

This turns a roster into a short shopping list. It reuses the app-wide rating tiers and cutoffs, so
"needs a starter" means the same thing everywhere. The trade AI and draft AI both call this and give a
value bonus to players who fill one of these needs — which is how the computer teams end up making moves
that _address their actual weaknesses_ instead of randomly collecting talent.

**Next file:** `gm/payrollTier.md` — bucketing a team's spending into four tiers for the expectation
system.
