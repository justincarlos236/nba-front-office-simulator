/**
 * Builds the current-NBA-rosters dataset the simulator seeds new leagues from,
 * entirely from hoopR-nba-data (MIT-licensed) - no paid API, no fragile
 * scraping. Fetches current rosters/bios + the completed season's box scores
 * (plus the prior season as an injured-all-season fallback), runs them through
 * the provider-agnostic canonical merge (seed ratings + minimal consensus
 * overrides), maps provider team abbreviations to ours, validates the result,
 * and writes prisma/data/nbaDataset.json with a versioned manifest + audit.
 *
 * Re-runnable each offseason to refresh: bump TARGET_SEASON / DATASET_VERSION.
 *
 * Run with: npx tsx scripts/import-hoopr-dataset.ts
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createHoopRProvider } from "../src/lib/data-sources/providers/hoopR";
import { mergeCanonicalPlayers, buildManifest } from "../src/lib/data-sources/buildDataset";
import { mapEspnTeamAbbreviation } from "../src/lib/data-sources/teamCrosswalk";
import { validateDataset } from "../src/lib/data-sources/validateDataset";
import { TEAM_SEEDS } from "../prisma/data/teams";

const TARGET_SEASON = 2025; // our start-year convention => the 2025-26 season
const DATASET_VERSION = "2025-26.1";
const ROSTER_DATE = "2026-07-31";
const OUT_PATH = path.join(import.meta.dirname, "..", "prisma", "data", "nbaDataset.json");

const OURS = new Set(TEAM_SEEDS.map((t) => t.abbreviation));

async function main() {
  const hoopR = createHoopRProvider(TARGET_SEASON);
  console.log(
    `Fetching hoopR rosters + ${TARGET_SEASON}-26 and ${TARGET_SEASON - 1} box scores...`,
  );
  const [bios, cur, prev] = await Promise.all([
    hoopR.fetchBios(),
    hoopR.fetchSeasonStats(TARGET_SEASON),
    hoopR.fetchSeasonStats(TARGET_SEASON - 1),
  ]);

  const { players, report } = mergeCanonicalPlayers({
    targetSeason: TARGET_SEASON,
    bios,
    statSets: [
      { season: TARGET_SEASON, lines: cur },
      { season: TARGET_SEASON - 1, lines: prev },
    ],
  });

  // Map every team abbreviation to ours (validateDataset flags any that don't
  // resolve to a seeded team, plus coverage / roster-readiness).
  const out = players.map((p) => {
    const team = mapEspnTeamAbbreviation(p.bio.currentTeamAbbreviation);
    return {
      externalId: p.bio.refs[0]?.id ?? null,
      fullName: p.bio.fullName,
      position: p.bio.position,
      heightInches: p.bio.heightInches,
      weightLbs: p.bio.weightLbs,
      birthDate: p.bio.birthDate,
      draftYear: p.bio.draftYear,
      draftRound: p.bio.draftRound,
      draftPick: p.bio.draftPick,
      nationality: p.bio.nationality,
      college: p.bio.college,
      photoUrl: p.bio.photoUrl,
      teamAbbreviation: team,
      seedOverallRating: p.seedOverallRating,
      seedPotentialRating: p.seedPotentialRating,
      overrideApplied: p.overrideApplied,
      stats: { ...p.stat, team: mapEspnTeamAbbreviation(p.stat.team) ?? "FA" },
    };
  });

  const manifest = buildManifest({
    version: DATASET_VERSION,
    targetSeason: TARGET_SEASON,
    rosterDate: ROSTER_DATE,
    includedTransactions: `Rosters, trades, and signings reflected in hoopR as of ${ROSTER_DATE}.`,
    ratingsModelVersion: "seedRating v1",
    sources: [
      {
        provider: "hoopR",
        role: "rosters",
        url: "https://github.com/sportsdataverse/hoopR-nba-data",
        license: "MIT",
      },
      {
        provider: "hoopR",
        role: "stats",
        url: "https://github.com/sportsdataverse/hoopR-nba-data",
        license: "MIT",
      },
    ],
    playerCount: out.length,
  });

  await writeFile(OUT_PATH, JSON.stringify({ manifest, players: out }, null, 2));

  // ---- Audit ----
  console.log("\n=== IMPORT AUDIT ===");
  console.log(`players written: ${out.length}`);
  console.log(`  from ${TARGET_SEASON} season line: ${report.fromTargetSeason}`);
  console.log(`  from ${TARGET_SEASON - 1} fallback line: ${report.fromFallbackSeason}`);
  console.log(`  no-stat default (${report.noStatDefault})`);
  console.log(`  consensus overrides applied: ${report.overridesApplied}`);
  console.log(
    `  overrides matching nobody: ${report.overridesUnmatched.length ? report.overridesUnmatched.join(", ") : "none"}`,
  );
  console.log(
    `  duplicate names: ${report.duplicateNames.length ? report.duplicateNames.join(", ") : "none"}`,
  );

  // ---- Gameplay-readiness validation (same trim league creation applies) ----
  const report2 = validateDataset(out, OURS);
  console.log(`\nteams covered: ${report2.teamsCovered}/30`);
  console.log(
    `gameplay-ready roster check: ${report2.rosteredCount} rostered, ${report2.freeAgentCount} free agents`,
  );
  if (report2.warnings.length) {
    console.log(`warnings (${report2.warnings.length}):`);
    for (const w of report2.warnings.slice(0, 12)) console.log(`  - [${w.code}] ${w.message}`);
    if (report2.warnings.length > 12) console.log(`  ...and ${report2.warnings.length - 12} more`);
  }
  if (report2.errors.length) {
    console.error(`\nVALIDATION FAILED (${report2.errors.length} errors):`);
    for (const e of report2.errors.slice(0, 20)) console.error(`  - [${e.code}] ${e.message}`);
  } else {
    console.log("gameplay-readiness validation: PASS");
  }

  console.log(`\nWrote ${OUT_PATH}`);
  if (!report2.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
