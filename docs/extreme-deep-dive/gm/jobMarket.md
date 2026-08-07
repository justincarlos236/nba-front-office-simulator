# `gm/jobMarket.ts` — which teams will hire you, and on what leash

**What this whole file is about:** when you start a new franchise, you see a "job market" — all 30 teams,
but only some will hire you. This file decides that: it ranks every team by roster strength, labels each
as a "situation" (contender, rebuild, etc.), and checks whether your **reputation** is high enough for
that job. It also sets the starting difficulty ("leash") of each job.

Open the real file: `src/lib/gm/jobMarket.ts`. It teaches working with a `Map` and computing percentile
rankings.

---

## Part 1 — the situations and their settings

```ts
export type JobSituation =
  "CONTENDER" | "PLAYOFF_CONTENDER" | "RETOOLING" | "REBUILD" | "BOTTOMING_OUT";

const REPUTATION_REQUIRED: Record<JobSituation, number> = {
  CONTENDER: 70,
  PLAYOFF_CONTENDER: 50,
  RETOOLING: 35,
  REBUILD: 0,
  BOTTOMING_OUT: 0,
};

const STARTING_OWNER_CONFIDENCE: Record<JobSituation, number> = {
  CONTENDER: 52,
  PLAYOFF_CONTENDER: 60,
  RETOOLING: 65,
  REBUILD: 70,
  BOTTOMING_OUT: 72,
};
```

- `JobSituation` — five labels for how good a team currently is, best to worst.
- `REPUTATION_REQUIRED` — the reputation you need for a team in each situation to hire you. A **contender**
  demands a 70 (only proven GMs); a **rebuild** or **bottoming-out** team will hire _anyone_ (requirement
  0). This is the gate.
- `STARTING_OWNER_CONFIDENCE` — the "leash": how much owner confidence you _start_ with at each job. A
  contender starts you low (52 — a **short leash**, win now or else); a bottoming-out team starts you high
  (72 — a patient owner). (There's also a `LEASH_LABEL` table with text like "Short leash" / "Patient
  owner.")

---

## Part 2 — labeling a team by its rank

```ts
export function computeJobSituation(strengthPercentile: number): JobSituation {
  if (strengthPercentile >= 0.85) return "CONTENDER";
  if (strengthPercentile >= 0.65) return "PLAYOFF_CONTENDER";
  if (strengthPercentile >= 0.4) return "RETOOLING";
  if (strengthPercentile >= 0.2) return "REBUILD";
  return "BOTTOMING_OUT";
}
```

- Takes a `strengthPercentile` (0 = league's weakest roster, 1 = strongest) and buckets it with the usual
  highest-first threshold chain. The top ~15% are contenders; the bottom ~20% are bottoming out.

---

## Part 3 — building a job offer

```ts
export interface JobOffer {
  situation: JobSituation;
  reputationRequired: number;
  available: boolean;
  startingOwnerConfidence: number;
  leashLabel: string;
}

export function computeJobOffer(strengthPercentile: number, gmReputation: number): JobOffer {
  const situation = computeJobSituation(strengthPercentile);
  const reputationRequired = REPUTATION_REQUIRED[situation];
  return {
    situation,
    reputationRequired,
    available: gmReputation >= reputationRequired,
    startingOwnerConfidence: STARTING_OWNER_CONFIDENCE[situation],
    leashLabel: LEASH_LABEL[situation],
  };
}
```

- For one team, this builds the full offer: figure out its `situation`, look up the `reputationRequired`,
  and — the key line — `available: gmReputation >= reputationRequired`. That comparison is a true/false
  value: the job is **available** to you only if your reputation clears the bar. It also attaches the
  starting confidence and leash label for that situation.
- So a rookie GM sees the contender jobs marked "not available"; a Hall of Famer sees them all open.

---

## Part 4 — ranking teams into percentiles

```ts
export function computeStrengthPercentiles(
  strengthByTeam: Map<string, number>,
): Map<string, number> {
  const entries = [...strengthByTeam.entries()].sort((a, b) => a[1] - b[1]); // ascending
  const n = entries.length;
  const result = new Map<string, number>();
  entries.forEach(([teamId], i) => {
    result.set(teamId, n > 1 ? i / (n - 1) : 1);
  });
  return result;
}
```

This converts each team's raw strength into a **percentile** (0-to-1 rank).

- `strengthByTeam: Map<string, number>` — a **`Map`** (lookup table) from a team's id to its strength
  number.
- `[...strengthByTeam.entries()]` — `.entries()` turns the map into a list of `[teamId, strength]` pairs;
  the `[...]` spreads it into a real list. `.sort((a, b) => a[1] - b[1])` sorts those pairs by the
  strength value (`a[1]` is the second item of a pair, the number) **ascending** (weakest first).
- `entries.forEach(([teamId], i) => result.set(teamId, ...))` — walk the sorted list. `([teamId], i)`
  destructures each pair to grab just the id, plus its position `i`. `i / (n - 1)` turns the position into
  a 0-to-1 rank: the weakest team (position 0) gets 0, the strongest (position n−1) gets 1, everyone else
  in between. `result.set(teamId, ...)` records it in a new map. (`n > 1 ? ... : 1` guards against a
  single-team league.)
- The result: a map from each team id to its 0-to-1 strength percentile — exactly what `computeJobOffer`
  needs.

---

## Part 5 — measuring each team's strength

```ts
export function computeStrengthByTeam(
  players: { teamId: string | null; overallRating: number }[],
): Map<string, number> {
  const ratingsByTeam = new Map<string, number[]>();
  for (const p of players) {
    if (!p.teamId) continue;
    const list = ratingsByTeam.get(p.teamId) ?? [];
    list.push(p.overallRating);
    ratingsByTeam.set(p.teamId, list);
  }
  const result = new Map<string, number>();
  for (const [teamId, ratings] of ratingsByTeam) {
    result.set(teamId, computeTeamStrength(ratings));
  }
  return result;
}
```

This groups a big list of players by their team and computes each team's strength.

- First loop — **group players by team.** `ratingsByTeam` is a map from team id to a _list of ratings_.
  For each player: skip free agents (`if (!p.teamId) continue;`), then `ratingsByTeam.get(p.teamId) ?? []`
  gets the team's rating list so far (or a fresh empty list `[]` if it's the first player seen for that
  team), pushes this player's rating onto it, and stores it back. This is the standard "group items into
  buckets by a key" pattern.
- Second loop — **turn each team's rating list into a strength number** by calling `computeTeamStrength`
  (the weighted-average machine from `simulation/teamStrength.md`). The result is a map from team id to
  strength — which `computeStrengthPercentiles` then ranks.

---

## Zooming out

This file closes the career loop: your reputation (built in `careerRecord.md`) decides which of the 30
teams will hire you and how much rope you get. Under the hood, it's a clean pipeline: group players →
team strengths → percentile ranks → a per-team offer gated by your reputation. It leans on the `Map`
data structure a lot (a built-in lookup table with `.get`/`.set`/`.entries`) and reuses the same
team-strength math the game simulation uses — so "how good is this team" means the same thing on the job
market as it does on the court.

**Next file:** the remaining `gm/` pieces — `reSigningDecision` (whether a CPU keeps its own free agent),
plus the message/context helpers (`ownershipMessages`, `actionCenter`, `teamDraftContext`).
