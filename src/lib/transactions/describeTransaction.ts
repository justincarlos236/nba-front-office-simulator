import { formatCentsCompact } from "@/lib/money";

/** A single side's identity for a trade headline: a team label and the players it sent away. */
export interface TradeSide {
  teamLabel: string;
  sentPlayerNames: string[];
}

/**
 * "Bulls traded X and Y to the Lakers for Z" - straight cash/no-return trades
 * ("Bulls traded X to the Lakers") are phrased without "for" since there's
 * nothing to name on the other side.
 */
export function describeTrade(a: TradeSide, b: TradeSide): string {
  const aSent = joinNames(a.sentPlayerNames);
  const bSent = joinNames(b.sentPlayerNames);

  if (a.sentPlayerNames.length > 0 && b.sentPlayerNames.length > 0) {
    return `${a.teamLabel} traded ${aSent} to the ${b.teamLabel} for ${bSent}`;
  }
  if (a.sentPlayerNames.length > 0) {
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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
