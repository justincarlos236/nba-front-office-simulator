import { describe, expect, it } from "vitest";
import {
  describeDirectiveCompliance,
  describeNewExpectation,
  describePayrollDirective,
  describeSeasonEvaluation,
} from "./ownershipMessages";

describe("describeSeasonEvaluation", () => {
  it("uses a harsher tone for a heavy-spend team that drastically fell short", () => {
    const message = describeSeasonEvaluation(
      "DRASTICALLY_FELL_SHORT",
      "CHAMPIONSHIP_CONTENTION",
      "Eliminated in Round 1",
      "EXTREME",
    );
    expect(message).toContain("significant financial investment");
    expect(message).toContain("unacceptable");
  });

  it("uses a milder tone for a modest-spend team falling short", () => {
    const message = describeSeasonEvaluation(
      "FELL_SHORT",
      "COMPETE_FOR_PLAY_IN",
      "Missed the playoffs",
      "MODEST",
    );
    expect(message).not.toContain("significant financial investment");
  });

  it("gives positive framing when expectations are exceeded", () => {
    const message = describeSeasonEvaluation(
      "EXCEEDED",
      "MAKE_PLAYOFFS",
      "Won the championship",
      "SIGNIFICANT",
    );
    expect(message.toLowerCase()).toContain("thrilled");
  });
});

describe("describeNewExpectation", () => {
  it("states the expectation in plain language", () => {
    expect(describeNewExpectation("WIN_PLAYOFF_SERIES")).toContain("win a playoff series");
  });
});

describe("describePayrollDirective", () => {
  it("includes the dollar target and season", () => {
    const message = describePayrollDirective(185_000_000_00n, 2026);
    expect(message).toContain("$185.0M");
    expect(message).toContain("2026-27");
  });
});

describe("describeDirectiveCompliance", () => {
  it("differs based on whether the directive was met", () => {
    expect(describeDirectiveCompliance(true)).toContain("met");
    expect(describeDirectiveCompliance(false)).toContain("ignored");
  });
});
