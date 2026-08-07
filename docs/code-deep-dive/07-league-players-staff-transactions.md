# Deep Dive 07 — Development, League Bootstrap, Rotation, Staff & News

The connective-tissue domains: `development/`, `league/`, `players/`, `rotation/`,
`staff/`, `transactions/`, `freeagency/`. All pure. These are the systems that tie the
big engines together — player growth/decline, how a league is planned, who plays, coach
effects, and how events become news. **Code blocks are real source.**

---

## `development/developPlayerRating.ts` — the aging curve (the star of this doc)

This is what gives a save its _timeline_ — the same player changes across seasons.

```ts
const YOUNG_DEVELOPMENT_AGE_CEILING = 26;
const DECLINE_START_AGE = 30;
const DEV_COACH_QUALITY_ANCHOR = 72; // 72 = neutral anchor across the whole codebase

export function developPlayerRating({
  overallRating,
  potentialRating,
  age,
  rng,
  developmentCoachQuality = 72,
  minutesPerGame,
  morale,
  facilitiesInvestmentDelta,
}): number {
  const room = potentialRating - overallRating;
  const coachBonus = (developmentCoachQuality - 72) * 0.03;
  const minutesBonus =
    minutesPerGame === undefined ? 0 : clamp((minutesPerGame - 24) * 0.05, -1.5, 1.5);
  const moraleBonus = morale === undefined ? 0 : clamp((morale - 70) * 0.03, -1.5, 1.5);
  const facilitiesBonus =
    facilitiesInvestmentDelta === undefined
      ? 0
      : clamp(facilitiesInvestmentDelta * 0.05, -0.6, 0.6);

  if (age <= YOUNG_DEVELOPMENT_AGE_CEILING && room > 0) {
    // young + has headroom → grow
    const growth = randomIntInclusive(rng, 1, Math.min(4, room));
    const coachedGrowth = Math.max(
      1,
      Math.min(
        room,
        Math.round(growth + coachBonus + minutesBonus + moraleBonus + facilitiesBonus),
      ),
    );
    return Math.min(potentialRating, overallRating + coachedGrowth);
  }
  if (age < DECLINE_START_AGE) {
    // prime years → small random drift
    return clampRating(overallRating + randomIntInclusive(rng, -1, 1));
  }
  const yearsPastDeclineStart = age - DECLINE_START_AGE; // past 30 → accelerating decline
  const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
  const decline = Math.max(
    0,
    randomIntInclusive(rng, baseDecline, baseDecline + 2) -
      coachBonus -
      minutesBonus -
      moraleBonus -
      facilitiesBonus,
  );
  return clampRating(overallRating - decline);
}
```

**Three life stages:** ≤26 with headroom → grow toward potential (faster with a good dev
coach, real minutes, high morale, good facilities); 27–29 → small directionless drift;
30+ → accelerating decline (`baseDecline` grows every 3 years past 30), which the four
bonuses can _dampen but never reverse_. Notice all four modifiers are **neutral-anchored**
(dev coach 72, minutes 24, morale 70, facilities 0) and **optional** — omit them and the
function behaves exactly as it did before those features existed. That "extend without
breaking existing behavior" pattern is everywhere in this codebase.

## `development/retirement.ts`

```ts
const RETIREMENT_RISK_START_AGE = 33;
const FORCED_RETIREMENT_AGE = 41;

export function retirementProbability(age, overallRating, morale?): number {
  if (age >= FORCED_RETIREMENT_AGE) return 1; // nobody plays forever
  if (age < RETIREMENT_RISK_START_AGE) return 0;
  const ageFactor = (age - 33) * 0.08; // ~+8%/yr after 33
  const ratingFactor = overallRating < 65 ? 0.15 : overallRating < 72 ? 0.05 : 0; // fringe players retire sooner
  const moraleFactor = morale === undefined ? 0 : (70 - morale) * 0.002; // misery nudges it up
  return Math.min(0.95, Math.max(0, ageFactor + ratingFactor + moraleFactor));
}
export function shouldRetire(age, overallRating, rng, morale?): boolean {
  return rng() < retirementProbability(age, overallRating, morale);
}
```

Zero risk before 33, climbing ~8%/year, higher for players who can't hold a rotation
rating, forced at 41. Deliberately conservative so leagues stay populated for many
seasons.

## `development/seasonAwards.ts` (briefly)

Pure functions — `computeMVP`, `computeRookieOfTheYear`,
`computeDefensivePlayerOfTheYear`, `computeSixthManOfTheYear`, `computeMostImprovedPlayer`
— each ranks the season's box-score aggregates by a category-specific formula and returns
the winner. Called by `advanceSeasonAction` (doc 08).

---

## `league/planLeaguePlayer.ts` — one player's bootstrap plan

```ts
export function planLeaguePlayer(input: PlanLeaguePlayerInput): LeaguePlayerPlan {
  const overallRating = deriveOverallRating(input.stats);
  const potentialRating = derivePotentialRating(overallRating, input.age);
  const performanceScore = computePerformanceScore(input.stats);
  const ageAdjustedScore = Math.min(99, performanceScore * ageValueMultiplier(input.age));
  const contract = generateContract({
    season: input.season,
    ageAdjustedScore,
    yearsOfExperience: input.yearsOfExperience,
    seed: input.seed,
  });
  return { overallRating, potentialRating, contract };
}
```

The pure "given real stats + age, produce a starting rating, potential, and a contract."
It's the seam between the reference data and a new league — `createLeagueAction` calls it
once per player. (With the current-rosters pipeline, the _rating_ now comes from the stored
seed rating; `planLeaguePlayer` still produces the contract.)

## `league/ratingFromStats.ts`

```ts
export function deriveOverallRating(stats: PlayerValuationStats): number {
  return Math.round(computePerformanceScore(stats)); // one rating formula, reused
}
export function derivePotentialRating(overallRating: number, age: number): number {
  const yearsOfUpside = Math.max(0, 26 - age);
  const headroom = Math.min(10, yearsOfUpside * 2); // youth = up to +10 ceiling
  return Math.min(99, overallRating + headroom);
}
```

`deriveOverallRating` is a thin wrapper over the valuation composite (one rating formula
everywhere). `derivePotentialRating` gives youth real headroom and veterans none — which
is exactly the `room` that `developPlayerRating` above consumes.

## `players/age.ts`

```ts
export function estimateAge(draftYear: number | null, season: number): number {
  if (!draftYear) return 27; // assume a league-average age
  return Math.max(19, season - draftYear + 22); // drafted ~age 22
}
export function ageFromBirthDate(birthDate: Date | null, season: number): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  const ref = new Date(Date.UTC(season, 9, 1)); // Oct 1 of the season
  let age = ref.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = ref.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}
```

Age from a real birth date when the dataset has one (the current pipeline does), falling
back to a draft-year estimate. `estimateExperienceFromAge` similarly fills experience.

---

## `rotation/resolveRotation.ts` — who plays, in what order

```ts
export function resolveRotation(roster: RosterPlayerForSimulation[]): ResolvedRotationEntry[] {
  const hasCustomRotation = roster.some((p) => slotOf(p) !== null);
  if (!hasCustomRotation) {
    // No user depth chart → exactly the old auto-rotation, targetMinutes always null.
    return buildAutoRotation(roster).map(({ player, rank }) => ({
      player,
      rank,
      targetMinutes: null,
    }));
  }
  // Place user-slotted players by their slot; auto-rank the rest into the open slots.
  const slotted = new Map<number, RosterPlayerForSimulation>();
  // ...fill explicit slots, then buildAutoRotation(unslotted) fills the gaps in ascending slot order...
  return [...slotted.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, player]) => ({
      player,
      rank,
      targetMinutes: explicitlySlotted.has(player.leaguePlayerId) ? targetMinutesOf(player) : null,
    }));
}
```

**One source of truth for "who plays":** this is consumed identically by box-score minute
allocation (doc 02) _and_ rotation-adjusted team strength, so your depth chart drives both.
If nobody has a custom slot it's byte-identical to the old auto-rotation (every CPU team
and every untouched roster) — again the "extend without changing existing behavior"
discipline. `autoRotation.ts` builds the default rank order + `RANK_MINUTE_WEIGHTS`;
`roleLabel.ts` maps a rank to STARTER/SIXTH_MAN/ROTATION_PLAYER/BENCH_PLAYER.

---

## `staff/coachModifiers.ts` — turning a coach into game numbers

```ts
const QUALITY_ANCHOR = 72;
const WIN_BONUS_CAP = 4; // rating-point-equivalent, same scale as HOME_COURT_ADVANTAGE = 3
const THREE_PA_MULTIPLIER = { PACE_AND_SPACE: 1.15, BALANCED: 1.0, GRIND_IT_OUT: 0.85 };

export function computeCoachWinBonus(quality: number | null): number {
  if (quality === null) return 0;
  return clamp((quality - 72) * 0.15, -WIN_BONUS_CAP, WIN_BONUS_CAP);
}
export function computeCoachBoxScoreModifier(
  quality: number | null,
  style: CoachStyle | null,
): CoachModifier {
  if (quality === null) return { benchTrustDelta: 0, threePaMultiplier: 1 };
  return {
    benchTrustDelta: clamp((quality - 72) / 27, -1, 1),
    threePaMultiplier: THREE_PA_MULTIPLIER[style ?? "BALANCED"],
  };
}
```

A head coach's quality/style is translated **once, here**, into the two things the sim
consumes: a small win-probability nudge (capped at 4 rating points — never a replacement
for talent) and a box-score modifier (`benchTrustDelta` shifts the deep-bench scratch
chance; `threePaMultiplier` shifts shot selection). Both `simulateGame` and `boxScore`
read the same formulas, so the coach effect can't drift between them. `generateStaff.ts`
creates the initial coaches/medical staff + salaries; `staffRetirement.ts` and
`coachOfTheYear.ts` handle aging and awards.

---

## `transactions/newsImportance.ts` — how big is a story

```ts
const IMPORTANCE_ORDER = ["MINOR", "STANDARD", "MAJOR", "BREAKING"];

export function importanceForRating(overallRating: number): NewsImportance {
  const tier = getPlayerValueTier(overallRating);
  if (tier === "SUPERSTAR") return "MAJOR";
  if (tier === "STAR") return "STANDARD";
  return "MINOR";
}
export function highestImportance(levels: NewsImportance[]): NewsImportance {
  return levels.reduce(
    (best, level) =>
      IMPORTANCE_ORDER.indexOf(level) > IMPORTANCE_ORDER.indexOf(best) ? level : best,
    "MINOR",
  );
}
```

A story about a superstar reads bigger than one about a bench player (reusing the _same_
value tiers as everywhere else); a multi-player trade is as big as its biggest piece. This
is the ranking behind the news feed. `describeTransaction.ts` / `describeGameEvents.ts` are
the (larger) pure `describe*` functions that turn a raw event into the human-readable
story text — the "data → prose" layer the actions write into `LeagueTransaction` rows.

---

## `freeagency/reSigningRights.ts` (briefly)

`computeReSigningMaxOfferCents(...)` computes the max a team can offer to keep its own
free agent (Bird-rights-style, letting a team exceed the cap to re-sign its own player),
and the re-sign UI + the CPU's `evaluateReSigningDecision` (doc 04) both consume it.

---

## Interview one-liners

- "Player development is a three-stage age curve — grow toward potential when young,
  drift in the prime, accelerating decline after 30 — with dev coach, minutes, morale, and
  facilities as small, neutral-anchored, optional modifiers that dampen decline but never
  reverse it. That's what gives each save its own timeline."
- "`resolveRotation` is the single source of truth for who plays; the same result drives
  both box-score minutes and rotation-adjusted team strength, and it's byte-identical to
  the old auto-rotation when the user hasn't set a depth chart."
- "A coach becomes exactly two numbers — a capped win-probability nudge and a box-score
  modifier — computed once so the two sim call sites can't disagree."
- "News importance reuses the same player value tiers everything else does, so a superstar
  move is automatically 'major' and a multi-player deal is as big as its biggest piece."
