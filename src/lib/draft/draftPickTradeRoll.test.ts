import { describe, expect, it } from "vitest";
import { rollForDraftPickTrade, type DraftPickTradeTeam } from "./draftPickTradeRoll";

const SEASON = 2025;

function team(leagueTeamId: string): DraftPickTradeTeam {
  return { leagueTeamId, identity: "PLAY_IN_TEAM", needs: [], personality: "BALANCED", roster: [] };
}

function fixedRng(value: number): () => number {
  return () => value;
}

describe("rollForDraftPickTrade", () => {
  it("is a clean no-op when the roll itself misses", () => {
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [{ team: team("partner"), picks: [{ pickId: "p11", overallPickNumber: 11, round: 1 }] }],
      fixedRng(0.5), // >= TRADE_ROLL_CHANCE (0.05)
    );
    expect(result).toBeNull();
  });

  it("returns null when no partner has a later pick to offer", () => {
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [{ team: team("partner"), picks: [{ pickId: "p5", overallPickNumber: 5, round: 1 }] }],
      fixedRng(0),
    );
    expect(result).toBeNull();
  });

  it("returns null when no combination of the partner's picks clears the value-coverage floor", () => {
    // Pick 1 is worth vastly more than a lone late second-rounder (pick 60).
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p1", overallPickNumber: 1, round: 1 },
      [{ team: team("partner"), picks: [{ pickId: "p60", overallPickNumber: 60, round: 2 }] }],
      fixedRng(0),
    );
    expect(result).toBeNull();
  });

  it("fires when two adjacent, near-equal-value picks clear both sides' acceptance bar", () => {
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [{ team: team("partner"), picks: [{ pickId: "p11", overallPickNumber: 11, round: 1 }] }],
      fixedRng(0),
    );
    expect(result).not.toBeNull();
    expect(result?.partner.leagueTeamId).toBe("partner");
    expect(result?.pickGivenUp.pickId).toBe("p10");
    expect(result?.picksReceived.map((p) => p.pickId)).toEqual(["p11"]);
  });

  it("never proposes involving a team whose picks weren't passed in as a partner", () => {
    // The user's own team is simply never in the `partners` list - callers
    // are responsible for that exclusion, and this function has no way to
    // reach outside the partners it's given.
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [],
      fixedRng(0),
    );
    expect(result).toBeNull();
  });
});
