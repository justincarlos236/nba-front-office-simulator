import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TEAM_SEEDS } from "./data/teams";

// The current NBA dataset, produced by `npm run import:dataset`
// (scripts/import-hoopr-dataset.ts). Replaces the legacy players.json.
const DATASET_PATH = path.join(import.meta.dirname, "data", "nbaDataset.json");

interface DatasetPlayer {
  externalId: string;
  fullName: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  heightInches: number | null;
  weightLbs: number | null;
  birthDate: string | null;
  draftYear: number | null;
  draftRound: number | null;
  draftPick: number | null;
  teamAbbreviation: string | null;
  photoUrl: string | null;
  seedOverallRating: number;
  seedPotentialRating: number;
  stats: {
    season: number;
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
    usagePct: number | null;
    winSharesPer48: number | null;
    boxPlusMinus: number | null;
    valueOverReplacement: number | null;
  };
}

interface DatasetFile {
  manifest: { version: string; seasonYear: number; playerCount: number };
  players: DatasetPlayer[];
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
 * Seeds the current NBA dataset: real bios, current-team placement, the most
 * recent real season line, and the imported *seed* ratings. Requires
 * prisma/data/nbaDataset.json (produced by `npm run import:dataset`).
 *
 * Additive by design: upserts by externalId and never deletes. Rows from an
 * older dataset/provider keep `seedOverallRating` null, so the league bootstrap
 * (which selects on `seedOverallRating != null`) picks up exactly the current
 * dataset while any active save's referenced Player rows stay intact.
 * Contracts and League/LeaguePlayer bootstrapping are per-save and happen when
 * a user starts a league, not here.
 */
async function seedPlayers() {
  if (!existsSync(DATASET_PATH)) {
    console.log(
      "prisma/data/nbaDataset.json not found - run `npm run import:dataset` first. Skipping player seeding.",
    );
    return;
  }

  const file: DatasetFile = JSON.parse(await readFile(DATASET_PATH, "utf-8"));

  const teams = await prisma.team.findMany();
  const teamIdByAbbreviation = new Map(teams.map((t) => [t.abbreviation, t.id]));

  console.log(
    `Seeding ${file.players.length} players (dataset ${file.manifest.version}, ${file.manifest.seasonYear} season)...`,
  );
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

    const bio = {
      fullName: player.fullName,
      position: player.position,
      birthDate: player.birthDate ? new Date(player.birthDate) : null,
      heightInches: player.heightInches,
      weightLbs: player.weightLbs,
      draftYear: player.draftYear,
      draftRound: player.draftRound,
      draftPick: player.draftPick,
      currentTeamId: currentTeamId ?? null,
      photoUrl: player.photoUrl,
      seedOverallRating: player.seedOverallRating,
      seedPotentialRating: player.seedPotentialRating,
    };

    const dbPlayer = await prisma.player.upsert({
      where: { externalId: player.externalId },
      update: bio,
      create: { externalId: player.externalId, ...bio },
    });

    const { season, team, ...statFields } = player.stats;
    await prisma.playerSeasonStat.upsert({
      where: { playerId_season_team: { playerId: dbPlayer.id, season, team } },
      update: statFields,
      create: { playerId: dbPlayer.id, season, team, ...statFields },
    });

    seededPlayers++;
  }

  console.log(
    `Done. Seeded ${seededPlayers} players (${skippedNoTeam} skipped - team abbreviation not found).`,
  );
}

/**
 * Retires players from a superseded dataset (no seedOverallRating) off their
 * global team, so a team's real-world roster reflects only the current dataset.
 * Their rows are kept (an older save's LeaguePlayers may still reference them,
 * and those use LeaguePlayer.leagueTeamId - not this field - for rosters), just
 * unhooked from `Player.currentTeamId` so global team views aren't a mix of the
 * old and new datasets stacked on top of each other.
 */
async function retireLegacyPlayers() {
  const { count } = await prisma.player.updateMany({
    where: { seedOverallRating: null, currentTeamId: { not: null } },
    data: { currentTeamId: null },
  });
  if (count > 0)
    console.log(`Retired ${count} legacy (superseded-dataset) players from global rosters.`);
}

async function main() {
  await seedTeams();
  await seedPlayers();
  await retireLegacyPlayers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
