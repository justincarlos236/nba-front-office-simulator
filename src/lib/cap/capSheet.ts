import { getApronLevel, type ApronLevel } from "./apron";
import { getSeasonCapRules } from "./constants";

export interface CapSheetContract {
  playerId: string;
  salaryCents: bigint;
}

export interface CapSheetInput {
  season: number;
  contracts: CapSheetContract[];
  /**
   * Guaranteed money owed to players no longer on the roster.
   *
   * Required, not optional. A cap sheet that omits it under-reports the club's
   * payroll, and once a player can be released that is not a display bug: a
   * release whose charge never reaches the sheet is a way to erase any contract
   * for free. Making it required turns every missed call site into a compile
   * error instead of a silent discount. Pass `0n` where none can exist.
   */
  deadMoneyCents: bigint;
  /** Salary being sent out that this team must still pay after a trade (rare, cash-in-trade cases). */
  retainedSalaryCents?: bigint;
}

export interface CapSheet {
  season: number;
  committedSalaryCents: bigint;
  deadMoneyCents: bigint;
  emptyRosterChargeCents: bigint;
  totalSalaryCents: bigint;
  apronLevel: ApronLevel;
  capSpaceCents: bigint; // 0 if the team is already at or over the cap
  distanceToFirstApronCents: bigint; // negative once over the first apron
  distanceToSecondApronCents: bigint; // negative once over the second apron
}

const MIN_ROSTER_SIZE_FOR_CAP_PURPOSES = 12;

/**
 * Computes a team's full cap sheet for a season from its committed
 * contracts. Pure function over plain data so it can be unit tested (and
 * reused by the AI assistant's tools) without touching the database.
 */
export function computeCapSheet(input: CapSheetInput): CapSheet {
  const rules = getSeasonCapRules(input.season);

  const committedSalaryCents = input.contracts.reduce(
    (sum, contract) => sum + contract.salaryCents,
    0n,
  );
  const deadMoneyCents = input.deadMoneyCents;
  const retainedSalaryCents = input.retainedSalaryCents ?? 0n;

  const emptyRosterSpots = Math.max(0, MIN_ROSTER_SIZE_FOR_CAP_PURPOSES - input.contracts.length);
  const emptyRosterChargeCents = rules.emptyRosterChargeCents * BigInt(emptyRosterSpots);

  const totalSalaryCents =
    committedSalaryCents + deadMoneyCents + retainedSalaryCents + emptyRosterChargeCents;

  const apronLevel = getApronLevel(totalSalaryCents, rules);
  const capSpaceCents =
    totalSalaryCents < rules.salaryCapCents ? rules.salaryCapCents - totalSalaryCents : 0n;

  return {
    season: input.season,
    committedSalaryCents,
    deadMoneyCents: deadMoneyCents + retainedSalaryCents,
    emptyRosterChargeCents,
    totalSalaryCents,
    apronLevel,
    capSpaceCents,
    distanceToFirstApronCents: rules.firstApronCents - totalSalaryCents,
    distanceToSecondApronCents: rules.secondApronCents - totalSalaryCents,
  };
}
