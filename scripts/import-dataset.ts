/**
 * Builds the current-NBA-rosters dataset the simulator seeds new leagues from.
 *
 * **Two sources, split by what each one actually knows.** hoopR supplies box
 * scores and bio detail (birth dates, real PG/SG positions) under an MIT
 * licence; balldontlie supplies who is on which roster *right now*. That split
 * is forced rather than chosen: hoopR publishes rosters as
 * `rosters_<endYear>.parquet` and the file does not exist until a season is
 * underway, so rebuilding from hoopR alone during an offseason silently
 * reproduces the previous season's lineups. Measured on 2026-08-13, 177 of 585
 * active players were on a different team than hoopR had them.
 *
 * Season handling is likewise split, and the distinction matters:
 *   - TARGET_SEASON is the season the league STARTS in. It sets ages and the
 *     dataset label.
 *   - STAT_SEASON is the most recent COMPLETED season, which is where ratings
 *     come from. During an offseason these differ by one, because the upcoming
 *     season has not been played and has no box scores at all.
 *
 * Runs the merged bios through the provider-agnostic canonical merge (seed
 * ratings + minimal consensus overrides), maps provider team abbreviations to
 * ours, validates, and writes prisma/data/nbaDataset.json with a versioned
 * manifest + audit.
 *
 * Re-runnable each offseason: bump TARGET_SEASON / STAT_SEASON / ROSTER_DATE /
 * DATASET_VERSION. Needs BALLDONTLIE_API_KEY (ALL-STAR tier or above).
 *
 * Run with: npx tsx scripts/import-dataset.ts
 */
import "dotenv/config"; // BALLDONTLIE_API_KEY lives in .env, which tsx does not load
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createHoopRProvider } from "../src/lib/data-sources/providers/hoopR";
import { createBalldontlieRosterProvider } from "../src/lib/data-sources/providers/balldontlieRoster";
import { enrichBios } from "../src/lib/data-sources/enrichBios";
import { mergeCanonicalPlayers, buildManifest } from "../src/lib/data-sources/buildDataset";
import { mapEspnTeamAbbreviation } from "../src/lib/data-sources/teamCrosswalk";
import { validateDataset } from "../src/lib/data-sources/validateDataset";
import { TEAM_SEEDS } from "../prisma/data/teams";

const TARGET_SEASON = 2026; // the season the league starts in => 2026-27
const STAT_SEASON = 2025; // most recent COMPLETED season => 2025-26 box scores
const DATASET_VERSION = "2026-27.1";
const ROSTER_DATE = "2026-08-13";
const OUT_PATH = path.join(import.meta.dirname, "..", "prisma", "data", "nbaDataset.json");

const OURS = new Set(TEAM_SEEDS.map((t) => t.abbreviation));

async function main() {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) throw new Error("BALLDONTLIE_API_KEY is not set - add it to .env");

  // Bound to STAT_SEASON, not TARGET_SEASON: hoopR is used for the completed
  // season's data, and its roster file for TARGET_SEASON does not exist yet.
  const hoopR = createHoopRProvider(STAT_SEASON);
  console.log(
    `Fetching balldontlie rosters + hoopR ${STAT_SEASON}-26 and ${STAT_SEASON - 1} box scores...`,
  );
  const [rosterBios, detailBios, cur, prev] = await Promise.all([
    createBalldontlieRosterProvider(apiKey).fetchBios(),
    hoopR.fetchBios(),
    hoopR.fetchSeasonStats(STAT_SEASON),
    hoopR.fetchSeasonStats(STAT_SEASON - 1),
  ]);

  const { bios: mergedBios, report: enrichReport } = enrichBios(rosterBios, detailBios);

  // A player on a roster with no birth date, no draft record and no box score
  // in either of the last two seasons has, on the evidence available, just
  // entered the league. Saying so is an inference; saying nothing is not
  // neutral, because `resolvePlayerAge` falls back to a constant 27 - and a
  // player frozen at 27 never ages, never declines and can never retire, which
  // is the exact leak documented at length in `src/lib/players/age.ts`.
  // Measured on this run, 18 of them survived the 15-man cut.
  const bios = mergedBios.map((bio) =>
    bio.birthDate === null && bio.draftYear === null
      ? { ...bio, draftYear: TARGET_SEASON }
      : bio,
  );
  const assumedRookies = bios.filter(
    (b, i) => mergedBios[i].draftYear === null && b.draftYear !== null,
  );
  console.log(
    `  roster ${rosterBios.length} + detail ${detailBios.length} -> ` +
      `${enrichReport.matched} enriched (${enrichReport.viaExactName} exact, ` +
      `${enrichReport.viaSurname} surname), ${enrichReport.unmatched.length} roster-only`,
  );

  const { players, report } = mergeCanonicalPlayers({
    targetSeason: TARGET_SEASON,
    bios,
    statSets: [
      { season: STAT_SEASON, lines: cur },
      { season: STAT_SEASON - 1, lines: prev },
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
    includedTransactions: `Rosters, trades, and signings reflected in balldontlie as of ${ROSTER_DATE}. Ratings from the ${STAT_SEASON}-${String(STAT_SEASON + 1).slice(-2)} season.`,
    ratingsModelVersion: "seedRating v1",
    sources: [
      {
        provider: "balldontlie",
        role: "rosters",
        url: "https://docs.balldontlie.io/",
        license: "Commercial - requires an API key",
      },
      {
        provider: "hoopR",
        role: "bios",
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
  console.log(`  from ${STAT_SEASON} season line: ${report.fromTargetSeason}`);
  console.log(`  from ${STAT_SEASON - 1} fallback line: ${report.fromFallbackSeason}`);
  console.log(`  roster entries with no bio-detail match: ${enrichReport.unmatched.length}`);
  console.log(
    `  assumed ${TARGET_SEASON} rookies (no birth date, no draft year, no box score): ` +
      `${assumedRookies.length}` +
      (assumedRookies.length ? ` -> ${assumedRookies.map((b) => b.fullName).join(", ")}` : ""),
  );
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
