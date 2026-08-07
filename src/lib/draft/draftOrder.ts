import { winPct } from "@/lib/simulation/playoffSeeding";
import { runLottery, type LotteryTeam } from "./draftLottery";

export interface DraftOrderTeam {
  leagueTeamId: string;
  wins: number;
  losses: number;
}

/**
 * The non-playoff teams, seeded 1 (worst record) through 14 (best) -
 * exactly the input `runLottery` needs. Exported so the Draft Lottery
 * Experience's pre-reveal odds overview can show real seeds/odds before
 * the draw runs, without a second copy of this sort.
 */
export function getSeededLotteryTeams(
  allTeams: DraftOrderTeam[],
  playoffTeamIds: ReadonlySet<string>,
): LotteryTeam[] {
  const nonPlayoffTeams = allTeams.filter((t) => !playoffTeamIds.has(t.leagueTeamId));
  return [...nonPlayoffTeams]
    .sort((a, b) => winPct(a) - winPct(b))
    .map((t, i) => ({ leagueTeamId: t.leagueTeamId, seed: i + 1 }));
}

/**
 * The full 60-pick draft order for one season: picks 1-14 come from the
 * lottery among non-playoff teams; picks 15-30 go to the 16 playoff teams
 * in reverse regular-season record (not playoff performance - that's the
 * real NBA rule); round 2 (picks 31-60) is reverse regular-season record
 * across all 30 teams with no lottery at all. Returns team ids ordered
 * pick 1 first (index 0) through pick 60 last (index 59).
 */
export function computeDraftOrder(
  allTeams: DraftOrderTeam[],
  playoffTeamIds: ReadonlySet<string>,
  rng: () => number = Math.random,
): string[] {
  const playoffTeams = allTeams.filter((t) => playoffTeamIds.has(t.leagueTeamId));

  const seededLotteryTeams = getSeededLotteryTeams(allTeams, playoffTeamIds);
  const lotteryOrder = runLottery(seededLotteryTeams, rng);

  const playoffOrder = [...playoffTeams]
    .sort((a, b) => winPct(a) - winPct(b))
    .map((t) => t.leagueTeamId);

  const round1Order = [...lotteryOrder, ...playoffOrder];

  const round2Order = [...allTeams]
    .sort((a, b) => winPct(a) - winPct(b))
    .map((t) => t.leagueTeamId);

  return [...round1Order, ...round2Order];
}
