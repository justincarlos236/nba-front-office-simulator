import { describe, expect, it } from "vitest";
import { ApronLevel } from "./apron";
import { computeCapSheet } from "./capSheet";
import { getSeasonCapRules } from "./constants";

const rules = getSeasonCapRules(2025);

describe("computeCapSheet", () => {
  it("sums committed salary and reports cap space for a team under the cap", () => {
    const sheet = computeCapSheet({
      deadMoneyCents: 0n,
      season: 2025,
      contracts: Array.from({ length: 13 }, (_, i) => ({
        playerId: `p${i}`,
        salaryCents: 5_000_000_00n,
      })),
    });

    expect(sheet.committedSalaryCents).toBe(65_000_000_00n);
    expect(sheet.apronLevel).toBe(ApronLevel.UNDER_CAP);
    expect(sheet.capSpaceCents).toBe(rules.salaryCapCents - 65_000_000_00n);
  });

  it("charges an empty-roster cap hold for each spot below the 12-man minimum", () => {
    const sheet = computeCapSheet({
      deadMoneyCents: 0n,
      season: 2025,
      contracts: Array.from({ length: 9 }, (_, i) => ({
        playerId: `p${i}`,
        salaryCents: 2_000_000_00n,
      })),
    });

    expect(sheet.emptyRosterChargeCents).toBe(rules.emptyRosterChargeCents * 3n);
    expect(sheet.totalSalaryCents).toBe(18_000_000_00n + rules.emptyRosterChargeCents * 3n);
  });

  it("includes dead money and reports zero cap space once over the cap", () => {
    const sheet = computeCapSheet({
      season: 2025,
      contracts: Array.from({ length: 13 }, (_, i) => ({
        playerId: `p${i}`,
        salaryCents: 15_000_000_00n,
      })),
      deadMoneyCents: 3_000_000_00n,
    });

    expect(sheet.deadMoneyCents).toBe(3_000_000_00n);
    expect(sheet.capSpaceCents).toBe(0n);
    expect(sheet.apronLevel).not.toBe(ApronLevel.UNDER_CAP);
  });

  it("flags a team above the second apron", () => {
    const sheet = computeCapSheet({
      deadMoneyCents: 0n,
      season: 2025,
      contracts: Array.from({ length: 15 }, (_, i) => ({
        playerId: `p${i}`,
        salaryCents: 15_000_000_00n,
      })),
    });

    expect(sheet.totalSalaryCents).toBeGreaterThan(rules.secondApronCents);
    expect(sheet.apronLevel).toBe(ApronLevel.SECOND_APRON);
    expect(sheet.distanceToSecondApronCents).toBeLessThan(0n);
  });

  it("falls back to the closest known season for an unconfigured season", () => {
    const sheet = computeCapSheet({ deadMoneyCents: 0n, season: 2099, contracts: [] });
    expect(sheet.apronLevel).toBe(ApronLevel.UNDER_CAP);
  });
});
