/**
 * How close is the generated regular season to a real NBA one?
 *
 * `generateSchedule.ts` targets 175 days and documents itself as "close to the
 * real NBA's Oct-April window", but the day-assignment loop is allowed to run
 * past that target when its eligibility rule needs room - so the realised
 * length has never actually been measured. Everything a calendar would hang
 * off (a trade deadline, an All-Star break, real dates) depends on that length
 * being right, so it is worth knowing before building any of it.
 *
 * Real reference points, 2024-25 season:
 *   - Oct 22 2024 through Apr 13 2025 = 174 days
 *   - 1,230 games, 82 per team
 *   - ~7.1 games per day on average, ranging from 2-3 on light nights to 13
 *   - roughly 13-15 back-to-backs per team, and zero 3-in-3s
 *
 * Reads only. Run: npx tsx scripts/schedule-realism-audit.ts
 */
import {
  generateRoundRobinSchedule,
  type ScheduleTeam,
} from "../src/lib/simulation/generateSchedule";

const REAL = {
  days: 174,
  games: 1230,
  gamesPerTeam: 82,
  meanGamesPerDay: 1230 / 174,
  backToBacksPerTeam: 14,
};

const DIVISIONS: Record<"EAST" | "WEST", string[]> = {
  EAST: ["Atlantic", "Central", "Southeast"],
  WEST: ["Northwest", "Pacific", "Southwest"],
};

function buildTeams(): ScheduleTeam[] {
  const teams: ScheduleTeam[] = [];
  for (const conference of ["EAST", "WEST"] as const) {
    for (const division of DIVISIONS[conference]) {
      for (let i = 0; i < 5; i++) {
        teams.push({ leagueTeamId: `${division}-${i}`, conference, division });
      }
    }
  }
  return teams;
}

const RUNS = Number(process.env.RUNS ?? 8);
const teams = buildTeams();

interface Stats {
  days: number;
  games: number;
  minGamesPerTeam: number;
  maxGamesPerTeam: number;
  meanPerDay: number;
  maxPerDay: number;
  minPerDay: number;
  emptyDays: number;
  meanBackToBacks: number;
  maxBackToBacks: number;
  threeInThrees: number;
  lastTeamFinishSpread: number;
}

function analyse(seed: string): Stats {
  const games = generateRoundRobinSchedule(teams, seed, 2025);
  const days = Math.max(...games.map((g) => g.dayIndex));

  const perDay = new Map<number, number>();
  const daysByTeam = new Map<string, number[]>();
  for (const g of games) {
    perDay.set(g.dayIndex, (perDay.get(g.dayIndex) ?? 0) + 1);
    for (const t of [g.homeLeagueTeamId, g.awayLeagueTeamId]) {
      daysByTeam.set(t, [...(daysByTeam.get(t) ?? []), g.dayIndex]);
    }
  }

  const counts = [...daysByTeam.values()].map((d) => d.length);
  let totalB2B = 0;
  let maxB2B = 0;
  let threeInThrees = 0;
  const finishDays: number[] = [];
  for (const dayList of daysByTeam.values()) {
    const sorted = [...dayList].sort((a, b) => a - b);
    finishDays.push(sorted[sorted.length - 1]);
    let b2b = 0;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        b2b++;
        run++;
        if (run >= 3) threeInThrees++;
      } else {
        run = 1;
      }
    }
    totalB2B += b2b;
    maxB2B = Math.max(maxB2B, b2b);
  }

  const dayCounts = [...perDay.values()];
  return {
    days,
    games: games.length,
    minGamesPerTeam: Math.min(...counts),
    maxGamesPerTeam: Math.max(...counts),
    meanPerDay: games.length / days,
    maxPerDay: Math.max(...dayCounts),
    minPerDay: Math.min(...dayCounts),
    emptyDays: days - perDay.size,
    meanBackToBacks: totalB2B / daysByTeam.size,
    maxBackToBacks: maxB2B,
    threeInThrees,
    lastTeamFinishSpread: Math.max(...finishDays) - Math.min(...finishDays),
  };
}

const runs = Array.from({ length: RUNS }, (_, i) => analyse(`realism-${i}`));
const mean = (k: keyof Stats) => runs.reduce((s, r) => s + (r[k] as number), 0) / RUNS;

console.log("=".repeat(74));
console.log(`GENERATED REGULAR SEASON vs THE REAL NBA (mean of ${RUNS} schedules)`);
console.log("=".repeat(74));
const row = (label: string, got: number, real: number | string, unit = "") => {
  const gotStr = `${got.toFixed(1)}${unit}`;
  const realStr = typeof real === "number" ? `${real.toFixed(1)}${unit}` : real;
  console.log(`  ${label.padEnd(34)}${gotStr.padStart(10)}${String(realStr).padStart(14)}`);
};
console.log(`  ${"".padEnd(34)}${"GENERATED".padStart(10)}${"REAL NBA".padStart(14)}`);
row("Season length (days)", mean("days"), REAL.days);
row("Total games", mean("games"), REAL.games);
row("Games per team (min)", mean("minGamesPerTeam"), REAL.gamesPerTeam);
row("Games per team (max)", mean("maxGamesPerTeam"), REAL.gamesPerTeam);
row("Mean games per day", mean("meanPerDay"), REAL.meanGamesPerDay);
row("Busiest day", mean("maxPerDay"), "13");
row("Quietest day", mean("minPerDay"), "2");
row("Days with no games", mean("emptyDays"), "~0 (All-Star only)");
row("Back-to-backs per team", mean("meanBackToBacks"), REAL.backToBacksPerTeam);
row("Worst team's back-to-backs", mean("maxBackToBacks"), "~18");
row("3-games-in-3-days", mean("threeInThrees"), 0);
row("Spread in team finish days", mean("lastTeamFinishSpread"), "~2");

console.log(`\n  Individual run lengths: ${runs.map((r) => r.days).join(", ")}`);
