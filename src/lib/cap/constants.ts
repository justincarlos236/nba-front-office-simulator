/**
 * Season-by-season CBA figures. These approximate the publicly reported
 * 2023 CBA thresholds and exception amounts — close enough to drive
 * realistic cap math in the simulator, but not an authoritative record of
 * the league's actual audited figures (the same approximation policy used
 * for seeded contract data; see docs/SYSTEMS.md).
 *
 * `tradeMatch*` are the salary-matching formula breakpoints for teams
 * operating below the first apron (2023 CBA Article VII). They're modeled
 * as per-season constants rather than global ones because the real
 * breakpoints are set league-wide each season, not derived as a fixed
 * percentage of the cap.
 */
export interface SeasonCapRules {
  season: number; // e.g. 2025 => the 2025-26 season
  salaryCapCents: bigint;
  luxuryTaxCents: bigint;
  firstApronCents: bigint;
  secondApronCents: bigint;
  nonTaxpayerMLECents: bigint;
  taxpayerMLECents: bigint;
  roomMLECents: bigint;
  biAnnualExceptionCents: bigint;
  emptyRosterChargeCents: bigint; // cap hold charged per roster spot below 12 signed players
  tradeMatchLowerBreakpointCents: bigint;
  tradeMatchUpperBreakpointCents: bigint;
}

export const SEASON_CAP_RULES: readonly SeasonCapRules[] = [
  {
    season: 2023,
    salaryCapCents: 136_021_000_00n,
    luxuryTaxCents: 165_294_000_00n,
    firstApronCents: 172_346_000_00n,
    secondApronCents: 182_794_000_00n,
    nonTaxpayerMLECents: 12_405_000_00n,
    taxpayerMLECents: 5_000_000_00n,
    roomMLECents: 7_723_000_00n,
    biAnnualExceptionCents: 4_500_000_00n,
    emptyRosterChargeCents: 1_157_000_00n,
    tradeMatchLowerBreakpointCents: 7_000_000_00n,
    tradeMatchUpperBreakpointCents: 29_000_000_00n,
  },
  {
    season: 2024,
    salaryCapCents: 140_588_000_00n,
    luxuryTaxCents: 170_814_000_00n,
    firstApronCents: 178_132_000_00n,
    secondApronCents: 188_931_000_00n,
    nonTaxpayerMLECents: 12_822_000_00n,
    taxpayerMLECents: 5_168_000_00n,
    roomMLECents: 8_000_000_00n,
    biAnnualExceptionCents: 4_667_000_00n,
    emptyRosterChargeCents: 1_192_000_00n,
    tradeMatchLowerBreakpointCents: 7_250_000_00n,
    tradeMatchUpperBreakpointCents: 30_000_000_00n,
  },
  {
    season: 2025,
    salaryCapCents: 154_647_000_00n,
    luxuryTaxCents: 187_895_000_00n,
    firstApronCents: 195_945_000_00n,
    secondApronCents: 207_824_000_00n,
    nonTaxpayerMLECents: 14_104_000_00n,
    taxpayerMLECents: 5_685_000_00n,
    roomMLECents: 8_800_000_00n,
    biAnnualExceptionCents: 5_134_000_00n,
    emptyRosterChargeCents: 1_312_000_00n,
    tradeMatchLowerBreakpointCents: 7_950_000_00n,
    tradeMatchUpperBreakpointCents: 33_000_000_00n,
  },
];

// Real NBA cap growth has ranged from ~3% (normal years) to ~10% (new TV
// deal years) - 5%/year is a reasonable flat approximation for seasons
// past the hand-entered table, not a claim about actual future CBA terms.
const CAP_GROWTH_RATE = 0.05;

/**
 * The CBA's minimum team salary: 90% of the cap.
 *
 * Derived from the cap rather than entered per season, because that is
 * literally how the CBA defines it - a hand-entered column would be three more
 * numbers that could drift out of step with the cap they are a percentage of.
 */
const SALARY_FLOOR_FRACTION = 0.9;

export function salaryFloorCents(rules: SeasonCapRules): number {
  return Math.round(Number(rules.salaryCapCents) * SALARY_FLOOR_FRACTION);
}

function scaleCents(cents: bigint, factor: number): bigint {
  return BigInt(Math.round(Number(cents) * factor));
}

export function getSeasonCapRules(season: number): SeasonCapRules {
  const exact = SEASON_CAP_RULES.find((rules) => rules.season === season);
  if (exact) return exact;

  const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
  if (season > latest.season) {
    // Project forward from the last hand-entered season via a flat growth
    // rate, rather than flatlining at 2025's numbers forever - a team's
    // cap space should still meaningfully grow across advanced seasons.
    const factor = (1 + CAP_GROWTH_RATE) ** (season - latest.season);
    return {
      season,
      salaryCapCents: scaleCents(latest.salaryCapCents, factor),
      luxuryTaxCents: scaleCents(latest.luxuryTaxCents, factor),
      firstApronCents: scaleCents(latest.firstApronCents, factor),
      secondApronCents: scaleCents(latest.secondApronCents, factor),
      nonTaxpayerMLECents: scaleCents(latest.nonTaxpayerMLECents, factor),
      taxpayerMLECents: scaleCents(latest.taxpayerMLECents, factor),
      roomMLECents: scaleCents(latest.roomMLECents, factor),
      biAnnualExceptionCents: scaleCents(latest.biAnnualExceptionCents, factor),
      emptyRosterChargeCents: scaleCents(latest.emptyRosterChargeCents, factor),
      tradeMatchLowerBreakpointCents: scaleCents(latest.tradeMatchLowerBreakpointCents, factor),
      tradeMatchUpperBreakpointCents: scaleCents(latest.tradeMatchUpperBreakpointCents, factor),
    };
  }

  // Fall back to the closest known season rather than throwing, so the
  // simulator degrades gracefully for seasons before our hand-entered data.
  const closest = [...SEASON_CAP_RULES].sort(
    (a, b) => Math.abs(a.season - season) - Math.abs(b.season - season),
  )[0];
  if (!closest) {
    throw new Error("No season cap rules configured");
  }
  return closest;
}
