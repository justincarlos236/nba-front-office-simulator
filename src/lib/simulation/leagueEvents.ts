import {
  validateTrade,
  type TradeAssetInput,
  type TradeTeamCapState,
} from "@/lib/trade/validateTrade";
import {
  evaluateTradeOffer,
  playerFillsNeed,
  YOUNG_AGE_THRESHOLD,
  VETERAN_AGE_THRESHOLD,
  type TradePlayerAsset,
} from "@/lib/trade/evaluateTradeOffer";
import { computePlayerTradeValue } from "@/lib/gm/playerTradeValue";
import { GM_PERSONALITY_WEIGHTS, type GmPersonality } from "@/lib/gm/gmPersonality";
import type { TeamIdentity } from "@/lib/gm/teamIdentity";
import type { TeamNeed } from "@/lib/gm/teamNeeds";

/**
 * Around-the-league activity rolled as regular-season games are simulated:
 * injuries, CPU-CPU trades, and CPU free-agent signings. All of it is
 * driven by the number of games just simulated (not real time or click
 * count), so "sim a few games" produces little, "sim 50" produces more -
 * matching how an actual NBA season's news ebbs and flows with games played.
 */

export interface InjuryCandidate {
  leaguePlayerId: string;
  playerName: string;
}

export interface InjuryRollResult {
  leaguePlayerId: string;
  playerName: string;
  durationGames: number;
  injuryName: string;
  severity: "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
}

const MINOR_INJURIES = [
  "a sprained ankle",
  "back spasms",
  "soreness in his knee",
  "wrist soreness",
  "a hip contusion",
];
const MODERATE_INJURIES = [
  "a hamstring strain",
  "a calf strain",
  "a groin strain",
  "a shoulder sprain",
  "plantar fasciitis",
];
const MAJOR_INJURIES = [
  "a torn ACL",
  "a torn Achilles",
  "a fractured foot",
  "a torn meniscus",
  "a stress fracture",
];

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Medical Staff effect (Phase 15a) - a real, modest nudge on both how often
// a team gets hit and how long an injury lasts. 72 (this codebase's
// standard neutral anchor) means no effect - null (no Medical Staff hired
// yet) is treated identically, same convention as the other staff hooks.
const MEDICAL_QUALITY_ANCHOR = 72;
const MEDICAL_FREQUENCY_FACTOR_PER_POINT = 0.01;
const MEDICAL_DURATION_FACTOR_PER_POINT = 0.006;

// Finances as a Gameplay Pillar (Phase 4) - the Sports Science department
// (was "medical investment"). A second, independent injury-frequency lever
// on top of Medical Staff quality. Input is departmentQualityDelta
// (src/lib/finances/departments.ts) - 0 at STANDARD (no effect), positive
// for HIGH/MAXIMUM (fewer injuries), negative for LOW/MINIMAL. Multiplies
// into the same frequencyFactor so it never touches injury *severity*, only
// how often. Wider clamp bounds than the old 3-level lever, matching the
// wider 5-level department scale's bigger specialization payoff.
const SPORTS_SCIENCE_FREQUENCY_PER_POINT = 0.018;

/**
 * Rolled once per team per simulated game (2% default chance). On a hit,
 * one player is chosen uniformly from that team's currently-healthy active
 * roster - real injuries aren't concentrated on stars or bench alike, so no
 * rating-based weighting.
 */
export function rollForTeamInjury(
  healthyRoster: InjuryCandidate[],
  rng: () => number = Math.random,
  chance = 0.02,
  medicalStaffQuality: number | null = null,
  sportsScienceDelta = 0,
): InjuryRollResult | null {
  if (healthyRoster.length === 0) return null;

  const staffFrequencyFactor =
    medicalStaffQuality === null
      ? 1
      : clamp(
          1 - (medicalStaffQuality - MEDICAL_QUALITY_ANCHOR) * MEDICAL_FREQUENCY_FACTOR_PER_POINT,
          0.6,
          1.3,
        );
  const departmentFrequencyFactor = clamp(
    1 - sportsScienceDelta * SPORTS_SCIENCE_FREQUENCY_PER_POINT,
    0.65,
    1.3,
  );
  const frequencyFactor = staffFrequencyFactor * departmentFrequencyFactor;
  if (rng() >= chance * frequencyFactor) return null;

  const durationFactor =
    medicalStaffQuality === null
      ? 1
      : clamp(
          1 - (medicalStaffQuality - MEDICAL_QUALITY_ANCHOR) * MEDICAL_DURATION_FACTOR_PER_POINT,
          0.75,
          1.15,
        );

  const injured = pick(healthyRoster, rng);
  const tierRoll = rng();

  if (tierRoll < 0.6) {
    return {
      leaguePlayerId: injured.leaguePlayerId,
      playerName: injured.playerName,
      durationGames: Math.max(1, Math.round((1 + Math.floor(rng() * 5)) * durationFactor)), // 1-5
      injuryName: pick(MINOR_INJURIES, rng),
      severity: "DAY_TO_DAY",
    };
  }
  if (tierRoll < 0.9) {
    return {
      leaguePlayerId: injured.leaguePlayerId,
      playerName: injured.playerName,
      durationGames: Math.max(1, Math.round((6 + Math.floor(rng() * 10)) * durationFactor)), // 6-15
      injuryName: pick(MODERATE_INJURIES, rng),
      severity: "OUT",
    };
  }
  return {
    leaguePlayerId: injured.leaguePlayerId,
    playerName: injured.playerName,
    durationGames: Math.max(1, Math.round((16 + Math.floor(rng() * 15)) * durationFactor)), // 16-30
    injuryName: pick(MAJOR_INJURIES, rng),
    severity: "SEASON_ENDING",
  };
}

/** P(at least one event) across `gamesInBatch` independent per-game rolls. */
export function shouldTriggerEvent(
  gamesInBatch: number,
  chancePerGame: number,
  rng: () => number = Math.random,
): boolean {
  if (gamesInBatch <= 0) return false;
  const chance = 1 - (1 - chancePerGame) ** gamesInBatch;
  return rng() < chance;
}

export interface CpuRosterPlayer {
  leaguePlayerId: string;
  playerName: string;
  rating: number;
  potentialRating: number;
  age: number;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  salaryCents: bigint;
  noTradeClause: boolean;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
  /** Player Morale & Personality System - true if this player has an active, standing trade request. Biases pickTradeTarget toward surfacing them without forcing any team to actually want them. */
  wantsOut?: boolean;
}

export interface CpuTeam {
  leagueTeamId: string;
  teamLabel: string;
  roster: CpuRosterPlayer[];
  capState: TradeTeamCapState;
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
}

export interface CpuTradeResult {
  teamA: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
  teamB: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
  // The mutual-accept evaluateTradeOffer scores already computed to decide
  // this trade, from each team's own perspective - exposed so callers (Fan
  // Engagement's sentiment hooks) can reuse them instead of recomputing.
  teamAScore: number;
  teamBScore: number;
}

// Real trades skew heavily toward role players/depth, not stars - biasing
// toward the lower-rated ~70% of each team's tradeable (no-no-trade-clause)
// roster keeps CPU-CPU trades believable rather than randomly gutting
// contenders of their best player. Still used as the fallback when the
// needs/personality-driven pickers below find nothing eligible.
const TRADEABLE_POOL_FRACTION = 0.7;

// How many of the top-ranked candidates a picker randomizes among, rather
// than always taking the single best - keeps CPU trades from feeling
// mechanically identical every time the same situation recurs.
const TOP_CANDIDATE_POOL_SIZE = 3;

function pickTradeablePlayer(roster: CpuRosterPlayer[], rng: () => number): CpuRosterPlayer | null {
  const eligible = roster.filter((p) => !p.noTradeClause);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => a.rating - b.rating);
  const poolSize = Math.max(1, Math.ceil(sorted.length * TRADEABLE_POOL_FRACTION));
  return pick(sorted.slice(0, poolSize), rng);
}

function toTradeAsset(player: CpuRosterPlayer): TradePlayerAsset {
  return {
    type: "PLAYER",
    overallRating: player.rating,
    potentialRating: player.potentialRating,
    age: player.age,
    position: player.position,
    currentSalaryCents: player.salaryCents,
    injuryStatus: player.injuryStatus,
    careerGamesMissedToInjury: player.careerGamesMissedToInjury,
  };
}

/**
 * Picks which of `roster` a seeking team would like to acquire - reused for
 * CPU-initiated trades so who a team targets isn't uniform-random the way
 * it was before. Prefers a player who fills one of the seeker's recognized
 * needs (`playerFillsNeed`, the same check `evaluateTradeOffer` itself
 * uses); among the eligible pool (need-filling if any exist, otherwise
 * everyone), biases toward veterans for a win-now-postured seeker or youth
 * for a rebuilding-postured one, using the same age thresholds and
 * personality weights `evaluateTradeOffer` already applies to incoming
 * assets - not a second set of tuning constants. Falls back to the
 * original uniform-random bottom-70% pick if nothing is eligible at all.
 */
function pickTradeTarget(
  roster: CpuRosterPlayer[],
  seekerNeeds: TeamNeed[],
  seekerIdentity: TeamIdentity,
  seekerPersonality: GmPersonality,
  rng: () => number,
): CpuRosterPlayer | null {
  const eligible = roster.filter((p) => !p.noTradeClause);
  if (eligible.length === 0) return null;

  const needFilling = eligible.filter((p) =>
    seekerNeeds.some((need) => playerFillsNeed(toTradeAsset(p), need)),
  );
  const pool = needFilling.length > 0 ? needFilling : eligible;

  const weights = GM_PERSONALITY_WEIGHTS[seekerPersonality];
  const isWinNow = seekerIdentity === "CONTENDER" || seekerIdentity === "PLAYOFF_TEAM";
  const isRebuilding = seekerIdentity === "REBUILDING" || seekerIdentity === "TANKING";
  const preferVeteran = isWinNow || weights.veteranValueMultiplier > weights.youthValueMultiplier;
  const preferYoung =
    !preferVeteran &&
    (isRebuilding || weights.youthValueMultiplier > weights.veteranValueMultiplier);

  // A win-now team wants a *good* veteran, not just whoever's oldest - and
  // a rebuilder wants a *good* young player, not whoever's youngest. Prefer
  // whichever age band the seeker is after, then rank by rating within it;
  // fall back to the whole pool by rating if nobody actually crosses that
  // threshold (e.g. an unusually young or old roster).
  let ageQualified: CpuRosterPlayer[] = pool;
  if (preferVeteran) {
    const veterans = pool.filter((p) => p.age >= VETERAN_AGE_THRESHOLD);
    if (veterans.length > 0) ageQualified = veterans;
  } else if (preferYoung) {
    const young = pool.filter((p) => p.age <= YOUNG_AGE_THRESHOLD);
    if (young.length > 0) ageQualified = young;
  }
  const sorted = [...ageQualified].sort((a, b) => b.rating - a.rating);
  const topPool = sorted.slice(0, Math.min(TOP_CANDIDATE_POOL_SIZE, sorted.length));

  // Player Morale & Personality System - a standing trade request is a
  // real, live "on the market" signal - fold that player into the
  // candidate pool a seeking team browses even if they wouldn't otherwise
  // have surfaced by need-fit/age-band, without forcing any team to want
  // them (evaluateTradeOffer's mutual-ACCEPT gate still decides).
  const disgruntled = eligible.filter((p) => p.wantsOut && !topPool.includes(p));
  return pick([...topPool, ...disgruntled], rng);
}

/**
 * Picks what a seeking team would offer in return for `target` - prefers a
 * "surplus" player (one that does *not* fill any of the seeker's own
 * recognized needs, i.e. redundant depth) whose objective trade value is
 * closest to the target's, so the candidate offer is plausible rather than
 * wildly mismatched. Falls back to the uniform-random bottom-70% pick if
 * the roster has no surplus player at all.
 */
function pickTradeOffer(
  roster: CpuRosterPlayer[],
  seekerNeeds: TeamNeed[],
  target: CpuRosterPlayer,
  season: number,
  rng: () => number,
): CpuRosterPlayer | null {
  const eligible = roster.filter((p) => !p.noTradeClause);
  if (eligible.length === 0) return null;

  const surplus = eligible.filter(
    (p) => !seekerNeeds.some((need) => playerFillsNeed(toTradeAsset(p), need)),
  );
  const pool = surplus.length > 0 ? surplus : eligible;

  const targetValue = computePlayerTradeValue({
    season,
    overallRating: target.rating,
    potentialRating: target.potentialRating,
    age: target.age,
    currentSalaryCents: target.salaryCents,
    injuryStatus: target.injuryStatus,
    careerGamesMissedToInjury: target.careerGamesMissedToInjury,
  });
  const byCloseness = [...pool].sort((a, b) => {
    const aValue = computePlayerTradeValue({
      season,
      overallRating: a.rating,
      potentialRating: a.potentialRating,
      age: a.age,
      currentSalaryCents: a.salaryCents,
      injuryStatus: a.injuryStatus,
      careerGamesMissedToInjury: a.careerGamesMissedToInjury,
    });
    const bValue = computePlayerTradeValue({
      season,
      overallRating: b.rating,
      potentialRating: b.potentialRating,
      age: b.age,
      currentSalaryCents: b.salaryCents,
      injuryStatus: b.injuryStatus,
      careerGamesMissedToInjury: b.careerGamesMissedToInjury,
    });
    const aDiff = aValue > targetValue ? aValue - targetValue : targetValue - aValue;
    const bDiff = bValue > targetValue ? bValue - targetValue : targetValue - bValue;
    return aDiff < bDiff ? -1 : aDiff > bDiff ? 1 : 0;
  });

  const topPool = byCloseness.slice(0, Math.min(TOP_CANDIDATE_POOL_SIZE, byCloseness.length));
  return pick(topPool, rng);
}

/**
 * Picks two random CPU teams, has the first ("seeking") team target a
 * player from the second using its own needs/identity/personality
 * (`pickTradeTarget`) and offer a value-matched surplus player in return
 * (`pickTradeOffer`), then requires *both* teams to independently `ACCEPT`
 * the swap via `evaluateTradeOffer` - the same judge a user's own proposed
 * trade is held to - before the existing cap-legality check
 * (`validateTrade`) even runs. Re-rolls up to `maxAttempts` times. Returns
 * null if no mutually-agreeable, legal swap turns up within the attempt
 * budget, which is a quiet no-op for that roll, not an error.
 */
export function rollForCpuTrade(
  teams: CpuTeam[],
  season: number,
  rng: () => number = Math.random,
  maxAttempts = 5,
): CpuTradeResult | null {
  if (teams.length < 2) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const i = Math.floor(rng() * teams.length);
    let j = Math.floor(rng() * teams.length);
    if (j === i) j = (j + 1) % teams.length;
    const teamA = teams[i];
    const teamB = teams[j];

    const target =
      pickTradeTarget(teamB.roster, teamA.needs, teamA.identity, teamA.personality, rng) ??
      pickTradeablePlayer(teamB.roster, rng);
    if (!target) continue;
    const offer =
      pickTradeOffer(teamA.roster, teamA.needs, target, season, rng) ??
      pickTradeablePlayer(teamA.roster, rng);
    if (!offer) continue;

    const targetAsset = toTradeAsset(target);
    const offerAsset = toTradeAsset(offer);

    const aAccepts = evaluateTradeOffer({
      respondingTeam: {
        identity: teamA.identity,
        needs: teamA.needs,
        personality: teamA.personality,
        roster: teamA.roster.map((p) => ({ overallRating: p.rating, age: p.age })),
      },
      currentSeason: season,
      incoming: [targetAsset],
      outgoing: [offerAsset],
    });
    if (aAccepts.decision !== "ACCEPT") continue;

    const bAccepts = evaluateTradeOffer({
      respondingTeam: {
        identity: teamB.identity,
        needs: teamB.needs,
        personality: teamB.personality,
        roster: teamB.roster.map((p) => ({ overallRating: p.rating, age: p.age })),
      },
      currentSeason: season,
      incoming: [offerAsset],
      outgoing: [targetAsset],
    });
    if (bAccepts.decision !== "ACCEPT") continue;

    const assets: TradeAssetInput[] = [
      {
        type: "PLAYER",
        fromTeamId: teamA.leagueTeamId,
        toTeamId: teamB.leagueTeamId,
        playerId: offer.leaguePlayerId,
        salaryCents: offer.salaryCents,
      },
      {
        type: "PLAYER",
        fromTeamId: teamB.leagueTeamId,
        toTeamId: teamA.leagueTeamId,
        playerId: target.leaguePlayerId,
        salaryCents: target.salaryCents,
      },
    ];
    const validation = validateTrade({
      season,
      assets,
      teamCapStates: {
        [teamA.leagueTeamId]: teamA.capState,
        [teamB.leagueTeamId]: teamB.capState,
      },
    });

    if (validation.isValid) {
      return {
        teamA: { leagueTeamId: teamA.leagueTeamId, teamLabel: teamA.teamLabel, player: offer },
        teamB: { leagueTeamId: teamB.leagueTeamId, teamLabel: teamB.teamLabel, player: target },
        teamAScore: aAccepts.score,
        teamBScore: bAccepts.score,
      };
    }
  }
  return null;
}

export interface CpuSigningResult {
  leagueTeamId: string;
  leaguePlayerId: string;
}

/**
 * Free agent minimum-salary signings are always cap-legal regardless of
 * apron status (see `validateSigning`), so unlike trades this never needs a
 * re-roll loop - any CPU team can always sign any available free agent to a
 * minimum deal.
 */
export function rollForCpuSigning(
  cpuTeamIds: string[],
  freeAgentIds: string[],
  rng: () => number = Math.random,
): CpuSigningResult | null {
  if (cpuTeamIds.length === 0 || freeAgentIds.length === 0) return null;
  return {
    leagueTeamId: pick(cpuTeamIds, rng),
    leaguePlayerId: pick(freeAgentIds, rng),
  };
}

/**
 * A CPU club's unsolicited trade offer for one of the user's players.
 *
 * The audit finding was that trade is outbound-only: the user can always call
 * around, but nothing ever arrives. That makes the other twenty-nine front
 * offices feel inert - they never want anything, so the phone only rings when
 * you pick it up. This is the same gap free agency had before rivals started
 * competing.
 *
 * The construction deliberately mirrors `rollForCpuTrade`, with one asymmetry
 * that matters: the CPU side must genuinely want the deal (it is checked
 * against `evaluateTradeOffer` exactly as in a CPU-CPU swap), but the user's
 * side is *not* checked. Whether the offer is good for the user is the user's
 * judgement to make - that is the entire point of receiving one. Filtering to
 * only offers the user "should" accept would turn an inbox into a to-do list.
 */
export interface CpuOfferToUser {
  fromTeam: { leagueTeamId: string; teamLabel: string };
  /** What the CPU club is giving up. */
  offering: CpuRosterPlayer;
  /** The user's player it wants. */
  wanting: CpuRosterPlayer;
  /** The proposing club's own score for the deal, for the offer's rationale. */
  proposerScore: number;
}

export function rollForCpuOfferToUser(
  cpuTeams: CpuTeam[],
  userTeam: CpuTeam,
  season: number,
  rng: () => number = Math.random,
  maxAttempts = 6,
): CpuOfferToUser | null {
  if (cpuTeams.length === 0 || userTeam.roster.length === 0) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const proposer = cpuTeams[Math.floor(rng() * cpuTeams.length)];
    if (!proposer || proposer.roster.length === 0) continue;

    // What the CPU wants from the user, chosen by its own needs - so an offer
    // reads as motivated rather than arbitrary.
    const wanting =
      pickTradeTarget(
        userTeam.roster,
        proposer.needs,
        proposer.identity,
        proposer.personality,
        rng,
      ) ?? pickTradeablePlayer(userTeam.roster, rng);
    if (!wanting) continue;

    const offering =
      pickTradeOffer(proposer.roster, proposer.needs, wanting, season, rng) ??
      pickTradeablePlayer(proposer.roster, rng);
    if (!offering) continue;

    const wantingAsset = toTradeAsset(wanting);
    const offeringAsset = toTradeAsset(offering);

    // Only the proposer's willingness is checked. See the note above: whether
    // this is a good deal for the user is precisely what the user is being
    // asked, and pre-filtering would answer their question for them.
    const proposerAccepts = evaluateTradeOffer({
      respondingTeam: {
        identity: proposer.identity,
        needs: proposer.needs,
        personality: proposer.personality,
        roster: proposer.roster.map((p) => ({ overallRating: p.rating, age: p.age })),
      },
      currentSeason: season,
      incoming: [wantingAsset],
      outgoing: [offeringAsset],
    });
    if (proposerAccepts.decision !== "ACCEPT") continue;

    const assets: TradeAssetInput[] = [
      {
        type: "PLAYER",
        fromTeamId: proposer.leagueTeamId,
        toTeamId: userTeam.leagueTeamId,
        playerId: offering.leaguePlayerId,
        salaryCents: offering.salaryCents,
      },
      {
        type: "PLAYER",
        fromTeamId: userTeam.leagueTeamId,
        toTeamId: proposer.leagueTeamId,
        playerId: wanting.leaguePlayerId,
        salaryCents: wanting.salaryCents,
      },
    ];

    // A proposal that could never legally execute is worse than no proposal:
    // the user would accept it and be told no by the league office.
    const validation = validateTrade({
      season,
      assets,
      teamCapStates: {
        [proposer.leagueTeamId]: proposer.capState,
        [userTeam.leagueTeamId]: userTeam.capState,
      },
    });
    if (!validation.isValid) continue;

    return {
      fromTeam: { leagueTeamId: proposer.leagueTeamId, teamLabel: proposer.teamLabel },
      offering,
      wanting,
      proposerScore: proposerAccepts.score,
    };
  }
  return null;
}
