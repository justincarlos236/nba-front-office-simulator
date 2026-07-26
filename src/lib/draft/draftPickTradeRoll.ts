import { computeDraftPickTradeValue } from "../gm/draftPickTradeValue";
import { evaluateTradeOffer, type TradePickAsset } from "../trade/evaluateTradeOffer";
import type { TeamIdentity } from "../gm/teamIdentity";
import type { TeamNeed } from "../gm/teamNeeds";
import type { GmPersonality } from "../gm/gmPersonality";

/**
 * Draft Experience Redesign - occasional CPU-CPU trades of same-draft,
 * already-numbered, not-yet-selected picks (a team "trading up" past the
 * team currently on the clock). Scoped narrower than a full trade builder
 * on purpose: v1 only considers same-season picks already in the draft
 * (no cross-season future-pick arbitrage - see the plan's "out of scope"
 * note), and caps the offer at 2 of the partner's own picks rather than
 * solving an open-ended combination search.
 *
 * Reuses the exact same objective valuation (`computeDraftPickTradeValue`)
 * and acceptance judge (`evaluateTradeOffer`) the pre-draft trade builder
 * and regular-season CPU-CPU trades already use - both sides must
 * genuinely ACCEPT, from their own identity/needs/personality, for a
 * trade to fire. Never involves the user's own team - callers are
 * responsible for excluding the user's team from both `teamOnClock` and
 * `partners`.
 */

export interface DraftPickForTrade {
  pickId: string;
  overallPickNumber: number;
  round: 1 | 2;
}

export interface DraftPickTradeRosterPlayer {
  overallRating: number;
  age: number;
}

export interface DraftPickTradeTeam {
  leagueTeamId: string;
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
  roster: DraftPickTradeRosterPlayer[];
}

export interface DraftPickTradePartner {
  team: DraftPickTradeTeam;
  /** This partner's own other not-yet-selected, already-numbered picks this draft. */
  picks: DraftPickForTrade[];
}

export interface DraftPickTradeResult {
  partner: DraftPickTradeTeam;
  /** The on-the-clock pick, now going to the partner. */
  pickGivenUp: DraftPickForTrade;
  /** The partner's pick(s), now going to the team that was on the clock. */
  picksReceived: DraftPickForTrade[];
}

// A flat per-pick chance, independent of the AI scoring's own noise
// stream - keeps toggling one from ever perturbing the other.
const TRADE_ROLL_CHANCE = 0.05;
// The partner's offered value has to cover at least this much of the
// on-the-clock pick's value before either side even gets asked to
// evaluate it - filters out obviously-lopsided combinations up front.
const MIN_VALUE_COVERAGE = 0.9;
const MAX_PARTNER_ASSETS = 2;

function toPickAsset(pick: DraftPickForTrade, season: number): TradePickAsset {
  return {
    type: "DRAFT_PICK",
    pickSeason: season,
    round: pick.round,
    overallPickNumber: pick.overallPickNumber,
    // Unused by computeDraftPickTradeValue/evaluateTradeOffer whenever
    // overallPickNumber is non-null (always true here - v1 only trades
    // already-numbered picks) - a documented placeholder, not a real input.
    originalTeamCompetitivenessPercentile: 0.5,
  };
}

function pickValue(pick: DraftPickForTrade, season: number): bigint {
  return computeDraftPickTradeValue({
    currentSeason: season,
    pickSeason: season,
    round: pick.round,
    overallPickNumber: pick.overallPickNumber,
    originalTeamCompetitivenessPercentile: 0.5,
  });
}

/**
 * Rolls for, and fully evaluates, a possible trade-up for the pick
 * currently on the clock. Returns `null` on a missed roll, no viable
 * partner, or either side declining - a rejected/missed roll is always a
 * clean no-op, never a partial mutation.
 */
export function rollForDraftPickTrade(
  season: number,
  teamOnClock: DraftPickTradeTeam,
  teamOnClockPick: DraftPickForTrade,
  partners: DraftPickTradePartner[],
  rng: () => number,
): DraftPickTradeResult | null {
  if (rng() >= TRADE_ROLL_CHANCE) return null;

  const onClockValue = pickValue(teamOnClockPick, season);

  for (const partner of partners) {
    const laterPicks = partner.picks
      .filter((p) => p.overallPickNumber > teamOnClockPick.overallPickNumber)
      .sort((a, b) => a.overallPickNumber - b.overallPickNumber);
    if (laterPicks.length === 0) continue;

    const assetLimit = Math.min(MAX_PARTNER_ASSETS, laterPicks.length);
    for (let assetCount = 1; assetCount <= assetLimit; assetCount++) {
      const offeredPicks = laterPicks.slice(0, assetCount);
      const offeredValue = offeredPicks.reduce((sum, p) => sum + pickValue(p, season), 0n);
      if (Number(offeredValue) < Number(onClockValue) * MIN_VALUE_COVERAGE) continue;

      const onClockDecision = evaluateTradeOffer({
        respondingTeam: teamOnClock,
        currentSeason: season,
        incoming: offeredPicks.map((p) => toPickAsset(p, season)),
        outgoing: [toPickAsset(teamOnClockPick, season)],
      }).decision;
      if (onClockDecision !== "ACCEPT") continue;

      const partnerDecision = evaluateTradeOffer({
        respondingTeam: partner.team,
        currentSeason: season,
        incoming: [toPickAsset(teamOnClockPick, season)],
        outgoing: offeredPicks.map((p) => toPickAsset(p, season)),
      }).decision;
      if (partnerDecision !== "ACCEPT") continue;

      return { partner: partner.team, pickGivenUp: teamOnClockPick, picksReceived: offeredPicks };
    }
  }

  return null;
}
