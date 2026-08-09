import { evaluateReSigningDecision } from "@/lib/gm/reSigningDecision";
import type { GmPersonality } from "@/lib/gm/gmPersonality";
import type { TeamIdentity } from "@/lib/gm/teamIdentity";
import type { TeamNeed } from "@/lib/gm/teamNeeds";

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
  careerGamesMissedToInjury: number;
  /** What this player commands - the offer every pursuing club must meet. */
  estimatedValueCents: bigint;
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
    for (const teamId of fa.interestedTeamIds) {
      const team = byId.get(teamId);
      if (!team) continue;
      if (team.rosterSize >= ROSTER_LIMIT) continue;

      // Re-checked against *live* cap space, which falls as this same pass
      // spends it - the board's snapshot was taken before any of these
      // signings happened.
      const spendCeiling = BigInt(Math.floor(Number(team.capSpaceCents) * MAX_SHARE_OF_CAP_SPACE));
      if (fa.estimatedValueCents > spendCeiling) continue;

      const result = evaluateReSigningDecision({
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
        offerSalaryCents: fa.estimatedValueCents,
        financialThresholdMultiplier: team.financialThresholdMultiplier,
      });

      if (result.decision === "RESIGN") {
        signings.push({
          leaguePlayerId: fa.leaguePlayerId,
          leagueTeamId: teamId,
          salaryCents: fa.estimatedValueCents,
        });
        team.rosterSize += 1;
        team.capSpaceCents -= fa.estimatedValueCents;
        break; // signed; no other club gets him
      }
    }
  }

  return signings;
}
