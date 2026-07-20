import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { validateTrade, type TradeAssetInput } from "./validateTrade";
import { describeTradeFeasibility, type TeamTradeFinancials } from "./describeTradeFeasibility";

const SEASON = 2023;

describe("describeTradeFeasibility", () => {
  it("reports a valid trade in plain language", () => {
    const assets: TradeAssetInput[] = [
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
    ];
    const validation = validateTrade({
      season: SEASON,
      assets,
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 20_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 20_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
      },
    });

    const summary = describeTradeFeasibility(validation, [], SEASON);
    expect(summary.isValid).toBe(true);
    expect(summary.headline).toBe("Trade Financial Check: Valid");
    expect(summary.detail).toBe("This trade works financially.");
  });

  it("explains a cap-space team taking on too much salary, with a concrete dollar shortfall", () => {
    const outgoingCents = 2_000_000_00n;
    const incomingCents = 20_000_000_00n;
    const capSpaceCents = 10_000_000_00n; // room + outgoing = 12M, incoming 20M -> 8M short

    const assets: TradeAssetInput[] = [
      {
        type: "PLAYER",
        fromTeamId: "A",
        toTeamId: "B",
        playerId: "p1",
        salaryCents: outgoingCents,
      },
      {
        type: "PLAYER",
        fromTeamId: "B",
        toTeamId: "A",
        playerId: "p2",
        salaryCents: incomingCents,
      },
    ];
    const validation = validateTrade({
      season: SEASON,
      assets,
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 50_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
      },
    });
    expect(validation.isValid).toBe(false);

    const teams: TeamTradeFinancials[] = [
      {
        teamLabel: "Team A",
        apronLevel: ApronLevel.UNDER_CAP,
        capSpaceCents,
        outgoingSalaryCents: outgoingCents,
        incomingSalaryCents: incomingCents,
      },
      {
        teamLabel: "Team B",
        apronLevel: ApronLevel.UNDER_CAP,
        capSpaceCents: 50_000_000_00n,
        outgoingSalaryCents: incomingCents,
        incomingSalaryCents: outgoingCents,
      },
    ];

    const summary = describeTradeFeasibility(validation, teams, SEASON);
    expect(summary.isValid).toBe(false);
    expect(summary.headline).toBe("Trade Financial Check: Invalid");
    expect(summary.detail).toContain("Team A needs to send out approximately");
    expect(summary.detail).toContain("$8.0M");
  });

  it("falls back to a structural explanation when there's no salary-matching shortfall", () => {
    const assets: TradeAssetInput[] = [
      {
        type: "PLAYER",
        fromTeamId: "A",
        toTeamId: "B",
        playerId: "p1",
        salaryCents: 5_000_000_00n,
        noTradeClause: true,
      },
    ];
    const validation = validateTrade({
      season: SEASON,
      assets,
      teamCapStates: {
        A: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 20_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
        B: {
          apronLevel: ApronLevel.UNDER_CAP,
          capSpaceCents: 20_000_000_00n,
          ownedFutureFirstRoundPickSeasons: [],
        },
      },
    });
    expect(validation.isValid).toBe(false);

    const summary = describeTradeFeasibility(validation, [], SEASON);
    expect(summary.isValid).toBe(false);
    expect(summary.detail).toBe(
      "One of these players has a no-trade clause and hasn't agreed to this deal.",
    );
  });
});
