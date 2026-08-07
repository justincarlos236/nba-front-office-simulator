# Deep Dive 06 — Draft

Folder: `src/lib/draft/`. All pure. Generates a prospect class, runs the real NBA
lottery + draft order, and lets CPU teams pick with the same team-perspective logic the
trade AI uses. (Prospects are currently _generated_ fictional players — Phase 2 will
replace them with real ones.) **Code blocks are real source.**

**Flow:** `generateDraftClass` (60 prospects) → `computeDraftOrder` (lottery + reverse
standings) → per pick, `pickBestProspectForTeam` (CPU) or the user picks → `scoutingProfile`
/ `prospectBio` decorate the board for display.

---

## `generateDraftClass.ts` — the prospect class

The pick-value curve and per-pick generation:

```ts
export const CLASS_SIZE = 60;
export const OVERALL_AT_PICK_1 = 72,
  OVERALL_AT_PICK_60 = 62;
export const POTENTIAL_AT_PICK_1 = 97,
  POTENTIAL_AT_PICK_60 = 70;
const RATING_VARIANCE = 6; // +/- swing so pick order isn't perfectly predictive

export function expectedRatingForPick(pick: number, atPick1: number, atPick60: number): number {
  const t = (pick - 1) / (CLASS_SIZE - 1); // 0 at pick 1, 1 at pick 60
  return atPick1 + (atPick60 - atPick1) * t; // linear interpolation
}

export function generateDraftClass(rng: () => number = Math.random): GeneratedProspect[] {
  const prospects: GeneratedProspect[] = [];
  for (let pick = 1; pick <= CLASS_SIZE; pick++) {
    const baseOverall = expectedRatingForPick(pick, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60);
    const basePotential = expectedRatingForPick(pick, POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60);
    const overallRating = Math.max(
      60,
      Math.min(
        99,
        Math.round(baseOverall + randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE)),
      ),
    );
    const potentialRating = Math.max(
      overallRating,
      Math.min(
        99,
        Math.round(basePotential + randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE)),
      ),
    );
    const age = pick <= 14 ? randomIntInclusive(rng, 19, 21) : randomIntInclusive(rng, 19, 22);
    // ...position, physical profile, origin, comparison player...
    prospects.push({
      fullName: generateProspectName(rng),
      position,
      age,
      overallRating,
      potentialRating /* ... */,
    });
  }
  return prospects;
}
```

**Key idea:** rookies enter _low_ overall (72 → 62 across the class) but with real
**potential** (97 → 70) — the top pick isn't an instant star, its _upside_ is what
separates it. `±6` variance means pick order is only a _tendency_: some late picks
outperform, some early picks bust, like a real draft. Note `POTENTIAL_AT_PICK_1 = 97`,
`OVERALL_AT_PICK_60 = 62` are reused by `gm/draftPickTradeValue.ts` so a pick's _trade_
value rides the exact same curve.

---

## `draftLottery.ts` — the real post-2019 odds

```ts
export const LOTTERY_ODDS: Readonly<Record<number, number>> = {
  1: 0.14,
  2: 0.14,
  3: 0.14, // three worst teams share identical top odds (anti-tank reform)
  4: 0.125,
  5: 0.105,
  6: 0.09,
  7: 0.075,
  8: 0.06,
  9: 0.045,
  10: 0.03,
  11: 0.02,
  12: 0.015,
  13: 0.01,
  14: 0.005,
};

function weightedDraw(teams: LotteryTeam[], rng: () => number): LotteryTeam {
  const totalWeight = teams.reduce((sum, t) => sum + (LOTTERY_ODDS[t.seed] ?? 0), 0);
  let roll = rng() * totalWeight;
  for (const team of teams) {
    roll -= LOTTERY_ODDS[team.seed] ?? 0;
    if (roll <= 0) return team;
  }
  return teams[teams.length - 1];
}

export function runLottery(teams: LotteryTeam[], rng: () => number = Math.random): string[] {
  const remaining = [...teams];
  const winners: string[] = [];
  for (let i = 0; i < Math.min(4, teams.length); i++) {
    const winner = weightedDraw(remaining, rng); // weighted draw WITHOUT replacement
    winners.push(winner.leagueTeamId);
    remaining.splice(remaining.indexOf(winner), 1);
  }
  const rest = [...remaining].sort((a, b) => a.seed - b.seed).map((t) => t.leagueTeamId);
  return [...winners, ...rest];
}
```

The odds are **real published NBA data** (the three worst records flattened to 14% each,
so tanking to be _the_ worst no longer meaningfully helps). `weightedDraw` is the classic
"walk the cumulative weights until the roll runs out" algorithm — this is your concrete
"a real weighted-probability algorithm" talking point. Picks 1–4 are drawn without
replacement; picks 5–14 fall in reverse-standings order.

## `draftOrder.ts` — the full 60-pick order

```ts
export function computeDraftOrder(allTeams, playoffTeamIds, rng = Math.random): string[] {
  const seededLotteryTeams = getSeededLotteryTeams(allTeams, playoffTeamIds); // non-playoff, worst = seed 1
  const lotteryOrder = runLottery(seededLotteryTeams, rng); // picks 1-14
  const playoffOrder = [...playoffTeams]
    .sort((a, b) => winPct(a) - winPct(b))
    .map((t) => t.leagueTeamId); // 15-30
  const round1Order = [...lotteryOrder, ...playoffOrder];
  const round2Order = [...allTeams]
    .sort((a, b) => winPct(a) - winPct(b))
    .map((t) => t.leagueTeamId); // 31-60
  return [...round1Order, ...round2Order];
}
```

Picks 1–14 lottery, 15–30 playoff teams by **reverse regular-season record** (the real
rule — not playoff performance), 31–60 all teams by reverse record with no lottery.

## `draftAi.ts` — how a CPU team picks

```ts
const WIN_NOW_WEIGHTS    = { overall: 0.75, potential: 0.25 };
const REBUILDING_WEIGHTS = { overall: 0.4,  potential: 0.6 };
const BASELINE_WEIGHTS   = { overall: 0.6,  potential: 0.4 };
const PERSONALITY_POTENTIAL_MULTIPLIER = { PROSPECT_LOVER: 1.15 };
const PERSONALITY_OVERALL_MULTIPLIER   = { WIN_NOW: 1.1, CONSERVATIVE: 1.1 };

export function scoreProspectForTeam(prospect, team, rng): number {
  const weights = isWinNow(team.identity) ? { ...WIN_NOW_WEIGHTS }
    : isRebuilding(team.identity) ? { ...REBUILDING_WEIGHTS } : { ...BASELINE_WEIGHTS };
  if (PERSONALITY_POTENTIAL_MULTIPLIER[team.personality]) weights.potential *= ...;
  if (PERSONALITY_OVERALL_MULTIPLIER[team.personality])   weights.overall   *= ...;

  let score = prospect.overallRating * weights.overall + prospect.potentialRating * weights.potential;
  if (team.needs.some((need) => playerFillsNeed(asTradeAsset(prospect), need))) score *= NEED_FIT_BONUS_MULTIPLIER;
  const noise = team.personality === "AGGRESSIVE" ? 0.1 : 0.06;
  score *= 1 + (rng() - 0.5) * noise;
  return score;
}

export function pickBestProspectForTeam(available, team, rng) { /* strict argmax of scoreProspectForTeam */ }
```

**The elegant part:** there is **no scripted "reach roll."** A rebuilding team genuinely
weights potential 0.6 vs a contender's 0.25, a `PROSPECT_LOVER` weights it higher still,
and a real positional need multiplies a fitting prospect by `NEED_FIT_BONUS_MULTIPLIER`
(the _same_ constant the trade AI uses). So reaches, slides, and upside picks all
**emerge** from real per-team scoring differences — and `AGGRESSIVE` teams just get a
wider noise band (0.1 vs 0.06), a real higher chance of a reach rather than a separate
mechanic. It reuses `playerFillsNeed`/`TeamNeed`/`TeamIdentity`/`GmPersonality` from the
trade AI (doc 04) — a draft pick is just a one-sided "would we want this asset."

## `futurePicks.ts` — tradeable future picks

```ts
export const FUTURE_PICK_WINDOW_YEARS = 5;

export function buildFuturePickRows(leagueId, teamIds, seasons): FuturePickRow[] {
  const rows: FuturePickRow[] = [];
  for (const season of seasons)
    for (const teamId of teamIds) {
      rows.push({ leagueId, season, round: 1, originalTeamId: teamId, currentOwnerId: teamId });
      rows.push({ leagueId, season, round: 2, originalTeamId: teamId, currentOwnerId: teamId });
    }
  return rows;
}
```

Every team owns its own picks for a rolling 5-year window from day one (`originalTeamId
=== currentOwnerId` until traded). `overallPickNumber` is added `null` by the caller — a
pick's slot isn't known until that season's lottery runs. This is why a 2029 first-rounder
can be traded years early: it's just a row whose `currentOwnerId` changes.

## `scoutingProfile.ts` — flavor over the real numbers

```ts
export function deriveScoutingProfile(prospect: ScoutableProspect): ScoutingProfile {
  const rng = createSeededRandom(`${prospect.id}-scouting`); // deterministic per prospect
  const bias = POSITION_BIAS[prospect.position] ?? {}; // PG skews playmaking, C skews rebounding, ...
  const attributes = {
    scoring: clampAttribute(
      prospect.overallRating + (bias.scoring ?? 0) + randomInRange(rng, -10, 10),
    ),
    // ...playmaking, defense, rebounding, athleticism the same way...
  };
  const ranked = Object.entries(attributes).sort((a, b) => b[1] - a[1]);
  const strengths = ranked.slice(0, 2).map(([k]) => ATTRIBUTE_LABELS[k]);
  const weaknesses = ranked
    .slice(-2)
    .map(([k]) => ATTRIBUTE_LABELS[k])
    .reverse();
  return { ...attributes, strengths, weaknesses };
}

export function computeScoutingConfidence(age: number): ScoutingConfidence {
  if (age <= 19) return "LOW";
  if (age <= 21) return "MEDIUM";
  return "HIGH";
}
export function computeProjectedDraftRange(overallRating, classOverallRatings): string {
  const rank = classOverallRatings.filter((r) => r > overallRating).length + 1;
  if (rank <= 14) return "Lottery Pick (1-14)";
  if (rank <= 30) return "Late First Round";
  if (rank <= 45) return "Early Second Round";
  return "Late Second Round";
}
```

**Purely display-derived, never a hidden mechanic:** the sim only ever uses
`overallRating`/`potentialRating`; these five scouting sub-attributes, strengths/
weaknesses, a "scouting confidence" (younger = more of an unknown, flavor only), and a
projected range are all pure functions of data that already exists, seeded per prospect.
No ratings are hidden from the user.

## `prospectBio.ts` — physical profile, origin, comparison

```ts
const HEIGHT_RANGE_INCHES = { PG: [72, 76], SG: [74, 78], SF: [76, 80], PF: [79, 83], C: [82, 87] };
const INTERNATIONAL_RATE = 0.2;

export function generateOrigin(rng: () => number): ProspectOrigin {
  if (rng() < INTERNATIONAL_RATE) { const o = INTERNATIONAL_ORIGINS[...]; return { collegeOrTeam: o.team, isInternational: true, nationality: o.nationality }; }
  return { collegeOrTeam: DOMESTIC_COLLEGES[...], isInternational: false, nationality: "USA" };
}

export function pickComparisonPlayerName(rng, position, potentialRating): string {
  const tier = getPlayerValueTier(potentialRating);                 // SUPERSTAR..MINIMUM
  return COMPARISON_POOL[tier][positionGroup(position)][...];        // a real player, framed as scouting opinion
}
```

Physical profile by position range, ~20% international origins, and a "scouts compare his
game to…" **real player** drawn from a pool tiered by the prospect's own potential + position
group — so a fringe prospect is never compared to a superstar, and it's always framed as
subjective opinion, never a claim the prospect _is_ that player.

## Other draft files (briefly)

- **`prospectNames.ts`** — generates fictional names (explicitly not real people).
- **`draftNightNarrative.ts`** — narrates the _emergent_ pick outcomes into news (reaches/
  slides are described after they happen, never scripted independently).
- **`lotteryPresentation.ts`** — shapes the lottery reveal for the UI.
- **`draftPickTradeRoll.ts`** — CPU-initiated draft-pick trade rolls.

---

## Interview one-liners

- "The lottery uses the real published post-2019 odds — the three worst teams flattened to
  14% each — drawn with a standard cumulative-weight algorithm without replacement for the
  top 4, then reverse standings."
- "CPU draft picks are a strict argmax of a per-team prospect score: identity sets the
  overall-vs-potential weighting, a real need multiplies a fitting prospect, and aggressive
  teams get a wider noise band — so 'reaches' emerge from the scoring, they're never
  scripted. It reuses the exact trade-AI need/identity primitives."
- "Future picks exist as rows from day one with `currentOwnerId`, so a pick 5 years out is
  tradeable just by reassigning ownership; its slot fills in only when that draft runs."
- "Scouting sub-attributes and projections are pure display derivations seeded per
  prospect — no rating is ever hidden from the user."
