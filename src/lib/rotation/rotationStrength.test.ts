import { describe, expect, it } from "vitest";
import { computeRotationAdjustedStrength } from "./rotationStrength";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { Position } from "@/generated/prisma/client";

let counter = 0;
function player(
  overrides: Partial<RosterPlayerForSimulation> & { position: Position },
): RosterPlayerForSimulation {
  counter += 1;
  return {
    leaguePlayerId: `p${counter}`,
    fullName: `Player ${counter}`,
    overallRating: 72,
    realStat: null,
    rotationSlot: null,
    targetMinutesPerGame: null,
    ...overrides,
  };
}

describe("computeRotationAdjustedStrength", () => {
  it("matches computeTeamStrength exactly when nobody has a custom rotation", () => {
    const roster = Array.from({ length: 13 }, (_, i) =>
      player({ position: "PG", overallRating: 90 - i }),
    );
    expect(computeRotationAdjustedStrength(roster)).toBe(
      computeTeamStrength(roster.map((p) => p.overallRating)),
    );
  });

  it("returns 0 for an empty roster, matching computeTeamStrength", () => {
    expect(computeRotationAdjustedStrength([])).toBe(0);
  });

  it("rates a team lower when its best player is benched than when they start", () => {
    const star = player({ position: "PG", overallRating: 95 });
    const filler = Array.from({ length: 8 }, (_, i) =>
      player({ position: "SF", overallRating: 65 - i }),
    );

    const starting = computeRotationAdjustedStrength([
      { ...star, rotationSlot: 0, targetMinutesPerGame: 36 },
      ...filler.map((p, i) => ({ ...p, rotationSlot: i + 1, targetMinutesPerGame: null })),
    ]);
    const benched = computeRotationAdjustedStrength([
      { ...star, rotationSlot: 11, targetMinutesPerGame: 0 },
      ...filler.map((p, i) => ({ ...p, rotationSlot: i, targetMinutesPerGame: null })),
    ]);

    expect(benched).toBeLessThan(starting);
  });
});
