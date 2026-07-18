/**
 * Downloads real 2023-24 NBA regular-season box scores (MIT-licensed, from
 * https://github.com/NocturneBear/NBA-Data-2010-2024), aggregates them from
 * per-game logs into per-player season averages, and writes the result to
 * prisma/data/playerSeasonStats.json for the seed pipeline to consume.
 *
 * The source only provides raw box scores, not pre-computed season
 * averages or advanced metrics (BPM/Win Shares/VORP) - those are
 * team-context-dependent and not reproducible from box scores alone, so
 * this pipeline (and the valuation model that consumes its output) works
 * directly off real per-game box-score stats instead.
 *
 * Run with: npx tsx scripts/import-season-stats.ts
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const SEASON_LABEL = "2023-24";
const SEASON_YEAR = 2023; // matches PlayerSeasonStat.season (start year of the season)

const SOURCE_FILES = [
  "https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/main/regular_season_box_scores_2010_2024_part_1.csv",
  "https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/main/regular_season_box_scores_2010_2024_part_2.csv",
  "https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/main/regular_season_box_scores_2010_2024_part_3.csv",
];

interface BoxScoreRow {
  seasonYear: string;
  gameId: string;
  personId: string;
  personName: string;
  teamTricode: string;
  minutes: string;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pts: number;
}

function parseCsv(text: string): BoxScoreRow[] {
  const lines = text.split("\n");
  const rows: BoxScoreRow[] = [];
  // header: season_year,game_date,gameId,matchup,teamId,teamCity,teamName,teamTricode,teamSlug,
  //         personId,personName,position,comment,jerseyNum,minutes,fieldGoalsMade,fieldGoalsAttempted,
  //         fieldGoalsPercentage,threePointersMade,threePointersAttempted,threePointersPercentage,
  //         freeThrowsMade,freeThrowsAttempted,freeThrowsPercentage,reboundsOffensive,reboundsDefensive,
  //         reboundsTotal,assists,steals,blocks,turnovers,foulsPersonal,points,plusMinusPoints
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.startsWith(SEASON_LABEL + ",")) continue;
    const c = line.split(",");
    const minutes = c[14];
    if (!minutes) continue; // DNP / did not play

    rows.push({
      seasonYear: c[0],
      gameId: c[2],
      personId: c[9],
      personName: c[10],
      teamTricode: c[7],
      minutes,
      fgm: Number(c[15]),
      fga: Number(c[16]),
      fg3m: Number(c[18]),
      fg3a: Number(c[19]),
      ftm: Number(c[21]),
      fta: Number(c[22]),
      reb: Number(c[26]),
      ast: Number(c[27]),
      stl: Number(c[28]),
      blk: Number(c[29]),
      tov: Number(c[30]),
      pts: Number(c[32]),
    });
  }
  return rows;
}

function minutesToDecimal(minutes: string): number {
  const [m, s] = minutes.split(":").map(Number);
  return m + (s ?? 0) / 60;
}

interface AggregatedPlayer {
  personId: string;
  personName: string;
  team: string;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  trueShootingPct: number | null;
}

function dedupe(rows: BoxScoreRow[]): BoxScoreRow[] {
  const seen = new Set<string>();
  const result: BoxScoreRow[] = [];
  for (const row of rows) {
    const key = `${row.personId}:${row.gameId}`;
    if (seen.has(key)) continue; // source data has occasional duplicate rows (e.g. mid-season trades)
    seen.add(key);
    result.push(row);
  }
  return result;
}

function aggregate(rows: BoxScoreRow[]): AggregatedPlayer[] {
  const byPlayer = new Map<
    string,
    {
      personName: string;
      teamCounts: Map<string, number>;
      games: number;
      minutes: number;
      pts: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      tov: number;
      fgm: number;
      fga: number;
      fg3m: number;
      fg3a: number;
      ftm: number;
      fta: number;
    }
  >();

  for (const row of rows) {
    let entry = byPlayer.get(row.personId);
    if (!entry) {
      entry = {
        personName: row.personName,
        teamCounts: new Map(),
        games: 0,
        minutes: 0,
        pts: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        fgm: 0,
        fga: 0,
        fg3m: 0,
        fg3a: 0,
        ftm: 0,
        fta: 0,
      };
      byPlayer.set(row.personId, entry);
    }

    entry.games += 1;
    entry.minutes += minutesToDecimal(row.minutes);
    entry.pts += row.pts;
    entry.reb += row.reb;
    entry.ast += row.ast;
    entry.stl += row.stl;
    entry.blk += row.blk;
    entry.tov += row.tov;
    entry.fgm += row.fgm;
    entry.fga += row.fga;
    entry.fg3m += row.fg3m;
    entry.fg3a += row.fg3a;
    entry.ftm += row.ftm;
    entry.fta += row.fta;
    entry.teamCounts.set(row.teamTricode, (entry.teamCounts.get(row.teamTricode) ?? 0) + 1);
  }

  const result: AggregatedPlayer[] = [];
  for (const [personId, entry] of byPlayer) {
    if (entry.games < 10) continue; // drop small, noisy sample sizes (call-ups, 10-days)

    const mostFrequentTeam = [...entry.teamCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    result.push({
      personId,
      personName: entry.personName,
      team: mostFrequentTeam,
      gamesPlayed: entry.games,
      minutesPerGame: round2(entry.minutes / entry.games),
      pointsPerGame: round2(entry.pts / entry.games),
      reboundsPerGame: round2(entry.reb / entry.games),
      assistsPerGame: round2(entry.ast / entry.games),
      stealsPerGame: round2(entry.stl / entry.games),
      blocksPerGame: round2(entry.blk / entry.games),
      turnoversPerGame: round2(entry.tov / entry.games),
      fgPct: entry.fga > 0 ? round3(entry.fgm / entry.fga) : null,
      fg3Pct: entry.fg3a > 0 ? round3(entry.fg3m / entry.fg3a) : null,
      ftPct: entry.fta > 0 ? round3(entry.ftm / entry.fta) : null,
      trueShootingPct:
        entry.fga + entry.fta > 0 ? round3(entry.pts / (2 * (entry.fga + 0.44 * entry.fta))) : null,
    });
  }

  return result.sort((a, b) => b.pointsPerGame - a.pointsPerGame);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function main() {
  console.log(`Downloading ${SOURCE_FILES.length} box score files...`);
  const texts = await Promise.all(
    SOURCE_FILES.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
      return res.text();
    }),
  );

  const rawRows = texts.flatMap(parseCsv);
  const rows = dedupe(rawRows);
  console.log(
    `Parsed ${rawRows.length} played-game rows for ${SEASON_LABEL} (${rawRows.length - rows.length} duplicates removed).`,
  );

  const players = aggregate(rows);
  console.log(`Aggregated into ${players.length} players (min. 10 games played).`);

  const outPath = path.join(import.meta.dirname, "..", "prisma", "data", "playerSeasonStats.json");
  await writeFile(
    outPath,
    JSON.stringify({ season: SEASON_YEAR, seasonLabel: SEASON_LABEL, players }, null, 2),
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
