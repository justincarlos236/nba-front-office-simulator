/**
 * The canonical merge: joins provider bios and (possibly several seasons of)
 * provider stat lines into the final `CanonicalPlayer[]` a new league seeds
 * from, plus a versioned `DatasetManifest`. Pure over already-fetched inputs so
 * it's unit-testable; the offline import script does the fetching and calls in.
 *
 * Design points:
 *  - Identity join is by exact provider id (`ref.id`) first, normalized name as
 *    the cross-provider fallback.
 *  - Injured-all-season stars (no line in the target season) fall back to their
 *    most recent prior season, so a Haliburton/Tatum still gets a real rating
 *    rather than vanishing from their roster.
 *  - Seed ratings come from the box-score model, then the minimal consensus
 *    override layer. The result is baked into the dataset (real-world data
 *    touches a save exactly once, at creation - never re-synced afterward).
 */
import type { CanonicalPlayer, CanonicalPlayerBio, DatasetManifest } from "./canonical";
import { normalizePlayerName } from "./normalizeName";
import type { ProviderSeasonStatLine } from "./providers/adapter";
import { applyRatingOverride, overrideCount, overrideKeys } from "./ratingOverrides";
import { computeSeedOverallRating, computeSeedPotentialRating } from "./seedRating";

/** Overall assigned to a rostered player with no qualifying line in any season. */
export const NO_STATS_DEFAULT_OVERALL = 66;
const DEFAULT_AGE = 25;

export interface SeasonStatSet {
  season: number; // our start-year convention
  lines: ProviderSeasonStatLine[];
}

export interface MergeInput {
  targetSeason: number;
  bios: CanonicalPlayerBio[];
  /** Most-recent (target) season first, then older seasons used only as fallback. */
  statSets: SeasonStatSet[];
}

export interface MergeReport {
  totalBios: number;
  playersOut: number;
  fromTargetSeason: number;
  fromFallbackSeason: number;
  noStatDefault: number;
  overridesApplied: number;
  /** Override keys that matched no player in the dataset (stale entries to prune). */
  overridesUnmatched: string[];
  /** Normalized names shared by more than one bio (identity collisions to review). */
  duplicateNames: string[];
}

export interface MergeResult {
  players: CanonicalPlayer[];
  report: MergeReport;
}

/** Age at the target season (referenced to Oct 1 of that season's start year). */
export function computeAgeAtSeason(birthDate: string | null, targetSeason: number): number {
  if (!birthDate) return DEFAULT_AGE;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return DEFAULT_AGE;
  const ref = new Date(Date.UTC(targetSeason, 9, 1)); // Oct 1
  let age = ref.getUTCFullYear() - born.getUTCFullYear();
  const m = ref.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

/** Indexes a stat set by provider id and by normalized name for fast joins. */
function indexStatSet(lines: ProviderSeasonStatLine[]) {
  const byId = new Map<string, ProviderSeasonStatLine>();
  const byName = new Map<string, ProviderSeasonStatLine>();
  for (const line of lines) {
    if (line.ref.id) byId.set(line.ref.id, line);
    if (!byName.has(line.normalizedName)) byName.set(line.normalizedName, line);
  }
  return { byId, byName };
}

export function mergeCanonicalPlayers(input: MergeInput): MergeResult {
  const { targetSeason, bios, statSets } = input;
  const indexed = statSets.map((s) => ({ season: s.season, ...indexStatSet(s.lines) }));

  const report: MergeReport = {
    totalBios: bios.length,
    playersOut: 0,
    fromTargetSeason: 0,
    fromFallbackSeason: 0,
    noStatDefault: 0,
    overridesApplied: 0,
    overridesUnmatched: [],
    duplicateNames: [],
  };

  const nameCounts = new Map<string, number>();
  const matchedOverrideKeys = new Set<string>();
  const players: CanonicalPlayer[] = [];

  for (const bio of bios) {
    nameCounts.set(bio.normalizedName, (nameCounts.get(bio.normalizedName) ?? 0) + 1);
    const age = computeAgeAtSeason(bio.birthDate, targetSeason);

    // Find the most recent qualifying line: id match preferred, then name.
    let matchIndex = -1;
    let line: ProviderSeasonStatLine | undefined;
    for (let i = 0; i < indexed.length; i++) {
      const id = bio.refs[0]?.id;
      line =
        (id ? indexed[i].byId.get(id) : undefined) ?? indexed[i].byName.get(bio.normalizedName);
      if (line) {
        matchIndex = i;
        break;
      }
    }

    let modelOverall: number;
    let stat: CanonicalPlayer["stat"];
    if (line) {
      modelOverall = computeSeedOverallRating(line.stat);
      // The stat carried on the player reflects the season it came from.
      stat = line.stat;
      if (matchIndex === 0) report.fromTargetSeason++;
      else report.fromFallbackSeason++;
    } else {
      modelOverall = NO_STATS_DEFAULT_OVERALL;
      report.noStatDefault++;
      stat = emptyStat(targetSeason, bio.currentTeamAbbreviation);
    }

    const override = applyRatingOverride(bio.fullName, modelOverall);
    if (override.applied) {
      report.overridesApplied++;
      matchedOverrideKeys.add(normalizedKeyFor(bio.fullName));
    }
    const overall = override.rating;

    players.push({
      bio,
      stat,
      seedOverallRating: overall,
      seedPotentialRating: computeSeedPotentialRating(overall, age),
      overrideApplied: override.applied,
      // Contracts arrive from a separate source and a separate run (they are
      // behind a paid tier - see balldontlieContracts.ts), so the roster/stats
      // build always emits null here and `scripts/import-contracts.ts` fills
      // it in afterwards. That keeps a dataset refresh from requiring a
      // contract subscription just to update box scores.
      contract: null,
    });
  }

  report.playersOut = players.length;
  report.duplicateNames = [...nameCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  report.overridesUnmatched = overrideKeys().filter((k) => !matchedOverrideKeys.has(k));
  return { players, report };
}

// Re-normalize a name the same way ratingOverrides does, for match bookkeeping.
function normalizedKeyFor(fullName: string): string {
  return normalizePlayerName(fullName);
}

function emptyStat(season: number, team: string | null): CanonicalPlayer["stat"] {
  return {
    season,
    team: team ?? "FA",
    gamesPlayed: 0,
    minutesPerGame: 0,
    pointsPerGame: 0,
    reboundsPerGame: 0,
    assistsPerGame: 0,
    stealsPerGame: 0,
    blocksPerGame: 0,
    turnoversPerGame: 0,
    fgPct: null,
    fg3Pct: null,
    ftPct: null,
    trueShootingPct: null,
    usagePct: null,
    winSharesPer48: null,
    boxPlusMinus: null,
    valueOverReplacement: null,
  };
}

export interface ManifestInput {
  version: string;
  targetSeason: number;
  rosterDate: string;
  includedTransactions: string;
  ratingsModelVersion: string;
  sources: DatasetManifest["dataSources"];
  playerCount: number;
}

export function buildManifest(input: ManifestInput): DatasetManifest {
  return {
    version: input.version,
    rosterDate: input.rosterDate,
    seasonYear: input.targetSeason,
    dataSources: input.sources,
    ratingsModelVersion: `${input.ratingsModelVersion} (+${overrideCount()} consensus overrides)`,
    includedTransactions: input.includedTransactions,
    generatedAt: new Date().toISOString(),
    playerCount: input.playerCount,
  };
}
