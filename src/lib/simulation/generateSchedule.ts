import { createSeededRandom } from "../contracts/seededRandom";
import {
  REGULAR_SEASON_TARGET_DAYS,
  targetGamesForDayIndex,
  isAllStarBreakDay,
} from "../calendar/seasonCalendar";

export interface ScheduleTeam {
  leagueTeamId: string;
  conference: "EAST" | "WEST";
  division: string;
}

export interface ScheduledGame {
  gameNumber: number;
  dayIndex: number;
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
}

interface UnscheduledGame {
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
}

interface PairGames {
  teamA: string;
  teamB: string;
  count: number;
}

// Close to the real NBA's Oct-April window - a target, not a hard cap (see
// assignDays: the day-by-day loop runs past this if the eligibility rule
// needs more room, it never fails to schedule everyone).
//
// **This used to be silently discarded.** The per-day cap was
// `Math.ceil(games.length / SEASON_LENGTH_DAYS_TARGET)`, and for 1,230 games
// over 175 days that is `ceil(7.03) = 8`. Packing a flat eight games into
// every night finished the season in 156 days rather than 175, which is 11%
// short of a real one - and because the same 82 games were crammed into 18
// fewer days, back-to-backs came out at 22 per team against a real 14. The
// rounding, not the target, was setting the season length.
//
// The cap now varies by weekday (`GAMES_BY_WEEKDAY`), which both restores the
// length and gives the league the light Thursdays and heavy Fridays a real
// schedule has. Measured by `scripts/schedule-realism-audit.ts`.
const SEASON_LENGTH_DAYS_TARGET = REGULAR_SEASON_TARGET_DAYS;

// On what fraction of nights the schedule protects rest.
//
// Rest cannot be a weight: the assignment loop deliberately equalises every
// team's remaining-game count, so competing pairs almost always tie on that
// key and *any* non-zero penalty decides every comparison. Measured, the knob
// is effectively binary - always prioritise rest and teams get 8.9
// back-to-backs, never prioritise and they get 22.0, with nothing in between
// at any weight from 0.2 to 3.
//
// So the choice is made per night instead, off the seeded stream: on most
// nights the calendar protects rest, on the rest it does not, and the real
// figure of ~14 falls out of the mix. Deterministic given the seed.
const REST_PRIORITY_NIGHTS = 0.6;

function shuffledIndices(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function groupByConferenceAndDivision(
  teams: ScheduleTeam[],
): Map<string, Map<string, ScheduleTeam[]>> {
  const byConference = new Map<string, Map<string, ScheduleTeam[]>>();
  for (const t of teams) {
    let byDivision = byConference.get(t.conference);
    if (!byDivision) {
      byDivision = new Map();
      byConference.set(t.conference, byDivision);
    }
    const list = byDivision.get(t.division) ?? [];
    list.push(t);
    byDivision.set(t.division, list);
  }
  return byConference;
}

/**
 * Real NBA per-team distribution: 4 division rivals x4 (16) + 10
 * same-conference non-division opponents split 6x4/4x3 (36) + 15
 * other-conference opponents x2 (30) = 82. The 6-of-10/4-of-10 split is
 * exact and symmetric by construction, not approximated: the non-division
 * relationship between any two divisions (5 teams each) is a complete
 * bipartite K(5,5), which decomposes into exactly 5 perfect matchings
 * (team i <-> team (i+k)%5 for k=0..4). Picking 3 of those 5 matchings as
 * "4-game" and the other 2 as "3-game" makes every team's degree work out
 * to 3+3=6 four-game opponents and 2+2=4 three-game opponents (solving
 * a+b=6, a+c=6, b+c=6 across a conference's 3 division-pair relationships
 * gives a=b=c=3) - no general regular-graph search needed.
 */
function buildPairGames(teams: ScheduleTeam[], rng: () => number): PairGames[] {
  const pairs: PairGames[] = [];
  const byConference = groupByConferenceAndDivision(teams);

  for (const byDivision of byConference.values()) {
    const divisions = [...byDivision.values()];

    for (const divTeams of divisions) {
      for (let i = 0; i < divTeams.length; i++) {
        for (let j = i + 1; j < divTeams.length; j++) {
          pairs.push({
            teamA: divTeams[i].leagueTeamId,
            teamB: divTeams[j].leagueTeamId,
            count: 4,
          });
        }
      }
    }

    for (let d1 = 0; d1 < divisions.length; d1++) {
      for (let d2 = d1 + 1; d2 < divisions.length; d2++) {
        const teamsX = divisions[d1];
        const teamsY = divisions[d2];
        const bonusMatchings = new Set(shuffledIndices(5, rng).slice(0, 3));
        for (let k = 0; k < 5; k++) {
          const count = bonusMatchings.has(k) ? 4 : 3;
          for (let i = 0; i < teamsX.length; i++) {
            const j = (i + k) % teamsY.length;
            pairs.push({ teamA: teamsX[i].leagueTeamId, teamB: teamsY[j].leagueTeamId, count });
          }
        }
      }
    }
  }

  const conferences = [...byConference.values()];
  if (conferences.length === 2) {
    const allA = [...conferences[0].values()].flat();
    const allB = [...conferences[1].values()].flat();
    for (const a of allA) {
      for (const b of allB) {
        pairs.push({ teamA: a.leagueTeamId, teamB: b.leagueTeamId, count: 2 });
      }
    }
  }

  return pairs;
}

/** Expands a pair's total game count into individual home/away games - even counts split evenly, odd counts (the 3-game conference pairs) give the extra home game to whichever team id sorts first, a simple deterministic tiebreak. */
function expandPairToGames(pair: PairGames): UnscheduledGame[] {
  let homeForA: number;
  if (pair.count % 2 === 0) {
    homeForA = pair.count / 2;
  } else {
    homeForA = pair.teamA < pair.teamB ? Math.ceil(pair.count / 2) : Math.floor(pair.count / 2);
  }
  const homeForB = pair.count - homeForA;

  const games: UnscheduledGame[] = [];
  for (let i = 0; i < homeForA; i++) {
    games.push({ homeLeagueTeamId: pair.teamA, awayLeagueTeamId: pair.teamB });
  }
  for (let i = 0; i < homeForB; i++) {
    games.push({ homeLeagueTeamId: pair.teamB, awayLeagueTeamId: pair.teamA });
  }
  return games;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Capacity-and-eligibility-constrained day-by-day assignment - not a
 * random greedy chain. A first-draft "shuffle + max(lastDay)+1+jitter"
 * approach has no season-length target, no control over back-to-back
 * frequency, and no mechanism keeping all 30 teams finishing near the
 * same day; this calendar is meant to be the foundation for future
 * date-sensitive systems (All-Star break, trade deadline, fatigue,
 * injury recovery timing), so it needs real temporal structure:
 * - A team may not play 3 days in a row (caps back-to-backs at exactly
 *   one, matching modern real NBA scheduling).
 * - Each day fills up to a target game count derived from the total
 *   games and SEASON_LENGTH_DAYS_TARGET, prioritizing pairs where a team
 *   is furthest behind on its remaining games - this actively keeps all
 *   30 teams finishing close together instead of drifting apart.
 * - The loop runs past the target length if the eligibility rule needs
 *   more room; it never fails to schedule everyone.
 */
function assignDays(
  games: UnscheduledGame[],
  rng: () => number,
  season: number,
): ScheduledGame[] {

  const remainingByPair = new Map<string, UnscheduledGame[]>();
  for (const g of shuffledIndices(games.length, rng).map((i) => games[i])) {
    const key = pairKey(g.homeLeagueTeamId, g.awayLeagueTeamId);
    const list = remainingByPair.get(key) ?? [];
    list.push(g);
    remainingByPair.set(key, list);
  }

  const gamesRemainingByTeam = new Map<string, number>();
  for (const g of games) {
    gamesRemainingByTeam.set(
      g.homeLeagueTeamId,
      (gamesRemainingByTeam.get(g.homeLeagueTeamId) ?? 0) + 1,
    );
    gamesRemainingByTeam.set(
      g.awayLeagueTeamId,
      (gamesRemainingByTeam.get(g.awayLeagueTeamId) ?? 0) + 1,
    );
  }

  const lastPlayedDay = new Map<string, number>();
  const consecutiveStreak = new Map<string, number>();

  function isEligible(teamId: string, day: number): boolean {
    const last = lastPlayedDay.get(teamId);
    if (last === undefined || last !== day - 1) return true;
    return (consecutiveStreak.get(teamId) ?? 0) < 2;
  }

  function markPlayed(teamId: string, day: number): void {
    const last = lastPlayedDay.get(teamId);
    consecutiveStreak.set(teamId, last === day - 1 ? (consecutiveStreak.get(teamId) ?? 0) + 1 : 1);
    lastPlayedDay.set(teamId, day);
  }

  const scheduled: ScheduledGame[] = [];
  let remainingCount = games.length;
  let day = 0;
  const maxDays = SEASON_LENGTH_DAYS_TARGET * 3;

  while (remainingCount > 0 && day < maxDays) {
    day += 1;
    // Six days of nothing, exactly where a real schedule leaves them. The
    // All-Star break used to be a pause in *simulation* only - games either
    // side of it sat on consecutive days, so the calendar had no gap at all.
    if (isAllStarBreakDay(day)) continue;
    const targetGamesPerDay = Math.max(1, targetGamesForDayIndex(season, day));
    const usedToday = new Set<string>();
    let scheduledToday = 0;

    // How many of a pair's two teams would be on the back half of a
    // back-to-back if this game went today - and whether tonight is a night
    // the schedule cares. Drawn once per day, before the sort, so the
    // comparator stays a pure function of the day.
    const protectRest = rng() < REST_PRIORITY_NIGHTS;
    const restedness = (g: UnscheduledGame): number =>
      protectRest
        ? (lastPlayedDay.get(g.homeLeagueTeamId) === day - 1 ? 1 : 0) +
          (lastPlayedDay.get(g.awayLeagueTeamId) === day - 1 ? 1 : 0)
        : 0;

    const candidates = [...remainingByPair.values()]
      .filter((list) => list.length > 0)
      .sort((listA, listB) => {
        const gA = listA[0];
        const gB = listB[0];
        const minA = Math.min(
          gamesRemainingByTeam.get(gA.homeLeagueTeamId) ?? 0,
          gamesRemainingByTeam.get(gA.awayLeagueTeamId) ?? 0,
        );
        const minB = Math.min(
          gamesRemainingByTeam.get(gB.homeLeagueTeamId) ?? 0,
          gamesRemainingByTeam.get(gB.awayLeagueTeamId) ?? 0,
        );
        // Playing yesterday costs a pair some priority, but does not veto it.
        // The eligibility rule only ever *forbade* a third straight day, so
        // nothing pushed back against back-to-backs at all and teams averaged
        // 22 against a real 14 - and fatigue and injury frequency both scale
        // with games played, so that was never cosmetic. Made an absolute
        // preference instead, it overshot to 8.9. A weight lands it on the
        // real number; see `scripts/schedule-realism-audit.ts`.
        return minB - restedness(gB) - (minA - restedness(gA));
      });

    for (const list of candidates) {
      if (scheduledToday >= targetGamesPerDay) break;
      const game = list[0];
      const { homeLeagueTeamId, awayLeagueTeamId } = game;
      if (usedToday.has(homeLeagueTeamId) || usedToday.has(awayLeagueTeamId)) continue;
      if (!isEligible(homeLeagueTeamId, day) || !isEligible(awayLeagueTeamId, day)) continue;

      list.shift();
      usedToday.add(homeLeagueTeamId);
      usedToday.add(awayLeagueTeamId);
      scheduled.push({ ...game, dayIndex: day, gameNumber: 0 });
      remainingCount -= 1;
      scheduledToday += 1;
      gamesRemainingByTeam.set(
        homeLeagueTeamId,
        (gamesRemainingByTeam.get(homeLeagueTeamId) ?? 1) - 1,
      );
      gamesRemainingByTeam.set(
        awayLeagueTeamId,
        (gamesRemainingByTeam.get(awayLeagueTeamId) ?? 1) - 1,
      );
      markPlayed(homeLeagueTeamId, day);
      markPlayed(awayLeagueTeamId, day);
    }
  }

  if (remainingCount > 0) {
    throw new Error(
      `generateRoundRobinSchedule: failed to schedule ${remainingCount} games within ${maxDays} days`,
    );
  }

  return scheduled;
}

/**
 * Real-NBA-weighted 82-game regular season (1,230 games league-wide) with
 * a day-by-day calendar (`dayIndex`) - see buildPairGames/assignDays for
 * the exact weighting and scheduling rules. `gameNumber` is derived from
 * the final day-sorted order, so existing simulation code (which resolves
 * games in `gameNumber` order) automatically processes them chronologically
 * with no changes needed there. Deterministic given `seed`. Assumes the
 * standard 30-team, 2-conference/3-division/5-team-per-division structure
 * (same assumption the previous simplified schedule made implicitly).
 */
export function generateRoundRobinSchedule(
  teams: ScheduleTeam[],
  seed: string,
  season: number,
): ScheduledGame[] {
  const rng = createSeededRandom(seed);
  const pairs = buildPairGames(teams, rng);
  const games = pairs.flatMap(expandPairToGames);
  const scheduled = assignDays(games, rng, season);

  scheduled.sort((a, b) => a.dayIndex - b.dayIndex);
  return scheduled.map((game, index) => ({ ...game, gameNumber: index + 1 }));
}
