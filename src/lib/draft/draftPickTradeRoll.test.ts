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

  it("fires when a trade-down package clears both sides' acceptance bar", () => {
    // #11 alone no longer covers #10. Under the old flat value curve adjacent
    // first-rounders sat ~2% apart, so a bare one-for-one cleared; the curve is
    // now fitted to real pick-value charts (docs/TRADE_AUDIT.md, T-P0-3), where
    // #1 is worth 8x #30 and each slot costs ~6.5%. Moving down one pick for a
    // second-round sweetener is what that market actually looks like.
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [
        {
          team: team("partner"),
          picks: [
            { pickId: "p11", overallPickNumber: 11, round: 1 },
            { pickId: "p40", overallPickNumber: 40, round: 2 },
          ],
        },
      ],
      fixedRng(0),
    );
    expect(result).not.toBeNull();
    expect(result?.partner.leagueTeamId).toBe("partner");
    expect(result?.pickGivenUp.pickId).toBe("p10");
    // Order-independent: the offer pool is now searched cheapest-first, so the
    // smallest package that works is the one that fires. Which picks are in it
    // is the assertion; the order they were assembled in is not.
    expect(result?.picksReceived.map((p) => p.pickId).sort()).toEqual(["p11", "p40"]);
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

// docs/TRADE_AUDIT.md subsystem #11: future picks were out of scope in v1, so a
// team could only move up when it happened to hold a second pick in this same
// draft - and a future first is the archetypal draft-night sweetener.
describe("rollForDraftPickTrade - future picks", () => {
  function teamWithFutureFirsts(id: string, seasons: number[]): DraftPickTradeTeam {
    return { ...team(id), ownedFutureFirstRoundPickSeasons: seasons };
  }

  it("lets a partner move up using a future first-rounder", () => {
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p8", overallPickNumber: 8, round: 1 },
      [
        {
          // No later pick in THIS draft at all - only a future one. Before this
          // was supported the partner had nothing to offer and the roll died.
          team: teamWithFutureFirsts("partner", [SEASON + 1, SEASON + 2, SEASON + 3]),
          picks: [
            {
              pickId: "future-1st",
              overallPickNumber: null,
              round: 1,
              season: SEASON + 1,
              // A bottom-quartile team's first, one year out, is worth $24.3M
              // against pick 8's $23.6M - a genuine near-even swap, so value
              // coverage is not what decides either of these tests.
              //
              // Re-anchored when the projection became lottery-aware
              // (docs/DRAFT_AUDIT.md D-P1-1). A 0.25-percentile team is lottery
              // seed 8, whose EXPECTED slot is 7.04 rather than 8 - mid-lottery
              // seeds gain slightly, because winning the draw moves a team up
              // further than other teams winning pushes it down. That lifted
              // this pick past what pick 10 could cover and the partner
              // correctly refused to overpay, so the fixture moved rather than
              // the threshold.
              originalTeamCompetitivenessPercentile: 0.25,
            },
          ],
        },
      ],
      fixedRng(0),
    );
    expect(result).not.toBeNull();
    expect(result?.picksReceived.map((p) => p.pickId)).toEqual(["future-1st"]);
  });

  it("will not accept a future first that would break the Stepien rule", () => {
    const result = rollForDraftPickTrade(
      SEASON,
      team("on-clock"),
      { pickId: "p10", overallPickNumber: 10, round: 1 },
      [
        {
          // Owns exactly one future first. Giving it up leaves no first-rounder
          // in back-to-back years, which is the whole point of the rule.
          team: teamWithFutureFirsts("partner", [SEASON + 1]),
          picks: [
            {
              pickId: "only-future-1st",
              overallPickNumber: null,
              round: 1,
              season: SEASON + 1,
              // A bottom-quartile team's first, one year out, is worth $20.1M
              // against pick 10's $19.6M - a genuine near-even swap, so value
              // coverage is not what decides either of these tests.
              originalTeamCompetitivenessPercentile: 0.25,
            },
          ],
        },
      ],
      fixedRng(0),
    );
    expect(result).toBeNull();
  });
});
