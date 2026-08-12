import { computeDraftPickTradeValue } from "../gm/draftPickTradeValue";
import { evaluateTradeOffer, type TradePickAsset } from "../trade/evaluateTradeOffer";
import { validateTrade } from "../trade/validateTrade";
import { ApronLevel } from "../cap/apron";
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
  /**
   * Slot within its own draft. Null for a future pick, which has not been
   * ordered yet - `computeDraftPickTradeValue` projects a slot from the
   * original team's competitiveness in that case.
   */
  overallPickNumber: number | null;
  round: 1 | 2;
  /** Which draft this pick belongs to. Defaults to the draft being run. */
  season?: number;
  /**
   * The original team's competitiveness percentile, for projecting a future
   * pick's slot. Ignored when `overallPickNumber` is known.
   */
  originalTeamCompetitivenessPercentile?: number;
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
  /**
   * Future seasons this team owns its own first-rounder for, before the trade -
   * the Stepien-rule input. Omit and the Stepien check is skipped, which is
   * only safe when no future first-rounders can change hands.
   */
  ownedFutureFirstRoundPickSeasons?: number[];
}

export interface DraftPickTradePartner {
  team: DraftPickTradeTeam;
  /**
   * Picks this partner can offer: its own not-yet-selected picks later in this
   * draft, and - since a future first is the classic draft-night sweetener -
   * its unselected picks in later drafts too.
   */
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
    pickSeason: pick.season ?? season,
    round: pick.round,
    overallPickNumber: pick.overallPickNumber,
    // Only consulted for a pick with no slot yet - i.e. a future one. A pick in
    // this draft is already numbered, and then this is ignored.
    originalTeamCompetitivenessPercentile: pick.originalTeamCompetitivenessPercentile ?? 0.5,
  };
}

function pickValue(pick: DraftPickForTrade, season: number): bigint {
  return computeDraftPickTradeValue({
    currentSeason: season,
    pickSeason: pick.season ?? season,
    round: pick.round,
    overallPickNumber: pick.overallPickNumber,
    originalTeamCompetitivenessPercentile: pick.originalTeamCompetitivenessPercentile ?? 0.5,
  });
}

/**
 * Would giving up these picks leave the partner without a first-rounder in
 * back-to-back future years?
 *
 * Delegated to `validateTrade` rather than reimplemented: it already owns the
 * Stepien-lite rule the trade builder and the server action are held to, and a
 * second copy here would be free to drift. Salary matching inside it is a no-op
 * for a pick-only trade (it skips any team taking on no salary), so the cap
 * state passed in is inert.
 */
function violatesStepien(
  partner: DraftPickTradeTeam,
  teamOnClock: DraftPickTradeTeam,
  offered: DraftPickForTrade[],
  draftSeason: number,
): boolean {
  const futureFirsts = offered.filter((p) => (p.season ?? draftSeason) > draftSeason && p.round === 1);
  if (futureFirsts.length === 0) return false;

  const inertCapState = {
    apronLevel: ApronLevel.UNDER_CAP,
    capSpaceCents: 0n,
    ownedFutureFirstRoundPickSeasons: [] as number[],
  };
  const result = validateTrade({
    season: draftSeason,
    assets: futureFirsts.map((p) => ({
      type: "DRAFT_PICK" as const,
      fromTeamId: partner.leagueTeamId,
      toTeamId: teamOnClock.leagueTeamId,
      pickId: p.pickId,
      season: p.season ?? draftSeason,
      round: p.round,
    })),
    teamCapStates: {
      [partner.leagueTeamId]: {
        ...inertCapState,
        ownedFutureFirstRoundPickSeasons: partner.ownedFutureFirstRoundPickSeasons ?? [],
      },
      [teamOnClock.leagueTeamId]: inertCapState,
    },
  });
  return result.violations.some((v) => v.rule === "STEPIEN_RULE");
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
    // Anything the partner can legitimately give up to move up: a later pick in
    // this same draft, or any pick in a future one. A future first is the
    // archetypal draft-night sweetener and was previously out of scope
    // entirely, which left the on-the-clock team able to trade down only when
    // the partner happened to hold a second pick in this same draft.
    const offerable = partner.picks
      .filter((p) => {
        const pickSeason = p.season ?? season;
        if (pickSeason > season) return true;
        return p.overallPickNumber !== null && p.overallPickNumber > teamOnClockPick.overallPickNumber!;
      })
      // Cheapest first, so the trade that fires is the smallest one that works
      // rather than the first combination stumbled upon.
      .sort((a, b) => Number(pickValue(a, season)) - Number(pickValue(b, season)));
    if (offerable.length === 0) continue;

    const assetLimit = Math.min(MAX_PARTNER_ASSETS, offerable.length);
    for (let assetCount = 1; assetCount <= assetLimit; assetCount++) {
      const offeredPicks = offerable.slice(0, assetCount);
      const offeredValue = offeredPicks.reduce((sum, p) => sum + pickValue(p, season), 0n);
      if (Number(offeredValue) < Number(onClockValue) * MIN_VALUE_COVERAGE) continue;
      if (violatesStepien(partner.team, teamOnClock, offeredPicks, season)) continue;

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
