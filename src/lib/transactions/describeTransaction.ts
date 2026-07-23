import { formatCentsCompact } from "@/lib/money";

/** A single side's identity for a trade headline: a team label and the players/picks it sent away. */
export interface TradeSide {
  teamLabel: string;
  sentAssetNames: string[];
}

/**
 * "Bulls traded X and Y to the Lakers for Z" - straight cash/no-return trades
 * ("Bulls traded X to the Lakers") are phrased without "for" since there's
 * nothing to name on the other side.
 */
export function describeTrade(a: TradeSide, b: TradeSide): string {
  const aSent = joinNames(a.sentAssetNames);
  const bSent = joinNames(b.sentAssetNames);

  if (a.sentAssetNames.length > 0 && b.sentAssetNames.length > 0) {
    return `${a.teamLabel} traded ${aSent} to the ${b.teamLabel} for ${bSent}`;
  }
  if (a.sentAssetNames.length > 0) {
    return `${a.teamLabel} traded ${aSent} to the ${b.teamLabel}`;
  }
  return `${b.teamLabel} traded ${bSent} to the ${a.teamLabel}`;
}

/** "Bulls signed X to a 3-year, $48.7M deal" (or "a 1-year deal" for single-season, salary omitted only if zero). */
export function describeSigning(
  teamLabel: string,
  playerName: string,
  years: number,
  totalSalaryCents: bigint | number,
): string {
  const yearLabel = years === 1 ? "1-year" : `${years}-year`;
  return `${teamLabel} signed ${playerName} to a ${yearLabel}, ${formatCentsCompact(totalSalaryCents)} deal`;
}

/** "X has retired after N seasons with the Bulls" / "X has retired as a free agent" if unrostered. */
export function describeRetirement(playerName: string, teamLabel: string | null): string {
  return teamLabel
    ? `${playerName} has announced their retirement from the ${teamLabel}`
    : `${playerName} has announced their retirement`;
}

/** "Bulls hired X as their new Head Coach" */
export function describeStaffHire(teamLabel: string, staffName: string, roleLabel: string): string {
  return `${teamLabel} hired ${staffName} as their new ${roleLabel}`;
}

/** "Bulls fired X as Head Coach" */
export function describeStaffFire(teamLabel: string, staffName: string, roleLabel: string): string {
  return `${teamLabel} fired ${staffName} as ${roleLabel}`;
}

/** Only fired for a genuine starter/bench boundary crossing - see src/lib/actions/rotation.ts. */
export function describeRotationChange(
  teamLabel: string,
  playerName: string,
  movedToStarting: boolean,
): string {
  return movedToStarting
    ? `${playerName} earns a spot in the ${teamLabel} starting lineup`
    : `${playerName} moves to the bench for the ${teamLabel}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
