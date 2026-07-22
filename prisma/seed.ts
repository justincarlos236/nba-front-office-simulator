import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TEAM_SEEDS } from "./data/teams";

const PLAYERS_PATH = path.join(import.meta.dirname, "data", "players.json");

interface PlayersFile {
  season: number;
  players: Array<{
    externalId: string;
    fullName: string;
    position: "PG" | "SG" | "SF" | "PF" | "C";
    heightInches: number | null;
    weightLbs: number | null;
    draftYear: number | null;
    draftRound: number | null;
    draftPick: number | null;
    teamAbbreviation: string | null;
    photoUrl?: string | null;
    stats: {
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
    };
  }>;
}

async function seedTeams() {
  console.log(`Seeding ${TEAM_SEEDS.length} teams...`);
  for (const team of TEAM_SEEDS) {
    await prisma.team.upsert({
      where: { abbreviation: team.abbreviation },
      update: {
        name: team.name,
        city: team.city,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
        logoUrl: team.logoUrl,
        marketSize: team.marketSize,
      },
      create: {
        abbreviation: team.abbreviation,
        name: team.name,
        city: team.city,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
        logoUrl: team.logoUrl,
        marketSize: team.marketSize,
      },
    });
  }
  const count = await prisma.team.count();
  console.log(`Done. ${count} teams in the database.`);
}

/**
 * Seeds real player bios + real 2023-24 season stats. Requires
 * prisma/data/players.json (produced by `npm run import:players`, which
 * itself needs `npm run import:season-stats` run first). Contracts and
 * League/LeaguePlayer bootstrapping are deliberately not done here - a
 * League is a specific user's save and doesn't exist until that user
 * signs in and starts one (see docs/ROADMAP.md, M5).
 */
async function seedPlayers() {
  if (!existsSync(PLAYERS_PATH)) {
    console.log(
      "prisma/data/players.json not found - run `npm run import:season-stats` then `npm run import:players` first. Skipping player seeding.",
    );
    return;
  }

  const file: PlayersFile = JSON.parse(await readFile(PLAYERS_PATH, "utf-8"));

  const teams = await prisma.team.findMany();
  const teamIdByAbbreviation = new Map(teams.map((t) => [t.abbreviation, t.id]));

  console.log(`Seeding ${file.players.length} players and their ${file.season} season stats...`);
  let seededPlayers = 0;
  let skippedNoTeam = 0;

  for (const player of file.players) {
    const currentTeamId = player.teamAbbreviation
      ? teamIdByAbbreviation.get(player.teamAbbreviation)
      : undefined;
    if (player.teamAbbreviation && !currentTeamId) {
      skippedNoTeam++;
      continue;
    }

    const dbPlayer = await prisma.player.upsert({
      where: { externalId: player.externalId },
      update: {
        fullName: player.fullName,
        position: player.position,
        heightInches: player.heightInches,
        weightLbs: player.weightLbs,
        draftYear: player.draftYear,
        draftRound: player.draftRound,
        draftPick: player.draftPick,
        currentTeamId: currentTeamId ?? null,
        photoUrl: player.photoUrl ?? null,
      },
      create: {
        externalId: player.externalId,
        fullName: player.fullName,
        position: player.position,
        heightInches: player.heightInches,
        weightLbs: player.weightLbs,
        draftYear: player.draftYear,
        draftRound: player.draftRound,
        draftPick: player.draftPick,
        currentTeamId: currentTeamId ?? null,
        photoUrl: player.photoUrl ?? null,
      },
    });

    await prisma.playerSeasonStat.upsert({
      where: {
        playerId_season_team: {
          playerId: dbPlayer.id,
          season: file.season,
          team: player.teamAbbreviation ?? "FA",
        },
      },
      update: { ...player.stats },
      create: {
        playerId: dbPlayer.id,
        season: file.season,
        team: player.teamAbbreviation ?? "FA",
        ...player.stats,
      },
    });

    seededPlayers++;
  }

  console.log(
    `Done. Seeded ${seededPlayers} players (${skippedNoTeam} skipped - team abbreviation not found).`,
  );
}

async function main() {
  await seedTeams();
  await seedPlayers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
