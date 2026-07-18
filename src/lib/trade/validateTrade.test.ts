import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { validateTrade, type TradeTeamCapState } from "./validateTrade";

const taxpayerState = (overrides: Partial<TradeTeamCapState> = {}): TradeTeamCapState => ({
  apronLevel: ApronLevel.TAXPAYER,
  capSpaceCents: 0n,
  ownedFutureFirstRoundPickSeasons: [],
  ...overrides,
});

describe("validateTrade", () => {
  it("rejects a trade with fewer than two teams", () => {
    const result = validateTrade({
      season: 2025,
      assets: [],
      teamCapStates: {},
    });
    expect(result.isValid).toBe(false);
    expect(result.violations[0].rule).toBe("INVALID_STRUCTURE");
  });

  it("flags a team referenced in assets with no cap state provided", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 10_000_000_00n,
        },
      ],
      teamCapStates: { A: taxpayerState() },
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.rule === "MISSING_TEAM_CAP_STATE")).toBe(true);
  });

  it("approves a simple two-team trade within the matching band", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 10_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p2",
          salaryCents: 12_000_000_00n,
        },
      ],
      teamCapStates: { A: taxpayerState(), B: taxpayerState() },
    });
    expect(result.violations).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("rejects a trade where a taxpayer team takes back far more than it can match", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 3_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p2",
          salaryCents: 30_000_000_00n,
        },
      ],
      teamCapStates: { A: taxpayerState(), B: taxpayerState() },
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.rule === "SALARY_MATCHING" && v.teamId === "A")).toBe(
      true,
    );
  });

  it("lets a cap-space team absorb salary up to its room plus outgoing salary", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p1",
          salaryCents: 20_000_000_00n,
        },
      ],
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 25_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: taxpayerState(),
      },
    });
    expect(result.isValid).toBe(true);
  });

  it("rejects a cap-space team taking on more salary than its room allows", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p1",
          salaryCents: 20_000_000_00n,
        },
      ],
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 5_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: taxpayerState(),
      },
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.rule === "SALARY_MATCHING")).toBe(true);
  });

  it("blocks a second-apron team from aggregating two outgoing salaries into one incoming player", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 8_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p2",
          salaryCents: 8_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p3",
          salaryCents: 15_000_000_00n,
        },
      ],
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.SECOND_APRON,
          capSpaceCents: 0n,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: taxpayerState(),
      },
    });
    expect(result.isValid).toBe(false);
    expect(
      result.violations.some(
        (v) => v.rule === "NO_AGGREGATION_AT_SECOND_APRON" && v.teamId === "A",
      ),
    ).toBe(true);
  });

  it("flags a no-trade clause player included without consent", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 10_000_000_00n,
          noTradeClause: true,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p2",
          salaryCents: 10_000_000_00n,
        },
      ],
      teamCapStates: { A: taxpayerState(), B: taxpayerState() },
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.rule === "NO_TRADE_CLAUSE")).toBe(true);
  });

  it("blocks a trade that leaves a team without first-round picks in consecutive years", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 5_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "A",
          playerId: "p2",
          salaryCents: 5_000_000_00n,
        },
        {
          type: "DRAFT_PICK",
          fromTeamId: "A",
          toTeamId: "B",
          pickId: "pick2027",
          season: 2027,
          round: 1,
        },
      ],
      teamCapStates: {
        // Team A owns only its 2027 first (no 2026 or 2028) - trading 2027
        // away would leave it without a first in 2026, 2027, or 2028.
        A: taxpayerState({ ownedFutureFirstRoundPickSeasons: [2027] }),
        B: taxpayerState(),
      },
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.rule === "STEPIEN_RULE")).toBe(true);
  });

  it("allows trading a first-round pick when adjacent years are still owned", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "DRAFT_PICK",
          fromTeamId: "A",
          toTeamId: "B",
          pickId: "pick2027",
          season: 2027,
          round: 1,
        },
      ],
      teamCapStates: {
        A: taxpayerState({ ownedFutureFirstRoundPickSeasons: [2026, 2027, 2028] }),
        B: taxpayerState(),
      },
    });
    expect(result.isValid).toBe(true);
  });

  it("validates a three-team trade", () => {
    const result = validateTrade({
      season: 2025,
      assets: [
        {
          type: "PLAYER",
          fromTeamId: "A",
          toTeamId: "B",
          playerId: "p1",
          salaryCents: 8_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "B",
          toTeamId: "C",
          playerId: "p2",
          salaryCents: 8_000_000_00n,
        },
        {
          type: "PLAYER",
          fromTeamId: "C",
          toTeamId: "A",
          playerId: "p3",
          salaryCents: 8_000_000_00n,
        },
      ],
      teamCapStates: { A: taxpayerState(), B: taxpayerState(), C: taxpayerState() },
    });
    expect(result.isValid).toBe(true);
  });
});
