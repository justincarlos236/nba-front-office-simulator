import { evaluateReSigningDecision } from "@/lib/gm/reSigningDecision";
import type { GmPersonality } from "@/lib/gm/gmPersonality";
import type { TeamIdentity } from "@/lib/gm/teamIdentity";
import type { TeamNeed } from "@/lib/gm/teamNeeds";
import { clampToMaxSalary } from "@/lib/cap/maxSalary";
import { averageAnnualValueCents } from "@/lib/contracts/contractRaises";

/**
 * The CPU free-agent market: rival teams actually signing the players they
 * were shown to be competing for.
 *
 * WHY THIS EXISTS AT ALL. `rivalInterest.ts` puts competition on the board, but
 * information alone would be theatre: a board that says three teams are chasing
 * a centre and then never signs him is worse than saying nothing, because it
 * manufactures urgency the game does not honour. The audit finding was that a
 * free agent waits indefinitely; showing interest without consequence would
 * leave that true while pretending otherwise.
 *
 * SAME MODEL DRIVES BOTH. The teams that sign are drawn from the same
 * `computeRivalInterest` the board renders, so what the user was told and what
 * happens cannot diverge. If the board named three suitors, one of those three
 * is who signs him.
 *
 * DECISIONS REUSE `evaluateReSigningDecision`. A CPU club weighing a free agent
 * is making the same judgement as one weighing its own expiring player: is this
 * man worth this money, given my identity, my holes and my roster count. That
 * engine is already tested and already models GM personality and financial
 * resistance, so a parallel scoring system here would be a second source of
 * truth that could drift.
 */

export interface PursuingTeam {
  leagueTeamId: string;
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
  /** Roster size before this pass; incremented as the team signs. */
  rosterSize: number;
  capSpaceCents: bigint;
  /** >1 makes a cash-strapped club pickier. See `financialSpendingResistance`. */
  financialThresholdMultiplier: number;
}

export interface PursuableFreeAgent {
  leaguePlayerId: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
  potentialRating: number;
  age: number;
  /** Service years, which set his maximum-salary tier. */
  yearsOfExperience?: number;
  careerGamesMissedToInjury: number;
  /** What this player commands - the offer every pursuing club must meet. */
  estimatedValueCents: bigint;
  /** Term of the deal, from `pickContractLength`. */
  years: number;
  /**
   * The teams shown as interested on the board, in the order the board ranked
   * them. Only these clubs may sign him, which is what keeps the display and
   * the outcome in step.
   */
  interestedTeamIds: string[];
}

export interface CpuSigning {
  leaguePlayerId: string;
  leagueTeamId: string;
  salaryCents: bigint;
  years: number;
}

/**
 * A team will not spend its way to zero on one player. Keeping a floor means a
 * club that signs a free agent still has room to fill the rest of its roster,
 * which stops a single pass from emptying the entire market into one team.
 */
const MAX_SHARE_OF_CAP_SPACE = 0.7;

/** Matches the soft ceiling in `evaluateReSigningDecision`. */
const ROSTER_LIMIT = 15;

/**
 * What each additional serious suitor adds to a free agent's price, and where a
 * bidding war stops.
 *
 * **Demand used to decide who signed a player but never what he cost.** Every
 * free agent had one deterministic price: one interested club, five, or the
 * whole league produced the same number, so a user could outbid by a dollar and
 * win every time, forever, with no escalation. See docs/audits/CONTRACT_AUDIT.md,
 * C-P1-4.
 *
 * The premium is bounded because an unbounded auction is the other failure -
 * clubs talking each other into a salary nobody should pay. A player wanted by
 * four teams costs about a quarter more than one wanted by a single club, which
 * is enough to make competition matter without letting it run away.
 */
const PREMIUM_PER_RIVAL = 0.08;
const MAX_DEMAND_PREMIUM = 0.32;

/**
 * What a free agent actually costs once his suitors are counted.
 *
 * Exported so the market board can quote the same figure the pass will charge -
 * a board that advertises one price and then charges another is worse than one
 * that says nothing.
 */
export function demandAdjustedPriceCents(
  baseCents: bigint,
  seriousSuitors: number,
  age: number,
  season: number,
  /** Service years, which set the max tier. Omitted falls back to the age proxy. */
  yearsOfExperience?: number | null,
): bigint {
  const premium = Math.min(MAX_DEMAND_PREMIUM, PREMIUM_PER_RIVAL * Math.max(0, seriousSuitors - 1));
  const bid = Math.round(Number(baseCents) * (1 + premium));
  // A bidding war cannot break a league rule. The individual maximum binds here
  // exactly as it binds every other pricing path - see cap/maxSalary.ts.
  return BigInt(Math.round(clampToMaxSalary(bid, age, season, yearsOfExperience)));
}

/**
 * Runs one market pass.
 *
 * Best players first, because that is the order a real market clears in - a
 * club with money spends it on the best man available, not on whoever it
 * happens to consider first. Each free agent goes to the first interested team
 * whose GM actually says yes.
 *
 * Deterministic: no randomness anywhere. The same league state always produces
 * the same market, so a user who read the board and chose to wait can
 * understand exactly why they lost a player.
 */
export function runCpuFreeAgentPass(
  freeAgents: PursuableFreeAgent[],
  teams: PursuingTeam[],
  currentSeason: number,
): CpuSigning[] {
  const byId = new Map(teams.map((t) => [t.leagueTeamId, t]));
  const signings: CpuSigning[] = [];

  const ordered = [...freeAgents].sort((a, b) => b.overallRating - a.overallRating);

  for (const fa of ordered) {
    // A club is a serious suitor only if it can fit him *and* its GM says yes
    // at the asking price. Interest alone is not a bid.
    // The club commits to the whole deal, not to year one. A cap-space signing
    // escalates 5% a year, so judging on the first year alone would have a GM
    // agree to one number and pay another - see averageAnnualValueCents.
    const annualCostOf = (priceCents: bigint) =>
      averageAnnualValueCents(priceCents, fa.years, "NONE");

    const wouldSignAt = (team: PursuingTeam, priceCents: bigint): boolean => {
      if (team.rosterSize >= ROSTER_LIMIT) return false;
      // Re-checked against *live* cap space, which falls as this same pass
      // spends it - the board's snapshot was taken before any of these
      // signings happened.
      const spendCeiling = BigInt(Math.floor(Number(team.capSpaceCents) * MAX_SHARE_OF_CAP_SPACE));
      if (priceCents > spendCeiling) return false;

      return (
        evaluateReSigningDecision({
          team: {
            identity: team.identity,
            needs: team.needs,
            personality: team.personality,
            rosterSizeBeforeThisDecision: team.rosterSize,
          },
          currentSeason,
          player: {
            position: fa.position,
            overallRating: fa.overallRating,
            potentialRating: fa.potentialRating,
            age: fa.age,
            careerGamesMissedToInjury: fa.careerGamesMissedToInjury,
          },
          offerSalaryCents: annualCostOf(priceCents),
          financialThresholdMultiplier: team.financialThresholdMultiplier,
        }).decision === "RESIGN"
      );
    };

    const suitors = fa.interestedTeamIds
      .map((id) => byId.get(id))
      .filter((t): t is PursuingTeam => t !== undefined)
      .filter((t) => wouldSignAt(t, fa.estimatedValueCents));

    if (suitors.length === 0) continue;

    // Competition moves the price. Whoever is still willing once it has moved
    // gets him; if the premium prices everyone out, the sole remaining bidder
    // pays the ask rather than the market silently failing to clear.
    const asking = demandAdjustedPriceCents(
      fa.estimatedValueCents,
      suitors.length,
      fa.age,
      currentSeason,
      fa.yearsOfExperience,
    );
    const stillIn = suitors.filter((t) => wouldSignAt(t, asking));

    const winner = stillIn[0] ?? suitors[0];
    const price = stillIn.length > 0 ? asking : fa.estimatedValueCents;

    signings.push({
      leaguePlayerId: fa.leaguePlayerId,
      leagueTeamId: winner.leagueTeamId,
      salaryCents: price,
      years: fa.years,
    });
    winner.rosterSize += 1;
    winner.capSpaceCents -= price;
  }

  return signings;
}
