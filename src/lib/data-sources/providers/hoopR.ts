/**
 * hoopR-nba-data provider adapter (https://github.com/sportsdataverse/hoopR-nba-data,
 * MIT-licensed). Maps two of its release datasets into our canonical schema:
 *
 *   - `rosters/`   -> current roster placement + biographical facts + headshot
 *   - `player_box/`-> per-game box scores, aggregated here into a season line
 *                     (regular season only), the same methodology as the
 *                     existing 2023-24 pipeline in scripts/import-season-stats.ts.
 *
 * Both datasets key on ESPN's `athlete_id`, so a player's bio and stat line join
 * on an exact id rather than a fuzzy name match.
 *
 * Season convention: ESPN labels a season by the calendar year it *ends*
 * (2026 = the 2025-26 season). Our schema labels a season by its *start* year
 * (2025 = 2025-26). This adapter takes/returns our start-year convention and
 * translates at the file boundary. See `espnSeasonYear`.
 *
 * All the row->canonical transforms are exported as pure functions so they're
 * unit-testable without a network fetch.
 */
import { mapPosition, type Position } from "../mapPosition";
import { normalizePlayerName } from "../normalizeName";
import { readParquetFromUrl, type ParquetRow } from "../parquet";
import type { CanonicalPlayerBio, CanonicalSeasonStat } from "../canonical";
import type { BioProvider, ProviderSeasonStatLine, StatsProvider } from "./adapter";

const REPO_BASE = "https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-data/main/nba";
const ESPN_REGULAR_SEASON = 2; // season_type: 1=pre, 2=regular, 3=post
const PROVIDER_ID = "hoopR";

/** ESPN's end-year label for our start-year season (2025 -> 2026). */
export function espnSeasonYear(ourStartYear: number): number {
  return ourStartYear + 1;
}

function str(row: ParquetRow, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(row: ParquetRow, key: string): number {
  const v = row[key];
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `6' 5"` -> 77. Tolerates `6-5` and stray spaces; null when unparseable. */
export function parseHeightInches(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)\D+(\d+)/);
  if (!m) return null;
  return Number(m[1]) * 12 + Number(m[2]);
}

/** `205 lbs` -> 205; null when unparseable. */
export function parseWeightLbs(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : null;
}

// ESPN rosters only carry coarse G/F/C. Since a believable lineup needs the
// finer PG/SG/SF/PF split, refine it by height: guards split into PG/SG and
// forwards into SF/PF around a rough height break (centers and unknown-height
// players keep the base mapping). Heuristic, not a scouting claim.
const GUARD_SG_MIN_INCHES = 77; // 6'5"
const FORWARD_PF_MIN_INCHES = 81; // 6'9"

export function inferPosition(espnAbbr: string | null, heightInches: number | null): Position {
  const base = mapPosition(espnAbbr);
  if (heightInches == null) return base;
  const a = (espnAbbr ?? "").trim().toUpperCase();
  if (a === "G") return heightInches >= GUARD_SG_MIN_INCHES ? "SG" : "PG";
  if (a === "F") return heightInches >= FORWARD_PF_MIN_INCHES ? "PF" : "SF";
  return base;
}

/** Maps one `rosters` row to a canonical bio. */
export function rosterRowToBio(row: ParquetRow): CanonicalPlayerBio {
  const fullName = str(row, "full_name") ?? str(row, "display_name") ?? "";
  const dob = str(row, "date_of_birth");
  const heightInches = parseHeightInches(str(row, "height"));
  return {
    normalizedName: normalizePlayerName(fullName),
    fullName,
    position: inferPosition(str(row, "position_abbreviation"), heightInches),
    heightInches,
    weightLbs: parseWeightLbs(str(row, "weight")),
    // date_of_birth arrives like "1998-09-02T07:00Z"; keep just the date.
    birthDate: dob ? dob.slice(0, 10) : null,
    // Draft/college aren't in the rosters file; a secondary provider or the
    // hoopR draft dataset can enrich these later. Null, never fabricated.
    draftYear: null,
    draftRound: null,
    draftPick: null,
    nationality: str(row, "birth_place_country"),
    college: null,
    photoUrl: str(row, "headshot_href"),
    currentTeamAbbreviation: str(row, "team_abbreviation"),
    refs: [{ provider: PROVIDER_ID, id: String(row.athlete_id ?? "") }],
  };
}

interface BoxAccumulator {
  athleteId: string;
  name: string;
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Aggregates regular-season `player_box` rows into one canonical season line
 * per player. Mirrors scripts/import-season-stats.ts: regular season only,
 * skip DNPs, most-frequent team as the season team, min-games floor to drop
 * noisy call-up samples, TS% from summed makes/attempts.
 */
export function aggregateSeasonStats(
  boxRows: ParquetRow[],
  ourStartYear: number,
  minGames = 10,
): ProviderSeasonStatLine[] {
  const byPlayer = new Map<string, BoxAccumulator>();

  for (const row of boxRows) {
    if (num(row, "season_type") !== ESPN_REGULAR_SEASON) continue;
    // ESPN's `active` flag is unreliable here (it reads false for ~half of a
    // star's *played* games), so the authoritative "did they play" signal is
    // minutes > 0 (with did_not_play as a belt-and-suspenders guard). Using
    // `active` dropped ~half of every heavy-minute player's season.
    if (row.did_not_play === true) continue;
    const minutes = num(row, "minutes");
    if (minutes <= 0) continue;

    const athleteId = String(row.athlete_id ?? "");
    if (!athleteId) continue;
    let acc = byPlayer.get(athleteId);
    if (!acc) {
      acc = {
        athleteId,
        name: str(row, "athlete_display_name") ?? "",
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
      byPlayer.set(athleteId, acc);
    }

    acc.games += 1;
    acc.minutes += minutes;
    acc.pts += num(row, "points");
    acc.reb += num(row, "rebounds");
    acc.ast += num(row, "assists");
    acc.stl += num(row, "steals");
    acc.blk += num(row, "blocks");
    acc.tov += num(row, "turnovers");
    acc.fgm += num(row, "field_goals_made");
    acc.fga += num(row, "field_goals_attempted");
    acc.fg3m += num(row, "three_point_field_goals_made");
    acc.fg3a += num(row, "three_point_field_goals_attempted");
    acc.ftm += num(row, "free_throws_made");
    acc.fta += num(row, "free_throws_attempted");
    const team = str(row, "team_abbreviation");
    if (team) acc.teamCounts.set(team, (acc.teamCounts.get(team) ?? 0) + 1);
  }

  const result: ProviderSeasonStatLine[] = [];
  for (const acc of byPlayer.values()) {
    if (acc.games < minGames) continue;
    const team = [...acc.teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "FA";
    const stat: CanonicalSeasonStat = {
      season: ourStartYear,
      team,
      gamesPlayed: acc.games,
      minutesPerGame: round2(acc.minutes / acc.games),
      pointsPerGame: round2(acc.pts / acc.games),
      reboundsPerGame: round2(acc.reb / acc.games),
      assistsPerGame: round2(acc.ast / acc.games),
      stealsPerGame: round2(acc.stl / acc.games),
      blocksPerGame: round2(acc.blk / acc.games),
      turnoversPerGame: round2(acc.tov / acc.games),
      fgPct: acc.fga > 0 ? round3(acc.fgm / acc.fga) : null,
      fg3Pct: acc.fg3a > 0 ? round3(acc.fg3m / acc.fg3a) : null,
      ftPct: acc.fta > 0 ? round3(acc.ftm / acc.fta) : null,
      trueShootingPct:
        acc.fga + acc.fta > 0 ? round3(acc.pts / (2 * (acc.fga + 0.44 * acc.fta))) : null,
      // hoopR's free bulk releases carry no advanced metrics - left null, not guessed.
      usagePct: null,
      winSharesPer48: null,
      boxPlusMinus: null,
      valueOverReplacement: null,
    };
    result.push({
      ref: { provider: PROVIDER_ID, id: acc.athleteId },
      normalizedName: normalizePlayerName(acc.name),
      stat,
    });
  }
  return result;
}

/**
 * A hoopR provider bound to one season (our start-year convention). Implements
 * both the bio and stats roles; the import pipeline consumes it through those
 * interfaces, not this concrete type.
 */
export function createHoopRProvider(ourStartYear: number): BioProvider & StatsProvider {
  const espnYear = espnSeasonYear(ourStartYear);
  return {
    id: PROVIDER_ID,
    displayName: "hoopR NBA Data (sportsdataverse)",
    license: "MIT",
    sourceUrl: "https://github.com/sportsdataverse/hoopR-nba-data",

    async fetchBios(): Promise<CanonicalPlayerBio[]> {
      const rows = await readParquetFromUrl(
        `${REPO_BASE}/rosters/parquet/rosters_${espnYear}.parquet`,
      );
      return rows.map(rosterRowToBio).filter((b) => b.fullName.length > 0);
    },

    async fetchSeasonStats(seasonYear: number): Promise<ProviderSeasonStatLine[]> {
      const rows = await readParquetFromUrl(
        `${REPO_BASE}/player_box/parquet/player_box_${espnSeasonYear(seasonYear)}.parquet`,
      );
      return aggregateSeasonStats(rows, seasonYear);
    },
  };
}
