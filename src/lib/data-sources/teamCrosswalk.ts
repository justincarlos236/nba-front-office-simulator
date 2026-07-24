/**
 * Maps a provider's team abbreviation to the simulator's canonical team
 * abbreviation (the ones seeded from prisma/data/teams.ts). ESPN/hoopR agree
 * with us on 24 of 30 teams and differ on 6 - handled by an explicit table so
 * a player is never silently dropped for an unmatched team. `isKnownTeam`
 * lets the import validate that every mapped abbreviation resolves to a real
 * seeded team.
 */

// ESPN abbreviation -> our abbreviation, for the teams where they differ.
const ESPN_TO_OURS: Readonly<Record<string, string>> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};

export function mapEspnTeamAbbreviation(espn: string | null): string | null {
  if (!espn) return null;
  return ESPN_TO_OURS[espn] ?? espn;
}

export function isKnownTeam(
  abbreviation: string,
  knownAbbreviations: ReadonlySet<string>,
): boolean {
  return knownAbbreviations.has(abbreviation);
}
