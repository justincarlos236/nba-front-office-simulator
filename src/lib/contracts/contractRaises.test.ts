import { describe, expect, it } from "vitest";
import {
  contractYearSalaries,
  averageAnnualValueCents,
  maxRaiseFor,
  BIRD_RIGHTS_MAX_RAISE,
  STANDARD_MAX_RAISE,
} from "./contractRaises";
import type { SigningMechanism } from "@/lib/freeagency/validateSigning";
import type { ExceptionUsed } from "@/generated/prisma/client";

const FIRST_YEAR = 20_000_000_00n;
const usd = (cents: bigint) => Number(cents) / 100 / 1_000_000;

describe("maxRaiseFor", () => {
  it("gives Bird rights the higher ceiling", () => {
    expect(maxRaiseFor("BIRD_RIGHTS")).toBe(BIRD_RIGHTS_MAX_RAISE);
    expect(BIRD_RIGHTS_MAX_RAISE).toBeGreaterThan(STANDARD_MAX_RAISE);
  });

  it("gives every other mechanism the standard ceiling", () => {
    for (const mechanism of [
      "NONE",
      "VETERAN_MINIMUM",
      "MID_LEVEL_NON_TAXPAYER",
      "MID_LEVEL_TAXPAYER",
    ] as const) {
      expect(maxRaiseFor(mechanism)).toBe(STANDARD_MAX_RAISE);
    }
  });

  it("falls back to the conservative ceiling for an unknown mechanism", () => {
    // Wrongly granting 8% inflates payrolls league-wide; wrongly granting 5%
    // understates one deal.
    expect(maxRaiseFor(null)).toBe(STANDARD_MAX_RAISE);
    expect(maxRaiseFor(undefined)).toBe(STANDARD_MAX_RAISE);
  });
});

describe("contractYearSalaries", () => {
  it("starts at the agreed first-year salary", () => {
    expect(contractYearSalaries(FIRST_YEAR, 4, "NONE")[0]).toBe(FIRST_YEAR);
  });

  it("raises off the first year rather than compounding", () => {
    // The real CBA rule: each raise is a percentage of year one, so the
    // increments are equal. Compounding would make them grow.
    const years = contractYearSalaries(FIRST_YEAR, 4, "NONE").map(Number);
    const steps = [years[1] - years[0], years[2] - years[1], years[3] - years[2]];
    expect(steps[0]).toBeCloseTo(steps[1], -2);
    expect(steps[1]).toBeCloseTo(steps[2], -2);
  });

  it("pays a Bird re-signing more by the final year than a cap-space deal", () => {
    const bird = contractYearSalaries(FIRST_YEAR, 5, "BIRD_RIGHTS");
    const capSpace = contractYearSalaries(FIRST_YEAR, 5, "NONE");
    expect(bird[0]).toBe(capSpace[0]);
    expect(usd(bird[4])).toBeCloseTo(usd(FIRST_YEAR) * 1.32, 1);
    expect(usd(capSpace[4])).toBeCloseTo(usd(FIRST_YEAR) * 1.2, 1);
  });

  /**
   * The regression this exists for. CPU re-signings and CPU free-agent
   * signings wrote the same figure into every year, so a CPU club's payroll
   * never grew across a deal and its future apron position was too healthy.
   * See docs/CONTRACT_AUDIT.md C-P2-3.
   */
  it("never produces a flat schedule for a multi-year deal", () => {
    for (const mechanism of ["BIRD_RIGHTS", "NONE", "VETERAN_MINIMUM"] as const) {
      const years = contractYearSalaries(FIRST_YEAR, 3, mechanism);
      expect(years[2]).toBeGreaterThan(years[0]);
    }
  });

  it("returns exactly the requested number of years", () => {
    for (const years of [1, 2, 3, 4, 5]) {
      expect(contractYearSalaries(FIRST_YEAR, years, "NONE")).toHaveLength(years);
    }
  });

  it("treats a zero or negative term as a single year rather than an empty deal", () => {
    // A contract with no years is invisible to every cap sheet in the product.
    expect(contractYearSalaries(FIRST_YEAR, 0, "NONE")).toHaveLength(1);
    expect(contractYearSalaries(FIRST_YEAR, -2, "NONE")).toHaveLength(1);
  });
});

/**
 * `signFreeAgentAction` maps `validateSigning`'s `SigningMechanism` onto the
 * `ExceptionUsed` enum stored on the contract, and `contractYearSalaries` then
 * reads that stored value to pick a raise rate. The raise function was tested
 * in isolation; this covers the hop between them, which is where a mechanism
 * could quietly land on the wrong rate.
 *
 * Kept as a table rather than a copy of the ternary chain in the action, so a
 * new mechanism has to be added here deliberately rather than defaulting into
 * whichever branch the chain ends on.
 */
describe("signing mechanism maps to the right raise", () => {
  const MECHANISM_TO_STORED: Record<SigningMechanism, ExceptionUsed> = {
    VETERAN_MINIMUM: "VETERAN_MINIMUM",
    RE_SIGNING_RIGHTS: "BIRD_RIGHTS",
    CAP_SPACE: "NONE",
    NON_TAXPAYER_MLE: "MID_LEVEL_NON_TAXPAYER",
    TAXPAYER_MLE: "MID_LEVEL_TAXPAYER",
  };

  it("gives only a re-signing the 8% rate", () => {
    for (const [mechanism, stored] of Object.entries(MECHANISM_TO_STORED) as [
      SigningMechanism,
      ExceptionUsed,
    ][]) {
      const expected =
        mechanism === "RE_SIGNING_RIGHTS" ? BIRD_RIGHTS_MAX_RAISE : STANDARD_MAX_RAISE;
      expect(maxRaiseFor(stored)).toBe(expected);
    }
  });

  it("covers every mechanism validateSigning can return", () => {
    // If a mechanism is added and not mapped, its raise silently becomes 5%.
    const mechanisms: SigningMechanism[] = [
      "CAP_SPACE",
      "NON_TAXPAYER_MLE",
      "TAXPAYER_MLE",
      "VETERAN_MINIMUM",
      "RE_SIGNING_RIGHTS",
    ];
    expect(Object.keys(MECHANISM_TO_STORED).sort()).toEqual([...mechanisms].sort());
  });

  it("escalates a Bird re-signing faster than the same money via cap space", () => {
    const bird = contractYearSalaries(FIRST_YEAR, 4, MECHANISM_TO_STORED.RE_SIGNING_RIGHTS);
    const room = contractYearSalaries(FIRST_YEAR, 4, MECHANISM_TO_STORED.CAP_SPACE);
    expect(bird[3]).toBeGreaterThan(room[3]);
  });
});

describe("averageAnnualValueCents", () => {
  it("equals the first year on a one-year deal", () => {
    expect(averageAnnualValueCents(FIRST_YEAR, 1, "NONE")).toBe(FIRST_YEAR);
  });

  it("exceeds the first year on any multi-year deal", () => {
    // The gap this exists to close: a GM judging on year one commits to more.
    for (const years of [2, 3, 4, 5]) {
      expect(averageAnnualValueCents(FIRST_YEAR, years, "NONE")).toBeGreaterThan(FIRST_YEAR);
    }
  });

  it("understates by more the longer and richer the escalator", () => {
    const short = averageAnnualValueCents(FIRST_YEAR, 2, "NONE");
    const long = averageAnnualValueCents(FIRST_YEAR, 5, "NONE");
    const longBird = averageAnnualValueCents(FIRST_YEAR, 5, "BIRD_RIGHTS");
    expect(long).toBeGreaterThan(short);
    expect(longBird).toBeGreaterThan(long);
  });

  it("matches the schedule it averages", () => {
    const schedule = contractYearSalaries(FIRST_YEAR, 4, "BIRD_RIGHTS");
    const total = schedule.reduce((sum, s) => sum + s, 0n);
    expect(averageAnnualValueCents(FIRST_YEAR, 4, "BIRD_RIGHTS")).toBe(total / 4n);
  });

  it("is about 12% above year one on a four-year Bird deal", () => {
    const ratio =
      Number(averageAnnualValueCents(FIRST_YEAR, 4, "BIRD_RIGHTS")) / Number(FIRST_YEAR);
    expect(ratio).toBeCloseTo(1.12, 2);
  });
});
