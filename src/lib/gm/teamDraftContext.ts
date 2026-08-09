import { prisma } from "@/lib/prisma";
import { resolvePlayerAge } from "@/lib/players/age";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity, type TeamIdentity } from "./teamIdentity";
import { computeTeamNeeds, type TeamNeed } from "./teamNeeds";

/**
 * A team's draft-relevant context - identity (contend/rebuild) and
 * positional needs - computed from its current roster and record.
 * Shared by the CPU draft-AI (`draftAi.ts`, via `src/lib/actions/
 * draft.ts`'s `buildCpuTeamStates`, which layers personality/trade-value
 * fields on top of this) and the Draft Experience's display layer (the
 * broadcast header, order rail, and team-needs overview all want to show
 * "what is this team looking for" without duplicating this computation).
 */
export interface TeamDraftContext {
  identity: TeamIdentity;
  needs: TeamNeed[];
}

export interface RosterPlayerForDraftContext {
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
  age: number;
}

/** Fetches every named team's active roster and returns it grouped by team id. */
export async function fetchRostersByTeam(
  leagueId: string,
  season: number,
  teamIds: string[],
): Promise<Map<string, RosterPlayerForDraftContext[]>> {
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId, isActive: true, leagueTeamId: { in: teamIds } },
    include: { player: true },
  });

  const rosterByTeam = new Map<string, RosterPlayerForDraftContext[]>();
  for (const lp of leaguePlayers) {
    // Query already filters leagueTeamId to the known team ids above -
    // never actually null here, just nullable in the schema (free agents).
    const leagueTeamId = lp.leagueTeamId!;
    const list = rosterByTeam.get(leagueTeamId) ?? [];
    list.push({
      position: lp.player.position,
      overallRating: lp.overallRating,
      age: resolvePlayerAge(lp.player, season),
    });
    rosterByTeam.set(leagueTeamId, list);
  }
  return rosterByTeam;
}

/** Computes {identity, needs} for every team passed in - no exclusions, unlike the AI-specific caller which excludes the user's team. */
export async function computeTeamDraftContexts(
  leagueId: string,
  season: number,
  teams: { id: string; wins: number; losses: number }[],
): Promise<Map<string, TeamDraftContext>> {
  const [percentileByTeam, rosterByTeam] = await Promise.all([
    computeCompetitivenessPercentiles(teams),
    fetchRostersByTeam(
      leagueId,
      season,
      teams.map((t) => t.id),
    ),
  ]);

  const result = new Map<string, TeamDraftContext>();
  for (const t of teams) {
    const roster = rosterByTeam.get(t.id) ?? [];
    const avgAge =
      roster.length > 0 ? roster.reduce((sum, p) => sum + p.age, 0) / roster.length : 24;
    const identity = computeTeamIdentity(percentileByTeam.get(t.id) ?? 0.5, avgAge);
    const needs = computeTeamNeeds(
      roster.map((p) => ({ position: p.position, overallRating: p.overallRating })),
    );
    result.set(t.id, { identity, needs });
  }
  return result;
}
