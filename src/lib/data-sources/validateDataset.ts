/**
 * Dataset validation: the "is this dataset actually playable" gate the import
 * runs before a dataset is trusted. Beyond shape checks (rating ranges,
 * required fields, uniqueness, team coverage) it asserts GAMEPLAY READINESS -
 * after the same top-15 roster trim league creation applies, every team must
 * be able to field a legal, positionally-balanced rotation. Returns a
 * structured report (errors block; warnings inform) for the import audit.
 */
import type { Position } from "./mapPosition";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "./rosterConstruction";

export interface ValidatablePlayer {
  externalId: string | null;
  fullName: string;
  position: Position;
  teamAbbreviation: string | null;
  seedOverallRating: number;
  seedPotentialRating: number;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  teamsCovered: number;
  rosteredCount: number;
  freeAgentCount: number;
}

const MIN_ROSTER_SIZE = 13;
const RATING_MIN = 60;
const RATING_MAX = 99;

const GUARDS: ReadonlySet<Position> = new Set<Position>(["PG", "SG"]);
const BIGS: ReadonlySet<Position> = new Set<Position>(["PF", "C"]);

export interface ValidateOptions {
  expectedTeams?: number;
  maxRosterSize?: number;
}

export function validateDataset(
  players: readonly ValidatablePlayer[],
  knownTeams: ReadonlySet<string>,
  opts: ValidateOptions = {},
): ValidationReport {
  const expectedTeams = opts.expectedTeams ?? 30;
  const maxRosterSize = opts.maxRosterSize ?? DEFAULT_MAX_ROSTER_SIZE;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string) => errors.push({ level: "error", code, message });
  const warn = (code: string, message: string) =>
    warnings.push({ level: "warning", code, message });

  // ---- Per-player field, rating, and team-assignment checks ----
  const seenIds = new Set<string>();
  const nameCounts = new Map<string, number>();
  for (const p of players) {
    const who = p.fullName || p.externalId || "(unnamed)";
    if (!p.fullName?.trim()) err("missing_name", `Player ${p.externalId ?? "?"} has no name`);
    nameCounts.set(p.fullName, (nameCounts.get(p.fullName) ?? 0) + 1);
    if (p.externalId) {
      if (seenIds.has(p.externalId))
        err("duplicate_id", `Duplicate externalId ${p.externalId} (${who})`);
      seenIds.add(p.externalId);
    }
    if (p.seedOverallRating < RATING_MIN || p.seedOverallRating > RATING_MAX)
      err(
        "rating_range",
        `${who} overall ${p.seedOverallRating} out of [${RATING_MIN},${RATING_MAX}]`,
      );
    if (p.seedPotentialRating < p.seedOverallRating || p.seedPotentialRating > RATING_MAX)
      err(
        "potential_range",
        `${who} potential ${p.seedPotentialRating} < overall or > ${RATING_MAX}`,
      );
    if (p.teamAbbreviation && !knownTeams.has(p.teamAbbreviation))
      err("unknown_team", `${who} on unknown team "${p.teamAbbreviation}"`);
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) warn("duplicate_name", `${count} players share the name "${name}"`);
  }

  // ---- Team coverage + gameplay-ready rosters (after the real trim) ----
  const { rostered, byTeam } = selectTopPerTeam(
    players,
    (p) => p.teamAbbreviation,
    (p) => p.seedOverallRating,
    maxRosterSize,
  );
  const teamsCovered = byTeam.size;
  if (teamsCovered < expectedTeams)
    err("team_coverage", `Only ${teamsCovered}/${expectedTeams} teams have players`);

  for (const [team, all] of byTeam) {
    const roster = all.slice(0, maxRosterSize);
    if (roster.length < MIN_ROSTER_SIZE)
      err("short_roster", `${team} has only ${roster.length} players (min ${MIN_ROSTER_SIZE})`);
    const guards = roster.filter((p) => GUARDS.has(p.position)).length;
    const bigs = roster.filter((p) => BIGS.has(p.position)).length;
    const centers = roster.filter((p) => p.position === "C").length;
    if (guards < 2) err("no_backcourt", `${team} can't field a backcourt (${guards} guards)`);
    if (bigs < 2) err("no_frontcourt", `${team} can't field a frontcourt (${bigs} bigs)`);
    if (centers === 0)
      warn("no_center", `${team} has no natural center on its top ${roster.length}`);
  }

  if (!players.some((p) => p.seedOverallRating >= 90))
    warn("no_stars", "No player rated 90+ - the rating scale looks compressed");

  const rosteredCount = rostered.size;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    teamsCovered,
    rosteredCount,
    freeAgentCount: players.filter((p) => p.teamAbbreviation).length - rosteredCount,
  };
}
