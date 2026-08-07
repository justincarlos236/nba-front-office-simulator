# Deep Dive 02 — Simulation (with real code)

Folder: `src/lib/simulation/`. All pure (randomness injected). **Code blocks are the
real source.**

**Flow:** `generateSchedule` → per game `teamStrength` → `simulateGame` → `boxScore`
explains the score → `leagueEvents` rolls injuries/CPU activity → season end:
`playoffSeeding` → `playInTournament` → `simulateSeries`. The user's own playoff games
can use `simulateLiveGame` instead.

---

## `simulateGame.ts`

```ts
const HOME_COURT_ADVANTAGE = 3;
const WIN_PROB_STEEPNESS = 0.07;
const AVERAGE_TEAM_SCORE = 112;
const SCORE_RANDOMNESS = 22;
const MIN_MARGIN = 3;
const MAX_MARGIN = 22;

export function computeStrengthDiff(
  homeStrength,
  awayStrength,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
): number {
  return homeStrength + HOME_COURT_ADVANTAGE + homeCoachBonus - awayStrength - awayCoachBonus;
}

export function computeHomeWinProbability(
  homeStrength,
  awayStrength,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
): number {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  return 1 / (1 + Math.exp(-WIN_PROB_STEEPNESS * diff));
}

export function simulateGame(
  homeStrength,
  awayStrength,
  rng = Math.random,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
): SimulatedGameResult {
  const homeWinProbability = computeHomeWinProbability(
    homeStrength,
    awayStrength,
    homeCoachBonus,
    awayCoachBonus,
  );
  const homeWon = rng() < homeWinProbability;

  const loserScore = Math.round(AVERAGE_TEAM_SCORE + (rng() - 0.5) * SCORE_RANDOMNESS);
  const margin = MIN_MARGIN + Math.round(rng() * (MAX_MARGIN - MIN_MARGIN));
  const winnerScore = loserScore + margin;

  return homeWon
    ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
    : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
}
```

**What it does:** a strength difference → a logistic win probability → a coin flip
against it (`rng()`), then a plausible loser score (~112±22) and a random margin. Three
`rng()` calls, O(1). `rng` is injected, so tests force exact outcomes.

---

## `teamStrength.ts` (whole file)

```ts
const ROTATION_SIZE = 9;
const ROTATION_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const BENCH_WEIGHT = 0.4;

export function computeTeamStrength(playerRatings: number[]): number {
  if (playerRatings.length === 0) return 0;
  const sorted = [...playerRatings].sort((a, b) => b - a);
  let weightedSum = 0,
    weightTotal = 0;
  sorted.forEach((rating, i) => {
    const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;
    weightedSum += rating * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
```

Sort best-first, weight the top 9 heavily (best player 1.4×), everyone else 0.4×,
return the weighted average. `[...ratings]` copies before sorting (never mutates the
caller). NBA is star-driven, so a plain average would be wrong.

---

## `generateSchedule.ts`

**The exact NBA opponent weighting** — the cross-division part uses a graph trick:

```ts
for (let d1 = 0; d1 < divisions.length; d1++) {
  for (let d2 = d1 + 1; d2 < divisions.length; d2++) {
    const teamsX = divisions[d1];
    const teamsY = divisions[d2];
    const bonusMatchings = new Set(shuffledIndices(5, rng).slice(0, 3)); // 3 of 5 => 4-game
    for (let k = 0; k < 5; k++) {
      const count = bonusMatchings.has(k) ? 4 : 3;
      for (let i = 0; i < teamsX.length; i++) {
        const j = (i + k) % teamsY.length; // matching k
        pairs.push({ teamA: teamsX[i].leagueTeamId, teamB: teamsY[j].leagueTeamId, count });
      }
    }
  }
}
```

Two 5-team divisions form a complete bipartite graph K(5,5), which splits into exactly
5 "perfect matchings" (`team i ↔ team (i+k)%5`). Marking 3 as 4-game and 2 as 3-game
makes **every** team land on exactly 6 four-game + 4 three-game opponents — the real
6-of-10/4-of-10 split, done exactly, no search.

**The back-to-back constraint** in the day-by-day assignment:

```ts
function isEligible(teamId: string, day: number): boolean {
  const last = lastPlayedDay.get(teamId);
  if (last === undefined || last !== day - 1) return true;
  return (consecutiveStreak.get(teamId) ?? 0) < 2; // can't play 3 days in a row
}
```

And candidate pairs each day are sorted so the team **furthest behind** goes first (keeps
all 30 finishing together):

```ts
.sort((listA, listB) => {
  const minA = Math.min(gamesRemainingByTeam.get(gA.homeLeagueTeamId) ?? 0, gamesRemainingByTeam.get(gA.awayLeagueTeamId) ?? 0);
  const minB = Math.min(gamesRemainingByTeam.get(gB.homeLeagueTeamId) ?? 0, gamesRemainingByTeam.get(gB.awayLeagueTeamId) ?? 0);
  return minB - minA;
});
```

The public entry point ties the three stages together and numbers games in day order:

```ts
export function generateRoundRobinSchedule(teams: ScheduleTeam[], seed: string): ScheduledGame[] {
  const rng = createSeededRandom(seed);
  const pairs = buildPairGames(teams, rng);
  const games = pairs.flatMap(expandPairToGames);
  const scheduled = assignDays(games, rng);
  scheduled.sort((a, b) => a.dayIndex - b.dayIndex);
  return scheduled.map((game, index) => ({ ...game, gameNumber: index + 1 }));
}
```

---

## `boxScore.ts` — explaining an already-decided score

**Minutes allocation** (240 team-minutes), with user rotation targets + garbage time +
deep-bench scratch:

```ts
const scratchChance = clamp(
  DEEP_BENCH_SCRATCH_CHANCE - (coachModifier?.benchTrustDelta ?? 0) * 0.15,
  0.1,
  0.6,
);

const weights = rotation.map(({ player, rank, targetMinutes }) => {
  const baseWeight =
    targetMinutes !== null ? targetMinutes * WEIGHT_PER_MINUTE : (RANK_MINUTE_WEIGHTS[rank] ?? 0);
  if (baseWeight <= 0) return 0;
  if (rank >= DEEP_BENCH_SCRATCH_RANK && rng() < scratchChance) return 0; // DNP-CD
  const ratingMultiplier = 0.8 + (player.overallRating / 99) * 0.2;
  const garbageMultiplier = rank < 5 ? 1 - 0.4 * garbageFactor : 1 + 0.5 * garbageFactor; // blowout -> bench
  const variance = 1 + triangular(rng, rank < DEEP_BENCH_SCRATCH_RANK ? 0.15 : 0.3);
  return Math.max(0, baseWeight * ratingMultiplier * garbageMultiplier * variance);
});
const minutes = weights.map((w) => clamp(Math.round((w / totalWeight) * TEAM_MINUTES), 0, 40));
```

A user's `targetMinutes` becomes the base weight (so rotation settings guide the sim),
but still flows through variance/garbage/coach; a residual loop (not shown) nudges the
top-minute players ±1 so it sums to exactly 240.

**Real players' stats drift with their in-save rating** — the key line:

```ts
const baselineRating = deriveOverallRating({/* the player's frozen real stat line */});
const ratio = clamp(currentRating / Math.max(baselineRating, 1), RATIO_CLAMP_MIN, RATIO_CLAMP_MAX); // 0.5..1.8
const countingRatio = 1 + (ratio - 1) * COUNTING_STAT_ELASTICITY; // 0.85
// ...pts36 = per36(realStat.pointsPerGame) * countingRatio, etc.
```

`ratio` = current rating ÷ the rating recomputed from their real line. So a player who
_developed_ produces more; a _declined_ one produces less — without storing "rating at
creation."

**Reconciling to the fixed team score** — scale _attempts_, then plug the residual:

```ts
const scaleFactor = targetScore / rawTotal;
const rescaled = rawPlayers.map((p) => {
  const fgAttempted = Math.floor(p.fgAttempted * scaleFactor);
  // ...re-roll makes from the same percentages...
});
let residual = targetScore - rescaled.reduce((sum, p) => sum + p.points, 0);
// add/remove a made FT (or downgrade a 3 to a 2) on the highest-minute players until residual === 0
```

Scaling attempts (not points) keeps makes ≤ attempts legal; the last point or two is
plugged via free throws. `generateBoxScore` runs this for both teams and also band-
clamps team rebounds (28–58) and assists (8–38).

---

## `leagueEvents.ts`

**Injury roll** (2%/team/game, staff + investment factors, uniform victim, tiered
severity):

```ts
export function rollForTeamInjury(healthyRoster, rng = Math.random, chance = 0.02, medicalStaffQuality = null, medicalInvestmentDelta = 0): InjuryRollResult | null {
  if (healthyRoster.length === 0) return null;
  const staffFrequencyFactor = medicalStaffQuality === null ? 1
    : clamp(1 - (medicalStaffQuality - 72) * 0.01, 0.6, 1.3);
  const investmentFrequencyFactor = clamp(1 - medicalInvestmentDelta * 0.015, 0.8, 1.2);
  if (rng() >= chance * staffFrequencyFactor * investmentFrequencyFactor) return null;

  const injured = pick(healthyRoster, rng);   // uniform: injuries hit stars and bench alike
  const tierRoll = rng();
  if (tierRoll < 0.6) return { ...injured, durationGames: /*1-5*/, severity: "DAY_TO_DAY", injuryName: pick(MINOR_INJURIES, rng) };
  if (tierRoll < 0.9) return { ...injured, durationGames: /*6-15*/, severity: "OUT", injuryName: pick(MODERATE_INJURIES, rng) };
  return { ...injured, durationGames: /*16-30*/, severity: "SEASON_ENDING", injuryName: pick(MAJOR_INJURIES, rng) };
}

export function shouldTriggerEvent(gamesInBatch, chancePerGame, rng = Math.random): boolean {
  if (gamesInBatch <= 0) return false;
  const chance = 1 - (1 - chancePerGame) ** gamesInBatch;   // P(at least one) across the batch
  return rng() < chance;
}
```

**CPU-vs-CPU trades** — both teams must independently accept _and_ it must be cap-legal:

```ts
const aAccepts = evaluateTradeOffer({
  respondingTeam: { ...teamA },
  currentSeason: season,
  incoming: [targetAsset],
  outgoing: [offerAsset],
});
if (aAccepts.decision !== "ACCEPT") continue;
const bAccepts = evaluateTradeOffer({
  respondingTeam: { ...teamB },
  currentSeason: season,
  incoming: [offerAsset],
  outgoing: [targetAsset],
});
if (bAccepts.decision !== "ACCEPT") continue;

const validation = validateTrade({
  season,
  assets,
  teamCapStates: { [teamA.leagueTeamId]: teamA.capState, [teamB.leagueTeamId]: teamB.capState },
});
if (validation.isValid) {
  return {/* the executed swap + both scores */};
}
```

`pickTradeTarget`/`pickTradeOffer` (not shown) pick a needs/identity-appropriate target
and a value-matched surplus player, re-rolling up to 5 times. The CPU is held to the
exact same `evaluateTradeOffer` + `validateTrade` gates a user's trade faces.

---

## `playoffSeeding.ts` (whole core)

```ts
export function winPct(entry: StandingsEntry): number {
  const gamesPlayed = entry.wins + entry.losses;
  return gamesPlayed > 0 ? entry.wins / gamesPlayed : 0;
}
export function pickHigherSeed(a, b): StandingsEntry {
  const pctDiff = winPct(b) - winPct(a);
  if (pctDiff !== 0) return pctDiff < 0 ? a : b;
  return b.wins - a.wins > 0 ? b : a; // tie -> more wins
}
export function seedConference(standings: StandingsEntry[]): ConferenceSeeding {
  const sorted = [...standings].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);
  return {
    directQualifiers: sorted.slice(0, 6).map((s) => s.leagueTeamId), // seeds 1-6
    playInTeams: sorted.slice(6, 10).map((s) => s.leagueTeamId), // seeds 7-10
  };
}
```

## `playInTournament.ts` — the real A/B/C format

```ts
const gameA = simulateGame(strength(seeds.seven), strength(seeds.eight), rng); // 7v8, winner = final 7
const finalSeventhSeed = gameA.homeWon ? seeds.seven : seeds.eight;
const gameALoser = gameA.homeWon ? seeds.eight : seeds.seven;
const gameB = simulateGame(strength(seeds.nine), strength(seeds.ten), rng); // 9v10, loser out
const gameBWinner = gameB.homeWon ? seeds.nine : seeds.ten;
const gameC = simulateGame(strength(gameALoser), strength(gameBWinner), rng); // loser A v winner B
const finalEighthSeed = gameC.homeWon ? gameALoser : gameBWinner; // = final 8
```

## `simulateSeries.ts` — best-of-7, 2-2-1-1-1

```ts
export function isHigherSeedHomeGame(gameNumber: number): boolean {
  return [1, 2, 5, 7].includes(gameNumber);
}
export function simulateSeriesToCompletion(
  higherStrength,
  lowerStrength,
  winsNeeded,
  startState = { higherSeedWins: 0, lowerSeedWins: 0 },
  rng = Math.random,
): SeriesResult {
  let state = startState;
  const games: SeriesGameResult[] = [];
  while (state.higherSeedWins < winsNeeded && state.lowerSeedWins < winsNeeded) {
    const { newState, game } = simulateNextSeriesGame(state, higherStrength, lowerStrength, rng);
    state = newState;
    games.push(game);
  }
  return { finalState: state, winnerIsHigherSeed: state.higherSeedWins >= winsNeeded, games };
}
```

---

## `simulateLiveGame.ts` — quarter-by-quarter

The **empirically calibrated** per-quarter sensitivity + a period sim:

```ts
const AVERAGE_QUARTER_SCORE = 28;         // 112 / 4
const QUARTER_STRENGTH_SENSITIVITY = 0.11; // fit so 4 summed quarters match computeHomeWinProbability within ~1%

export function simulateQuarter(homeStrength, awayStrength, homeCoachBonus = 0, awayCoachBonus = 0, rng = Math.random): PeriodScore {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  const meanMargin = diff * QUARTER_STRENGTH_SENSITIVITY;
  return simulatePeriod(meanMargin, AVERAGE_QUARTER_SCORE, QUARTER_SCORE_RANDOMNESS, MIN_QUARTER_SCORE, rng);
}

export function simulateLiveGame(homeStrength, awayStrength, homeCoachBonus = 0, awayCoachBonus = 0, rng = Math.random): LiveGameResult {
  const quarters: PeriodScore[] = [];
  for (let i = 0; i < 4; i++) quarters.push(simulateQuarter(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus, rng));
  let homeScore = quarters.reduce((s, q) => s + q.home, 0);
  let awayScore = quarters.reduce((s, q) => s + q.away, 0);
  const overtimes: PeriodScore[] = [];
  while (homeScore === awayScore && overtimes.length < MAX_OVERTIME_PERIODS) {
    const ot = simulateOvertimePeriod(...); overtimes.push(ot); homeScore += ot.home; awayScore += ot.away;
  }
  return { quarters, overtimes, finalHomeScore: homeScore, finalAwayScore: awayScore, homeWon: homeScore > awayScore };
}
```

The winner **emerges** from summing periods (nothing decided upfront). `0.11` was fit
(a script simulated 20,000 games per strength differential) so compounding 4 quarters
still matches the single-shot win-probability model.

**Distributing the authoritative box score across periods** with the largest-remainder
method (so per-period stats always sum to the real totals):

```ts
function allocateAcrossPeriods(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / totalWeight) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const byFraction = raw
    .map((r, i) => ({ index: i, fraction: r - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k % byFraction.length].index] += 1;
  return result;
}
```

---

## Interview one-liners

- "The schedule reproduces the exact NBA opponent split by decomposing cross-division
  matchups into 5 perfect matchings of a K(5,5) graph, then lays them on a calendar that
  caps back-to-backs and keeps all 30 teams finishing together."
- "Box scores are generated top-down and reconciled to the fixed team score by rescaling
  _attempts_, not points, so makes ≤ attempts always holds."
- "Real players' stats drift with their in-save rating via an elasticity ratio, so
  development shows in the box score, not just the number."
- "CPU trades pass the same mutual-accept and cap-legality gates a user's trade does."
