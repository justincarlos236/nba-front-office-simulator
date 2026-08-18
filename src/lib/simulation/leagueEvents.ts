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
  type TradePickAsset,
  type TradeAssetForEvaluation,
} from "@/lib/trade/evaluateTradeOffer";
import { computePlayerTradeValue } from "@/lib/gm/playerTradeValue";
import { computeDraftPickTradeValue } from "@/lib/gm/draftPickTradeValue";
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
  /**
   * Minutes this player is set to play, from `targetMinutesPerGame`. Null on
   * anyone left to the automatic rotation, which is most of the league.
   */
  minutesPerGame?: number | null;
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

// a real, modest nudge on both how often
// a team gets hit and how long an injury lasts. 72 (this codebase's
// standard neutral anchor) means no effect - null (no Medical Staff hired
// yet) is treated identically, same convention as the other staff hooks.
const MEDICAL_QUALITY_ANCHOR = 72;
const MEDICAL_FREQUENCY_FACTOR_PER_POINT = 0.01;
const MEDICAL_DURATION_FACTOR_PER_POINT = 0.006;

// the Sports Science department
// (was "medical investment"). A second, independent injury-frequency lever
// on top of Medical Staff quality. Input is departmentQualityDelta
// (src/lib/finances/departments.ts) - 0 at STANDARD (no effect), positive
// for HIGH/MAXIMUM (fewer injuries), negative for LOW/MINIMAL. Multiplies
// into the same frequencyFactor so it never touches injury *severity*, only
// how often. Wider clamp bounds than the old 3-level lever, matching the
// wider 5-level department scale's bigger specialization payoff.
const SPORTS_SCIENCE_FREQUENCY_PER_POINT = 0.018;

/**
 * Exposure floor, in minutes, for a player who is on the active roster but
 * barely plays. He is at the arena and in practice, so his risk is small
 * rather than zero - without this a 0-minute player would be untouchable.
 */
const MINUTES_EXPOSURE_FLOOR = 8;

/**
 * Heavy usage makes a team more injured, not differently injured.
 *
 * Weighting the victim by minutes fixed who gets hurt, but left the team's
 * rate fixed at `chance` - so leaning on one man only moved risk off his
 * team-mates and onto him. Total exposure never rose, which made playing
 * someone 44 minutes nearly free and would have made any raised rotation
 * ceiling a setting with one correct value.
 *
 * Anchored at 34 minutes, a normal starter's load, and read off the heaviest
 * assignment on the roster rather than an average - it is the man being run
 * into the ground who breaks, and averaging hides him behind eleven reserves.
 */
const LOAD_BASELINE_MINUTES = 34;
const LOAD_RISK_PER_MINUTE_OVER = 0.02;

/**
 * Bodies accumulate a season. Injury rates are not flat from October to April
 * - they climb as games, travel and minutes pile up, which is why the real
 * league sees more soft-tissue injuries late and why load management exists at
 * all. A flat rate made March identical to November.
 *
 * The band is deliberately modest and centres near 1, so a full season carries
 * roughly the same total injuries as before while redistributing them toward
 * its back half.
 */
const FATIGUE_AT_SEASON_START = 0.85;
const FATIGUE_AT_SEASON_END = 1.25;

/**
 * How likely this player is to be the one hurt, relative to his team-mates.
 *
 * **Exposure is minutes, not quality.** The roll stays rating-blind for the
 * reason the doc below gives - injuries do not seek out stars. But they do
 * find whoever is on the floor, and treating a 38-minute starter and a
 * 10-minute reserve as equally likely was the one clearly wrong thing in this
 * model. It also meant minutes carried no risk at all, so any future decision
 * to over-play a player would have been free.
 */
function minutesExposure(candidate: InjuryCandidate): number {
  const minutes = candidate.minutesPerGame;
  if (minutes === null || minutes === undefined) return MINUTES_EXPOSURE_FLOOR;
  return Math.max(MINUTES_EXPOSURE_FLOOR, minutes);
}

/**
 * Rolled once per team per simulated game (2% default chance). On a hit, one
 * player is chosen from that team's currently-healthy active roster, weighted
 * by minutes - real injuries aren't concentrated on stars or bench alike, so
 * there is still no rating-based weighting, but they do fall on whoever is
 * actually playing.
 *
 * A roster where nobody has an explicit minutes target weights everyone the
 * same, which is exactly the uniform behaviour this replaced.
 */
export function rollForTeamInjury(
  healthyRoster: InjuryCandidate[],
  rng: () => number = Math.random,
  chance = 0.02,
  medicalStaffQuality: number | null = null,
  sportsScienceDelta = 0,
  /** 0 at tip-off of game one, 1 at the end of the regular season. */
  seasonProgress: number | null = null,
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
  // The heaviest assignment on the roster, ignoring anyone left to the
  // automatic rotation - a team that sets no minutes carries no load penalty.
  const heaviestMinutes = healthyRoster.reduce(
    (most, c) => Math.max(most, c.minutesPerGame ?? 0),
    0,
  );
  const loadFactor = clamp(
    1 + Math.max(0, heaviestMinutes - LOAD_BASELINE_MINUTES) * LOAD_RISK_PER_MINUTE_OVER,
    1,
    1.4,
  );

  const fatigueFactor =
    seasonProgress === null
      ? 1
      : FATIGUE_AT_SEASON_START +
        clamp(seasonProgress, 0, 1) * (FATIGUE_AT_SEASON_END - FATIGUE_AT_SEASON_START);

  const frequencyFactor =
    staffFrequencyFactor * departmentFrequencyFactor * loadFactor * fatigueFactor;
  if (rng() >= chance * frequencyFactor) return null;

  const durationFactor =
    medicalStaffQuality === null
      ? 1
      : clamp(
          1 - (medicalStaffQuality - MEDICAL_QUALITY_ANCHOR) * MEDICAL_DURATION_FACTOR_PER_POINT,
          0.75,
          1.15,
        );

  const injured = pickWeighted(healthyRoster, minutesExposure, rng) ?? healthyRoster[0];
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

/**
 * P(at least one event) across `gamesInBatch` independent per-game rolls.
 *
 * Correct for anything that can only happen once per batch - an All-Star buzz
 * item, a single standing trade offer. **For anything that can recur, use
 * `rollEventCount` instead**: this collapses a whole batch into one boolean, so
 * a hundred games and ten games both yield at most one event.
 */
export function shouldTriggerEvent(
  gamesInBatch: number,
  chancePerGame: number,
  rng: () => number = Math.random,
): boolean {
  if (gamesInBatch <= 0) return false;
  const chance = 1 - (1 - chancePerGame) ** gamesInBatch;
  return rng() < chance;
}

/**
 * How many times an event fires across `gamesInBatch` - one independent roll
 * per game, rather than one roll for the whole batch.
 *
 * This exists because `shouldTriggerEvent` capped recurring events at one per
 * call, which made league activity a function of the simulation's internal
 * chunk size rather than of the calendar. With games processed 50 at a time, a
 * 1,230-game season could produce at most ~24 trade opportunities, and the
 * measured result was **2 trades per season league-wide** against a real NBA
 * figure near 40. Change the chunk size for performance and the trade market
 * would silently move with it.
 *
 * Rolling per game decouples the two: the same season produces the same
 * expected activity whether it is simulated in one batch or a hundred.
 */
export function rollEventCount(
  gamesInBatch: number,
  chancePerGame: number,
  rng: () => number = Math.random,
): number {
  if (gamesInBatch <= 0 || chancePerGame <= 0) return 0;
  let count = 0;
  for (let i = 0; i < gamesInBatch; i += 1) {
    if (rng() < chancePerGame) count += 1;
  }
  return count;
}

export interface CpuRosterPlayer {
  leaguePlayerId: string;
  playerName: string;
  rating: number;
  potentialRating: number;
  age: number;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  salaryCents: bigint;
  /** Salaries for the seasons after this one - see `PlayerTradeValueInput`. */
  futureSalaryCents?: bigint[];
  noTradeClause: boolean;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
  /** Player Morale & Personality System - true if this player has an active, standing trade request. Biases pickTradeTarget toward surfacing them without forcing any team to actually want them. */
  wantsOut?: boolean;
}

/** A future pick a CPU team could attach to a trade as a sweetener. */
export interface CpuTradeablePick {
  draftPickId: string;
  season: number;
  round: 1 | 2;
  /** The *original* team's competitiveness - see `draftPickTradeValue.ts`. */
  originalTeamCompetitivenessPercentile: number;
  label: string;
}

export interface CpuTeam {
  leagueTeamId: string;
  teamLabel: string;
  roster: CpuRosterPlayer[];
  /**
   * Unselected future picks this team owns. Optional: omit and CPU trades stay
   * strictly player-for-player, which is what they used to be.
   */
  tradeablePicks?: CpuTradeablePick[];
  capState: TradeTeamCapState;
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
}

export interface CpuTradeResult {
  teamA: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
  teamB: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
  /**
   * A pick team A attached to get the deal over the line, if one was needed.
   *
   * CPU-CPU trades used to be strictly one player for one player, which made
   * the league's own market structurally simpler than the user's: no CPU team
   * could ever pay a pick for an upgrade, so none of them ever acted on the
   * rebuild-through-capital identity the model says they have. See
   * docs/audits/TRADE_AUDIT.md subsystem #8.
   */
  pickFromTeamA?: CpuTradeablePick;
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
/**
 * How many players a seeking club shortlists from a roster.
 *
 * Was 3, which made the weighting below almost inert: if a club's three best
 * men were all stars, sampling among them still returned a star. Widening the
 * shortlist is what lets `tradeTargetWeight` actually reach role players - the
 * pool was the binding constraint, not the weight.
 *
 * Fitted with the weight in `scripts/cpu-trade-frequency-calibration.ts`
 * against three targets at once: 30-50 trades a season, star moves near the
 * real one to two, and a mean traded rating near the league's own ~73. Wider
 * shortlists overshoot - at 8 the market moves 0.6 stars a season and trades a
 * mean rating of 70.3, which is a league that only ever swaps bench players.
 */
const TOP_CANDIDATE_POOL_SIZE = 4;

/**
 * How strongly a seeking club's shortlist avoids the very best players.
 *
 * **The shortlist was "the three best men on that roster", and that is not how
 * a trade market works.** `pickTradeTarget` sorts by rating descending and
 * takes the top few, so every CPU enquiry started with a club's best player.
 * Measured in docs/audits/TRADE_EXPLOIT_AUDIT.md T-P1-4, that put 85+ players at
 * 12-20% of all traded players at every volume setting, against a real ~4%.
 *
 * At the shipped trade frequency that ratio is invisible - 18% of thirteen
 * trades is about two star moves a season, which reads as realistic by
 * accident. It is only exposed when volume rises: at a realistic 34 trades a
 * season it becomes 5.5 star moves, which is a chaos league.
 *
 * So the shortlist is now sampled with a weight that falls as rating rises
 * above `STAR_RATING_FLOOR`. Stars are still reachable - clubs do ask, and the
 * `wantsOut` and need-fit paths are untouched - but a role player is far more
 * likely to be the man enquired about, which is what a real market looks like.
 *
 * Deliberately applied to WHO IS ASKED ABOUT, not to whether a deal is
 * accepted. `evaluateTradeOffer` is unchanged: this shapes the candidate pool,
 * not the price or the verdict.
 */
const STAR_RATING_FLOOR = 80;
const STAR_TARGET_WEIGHT_DECAY = 0.72;

/** Selection weight for shopping this player - 1 below the floor, falling above. */
function tradeTargetWeight(rating: number): number {
  if (rating <= STAR_RATING_FLOOR) return 1;
  return STAR_TARGET_WEIGHT_DECAY ** (rating - STAR_RATING_FLOOR);
}

/** Weighted sample; falls back to the first entry if every weight is zero. */
function pickWeighted<T>(items: T[], weightOf: (item: T) => number, rng: () => number): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) return items[0];
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function pickTradeablePlayer(roster: CpuRosterPlayer[], rng: () => number): CpuRosterPlayer | null {
  const eligible = roster.filter((p) => !p.noTradeClause);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => a.rating - b.rating);
  const poolSize = Math.max(1, Math.ceil(sorted.length * TRADEABLE_POOL_FRACTION));
  return pick(sorted.slice(0, poolSize), rng);
}

function toPickAsset(pick: CpuTradeablePick): TradePickAsset {
  return {
    type: "DRAFT_PICK",
    pickSeason: pick.season,
    round: pick.round,
    overallPickNumber: null,
    originalTeamCompetitivenessPercentile: pick.originalTeamCompetitivenessPercentile,
  };
}

function pickAssetValue(pick: CpuTradeablePick, season: number): bigint {
  return computeDraftPickTradeValue({
    currentSeason: season,
    pickSeason: pick.season,
    round: pick.round,
    overallPickNumber: null,
    originalTeamCompetitivenessPercentile: pick.originalTeamCompetitivenessPercentile,
  });
}

function toTradeAsset(player: CpuRosterPlayer): TradePlayerAsset {
  return {
    type: "PLAYER",
    overallRating: player.rating,
    potentialRating: player.potentialRating,
    age: player.age,
    position: player.position,
    currentSalaryCents: player.salaryCents,
    futureSalaryCents: player.futureSalaryCents,
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
  // Weighted rather than uniform: a club asks about role players far more often
  // than about stars. See STAR_RATING_FLOOR.
  return pickWeighted([...topPool, ...disgruntled], (p) => tradeTargetWeight(p.rating), rng);
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
    futureSalaryCents: target.futureSalaryCents,
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
      futureSalaryCents: a.futureSalaryCents,
      injuryStatus: a.injuryStatus,
      careerGamesMissedToInjury: a.careerGamesMissedToInjury,
    });
    const bValue = computePlayerTradeValue({
      season,
      overallRating: b.rating,
      potentialRating: b.potentialRating,
      age: b.age,
      currentSalaryCents: b.salaryCents,
      futureSalaryCents: b.futureSalaryCents,
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
  // Measured: a mutually acceptable, legal one-for-one trade is genuinely hard
  // to stumble on, because a deal that helps one side usually hurts the other.
  // At 5 attempts only 5.9% of rolls found anything, which - far more than the
  // event-trigger frequency - was why the league managed two trades a season.
  // 40 attempts finds one 42.6% of the time. This is pure computation over
  // rosters already in memory, so the extra attempts are cheap.
  maxAttempts = 40,
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

    const askA = (outgoing: TradeAssetForEvaluation[]) =>
      evaluateTradeOffer({
        respondingTeam: {
          identity: teamA.identity,
          needs: teamA.needs,
          personality: teamA.personality,
          roster: teamA.roster.map((p) => ({ overallRating: p.rating, age: p.age })),
        },
        currentSeason: season,
        incoming: [targetAsset],
        outgoing,
      });
    const askB = (incoming: TradeAssetForEvaluation[]) =>
      evaluateTradeOffer({
        respondingTeam: {
          identity: teamB.identity,
          needs: teamB.needs,
          personality: teamB.personality,
          roster: teamB.roster.map((p) => ({ overallRating: p.rating, age: p.age })),
        },
        currentSeason: season,
        incoming,
        outgoing: [targetAsset],
      });

    // Straight swap first, then the same swap with one pick attached - so a
    // sweetener is only ever spent on a deal that genuinely needed it, and the
    // cheapest pick that works is the one that goes.
    const sweeteners: (CpuTradeablePick | undefined)[] = [
      undefined,
      ...[...(teamA.tradeablePicks ?? [])].sort(
        (x, y) => Number(pickAssetValue(x, season)) - Number(pickAssetValue(y, season)),
      ),
    ];

    for (const sweetener of sweeteners) {
      const sweetenerAsset = sweetener ? toPickAsset(sweetener) : null;
      const aSide = sweetenerAsset ? [offerAsset, sweetenerAsset] : [offerAsset];

      const aAccepts = askA(aSide);
      if (aAccepts.decision !== "ACCEPT") continue;
      const bAccepts = askB(aSide);
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
      if (sweetener) {
        // Included in the validated asset list, not bolted on afterwards, so
        // the Stepien check in `validateTrade` sees it - a CPU team must not be
        // able to trade away a first it isn't allowed to move.
        assets.push({
          type: "DRAFT_PICK",
          fromTeamId: teamA.leagueTeamId,
          toTeamId: teamB.leagueTeamId,
          pickId: sweetener.draftPickId,
          season: sweetener.season,
          round: sweetener.round,
        });
      }

      const validation = validateTrade({
        season,
        assets,
        teamCapStates: {
          [teamA.leagueTeamId]: teamA.capState,
          [teamB.leagueTeamId]: teamB.capState,
        },
      });
      if (!validation.isValid) continue;

      return {
        teamA: { leagueTeamId: teamA.leagueTeamId, teamLabel: teamA.teamLabel, player: offer },
        teamB: { leagueTeamId: teamB.leagueTeamId, teamLabel: teamB.teamLabel, player: target },
        pickFromTeamA: sweetener,
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
