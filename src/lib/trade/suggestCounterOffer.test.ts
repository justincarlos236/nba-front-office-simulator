import { describe, expect, it } from "vitest";
import { suggestCounterOffer, type IdentifiedTradeAsset } from "./suggestCounterOffer";
import {
  evaluateTradeOffer,
  type TradePlayerAsset,
  type TradePickAsset,
} from "./evaluateTradeOffer";
import type { EvaluateTradeOfferInput } from "./evaluateTradeOffer";

function player(overrides: Partial<TradePlayerAsset> = {}): TradePlayerAsset {
  return {
    type: "PLAYER",
    overallRating: 75,
    potentialRating: 75,
    age: 27,
    position: "SF",
    currentSalaryCents: 15_000_000_00n,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
    ...overrides,
  };
}

function pick(overrides: Partial<TradePickAsset> = {}): TradePickAsset {
  return {
    type: "DRAFT_PICK",
    pickSeason: 2025,
    round: 1,
    overallPickNumber: null,
    originalTeamCompetitivenessPercentile: 0.5,
    ...overrides,
  };
}

function asset(
  id: string,
  label: string,
  tradeAsset: TradePlayerAsset | TradePickAsset,
): IdentifiedTradeAsset {
  return { id, label, asset: tradeAsset };
}

const FIVE_PLAYER_ROSTER = [
  { overallRating: 90, age: 28 },
  { overallRating: 82, age: 26 },
  { overallRating: 75, age: 27 },
  { overallRating: 70, age: 25 },
  { overallRating: 65, age: 24 },
];

const RESPONDING_TEAM: EvaluateTradeOfferInput["respondingTeam"] = {
  identity: "PLAYOFF_TEAM",
  needs: [],
  personality: "BALANCED",
  roster: FIVE_PLAYER_ROSTER,
};

describe("suggestCounterOffer", () => {
  it("suggests nothing when the trade is already an accept", () => {
    const suggestion = suggestCounterOffer({
      respondingTeam: RESPONDING_TEAM,
      currentSeason: 2023,
      incoming: [asset("p1", "Fair Player", player({ overallRating: 75, age: 27 }))],
      outgoing: [asset("p2", "Their Player", player({ overallRating: 75, age: 27 }))],
      availableToAdd: [],
    });
    expect(suggestion.action).toBe("NONE");
  });

  it("suggests adding a real available asset that actually flips the decision to ACCEPT", () => {
    const incoming = [asset("p1", "Below-Value Player", player({ overallRating: 68, age: 27 }))];
    const outgoing = [asset("p2", "Their Player", player({ overallRating: 75, age: 27 }))];

    // Sanity check: this trade alone should not be accepted.
    const base = evaluateTradeOffer({
      respondingTeam: RESPONDING_TEAM,
      currentSeason: 2023,
      incoming: incoming.map((a) => a.asset),
      outgoing: outgoing.map((a) => a.asset),
    });
    expect(base.decision).not.toBe("ACCEPT");

    const availableToAdd = [
      asset("pick1", "2026 2nd Round Pick", pick({ pickSeason: 2026, round: 2 })),
      asset("pick2", "2025 1st Round Pick", pick({ pickSeason: 2025, round: 1 })),
    ];

    const suggestion = suggestCounterOffer({
      respondingTeam: RESPONDING_TEAM,
      currentSeason: 2023,
      incoming,
      outgoing,
      availableToAdd,
    });

    expect(suggestion.action).toBe("ADD_ASSET");
    if (suggestion.action === "ADD_ASSET") {
      // Verify the suggestion is real: actually adding it produces an ACCEPT.
      const suggested = availableToAdd.find((a) => a.id === suggestion.asset.id)!;
      const withSuggestion = evaluateTradeOffer({
        respondingTeam: RESPONDING_TEAM,
        currentSeason: 2023,
        incoming: [...incoming.map((a) => a.asset), suggested.asset],
        outgoing: outgoing.map((a) => a.asset),
      });
      expect(withSuggestion.decision).toBe("ACCEPT");
    }
  });

  it("prefers the cheapest sufficient addition when multiple would work", () => {
    const incoming = [asset("p1", "Below-Value Player", player({ overallRating: 74, age: 27 }))];
    const outgoing = [asset("p2", "Their Player", player({ overallRating: 75, age: 27 }))];

    const smallPick = asset(
      "small",
      "Late 2nd Round Pick",
      pick({ round: 2, originalTeamCompetitivenessPercentile: 0.9 }),
    );
    const bigPlayer = asset("big", "Star Player", player({ overallRating: 90, age: 26 }));

    const suggestion = suggestCounterOffer({
      respondingTeam: RESPONDING_TEAM,
      currentSeason: 2023,
      incoming,
      outgoing,
      availableToAdd: [bigPlayer, smallPick],
    });

    expect(suggestion.action).toBe("ADD_ASSET");
    if (suggestion.action === "ADD_ASSET") {
      expect(suggestion.asset.id).toBe("small");
    }
  });

  it("returns NONE when no available asset is enough to flip the decision", () => {
    // A big shortfall with only a low-value asset available - not untouchable
    // (rating well below SUPERSTAR tier, identity outside the top-2 rule),
    // so this should hit the "sweeten the pot" path and still come up short.
    const incoming = [asset("p1", "Scrub", player({ overallRating: 60, age: 30 }))];
    const outgoing = [asset("p2", "Good Player", player({ overallRating: 80, age: 27 }))];

    const suggestion = suggestCounterOffer({
      respondingTeam: { ...RESPONDING_TEAM, identity: "TANKING" },
      currentSeason: 2023,
      incoming,
      outgoing,
      availableToAdd: [
        asset(
          "pick1",
          "Late 2nd Round Pick",
          pick({ round: 2, originalTeamCompetitivenessPercentile: 0.95 }),
        ),
      ],
    });

    expect(suggestion.action).toBe("NONE");
  });

  it("suggests dropping the untouchable player rather than adding more to the pile", () => {
    const roster = [
      { overallRating: 92, age: 30 },
      { overallRating: 78, age: 27 },
      { overallRating: 72, age: 25 },
    ];
    const untouchable = asset(
      "untouchable-star",
      "Untouchable Superstar",
      player({ overallRating: 92, age: 30, currentSalaryCents: 55_000_000_00n }),
    );
    const alsoOffered = asset(
      "role-player",
      "Role Player",
      player({ overallRating: 70, age: 26, currentSalaryCents: 8_000_000_00n }),
    );
    const incoming = [
      asset(
        "in1",
        "Good Player 1",
        player({ overallRating: 82, age: 33, currentSalaryCents: 45_000_000_00n }),
      ),
      asset(
        "in2",
        "Good Player 2",
        player({ overallRating: 76, age: 28, currentSalaryCents: 40_000_000_00n }),
      ),
    ];

    const suggestion = suggestCounterOffer({
      respondingTeam: { identity: "REBUILDING", needs: [], personality: "BALANCED", roster },
      currentSeason: 2023,
      incoming,
      outgoing: [untouchable, alsoOffered],
      availableToAdd: [asset("extra-pick", "2026 1st Round Pick", pick())],
    });

    expect(suggestion.action).toBe("DROP_OUTGOING");
    if (suggestion.action === "DROP_OUTGOING") {
      expect(suggestion.asset.id).toBe("untouchable-star");
    }
  });
});
