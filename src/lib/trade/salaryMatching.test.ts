import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { canAggregateSalaries, isUnderCapSpace, maxIncomingSalaryCents } from "./salaryMatching";

const rules = getSeasonCapRules(2025);

describe("maxIncomingSalaryCents", () => {
  it("allows roughly 200% + $250k for small outgoing salaries below the first apron", () => {
    const outgoing = 5_000_000_00n;
    const max = maxIncomingSalaryCents(outgoing, ApronLevel.TAXPAYER, rules);
    expect(max).toBe(outgoing * 2n + 250_000_00n);
  });

  it("adds a flat amount for mid-range outgoing salaries", () => {
    const outgoing = 15_000_000_00n;
    const max = maxIncomingSalaryCents(outgoing, ApronLevel.TAXPAYER, rules);
    expect(max).toBe(outgoing + rules.tradeMatchLowerBreakpointCents);
  });

  it("caps large outgoing salaries at 125% + $250k", () => {
    const outgoing = 50_000_000_00n;
    const max = maxIncomingSalaryCents(outgoing, ApronLevel.TAXPAYER, rules);
    expect(max).toBe((outgoing * 125n) / 100n + 250_000_00n);
  });

  it("restricts first-apron teams to a flat 110% regardless of size", () => {
    const outgoing = 5_000_000_00n;
    const max = maxIncomingSalaryCents(outgoing, ApronLevel.FIRST_APRON, rules);
    expect(max).toBe((outgoing * 110n) / 100n);
  });

  it("restricts second-apron teams to an exact 100% match", () => {
    const outgoing = 20_000_000_00n;
    const max = maxIncomingSalaryCents(outgoing, ApronLevel.SECOND_APRON, rules);
    expect(max).toBe(outgoing);
  });

  it("returns 0 when the team sends out no salary", () => {
    expect(maxIncomingSalaryCents(0n, ApronLevel.TAXPAYER, rules)).toBe(0n);
  });
});

describe("canAggregateSalaries", () => {
  it("is disallowed only at the second apron", () => {
    expect(canAggregateSalaries(ApronLevel.SECOND_APRON)).toBe(false);
    expect(canAggregateSalaries(ApronLevel.FIRST_APRON)).toBe(true);
    expect(canAggregateSalaries(ApronLevel.TAXPAYER)).toBe(true);
  });
});

describe("isUnderCapSpace", () => {
  it("is only true when strictly under the cap", () => {
    expect(isUnderCapSpace(ApronLevel.UNDER_CAP)).toBe(true);
    expect(isUnderCapSpace(ApronLevel.BETWEEN_CAP_AND_TAX)).toBe(false);
  });
});
