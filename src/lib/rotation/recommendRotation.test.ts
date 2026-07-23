import { describe, expect, it } from "vitest";
import { recommendRotation } from "./recommendRotation";
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

describe("recommendRotation", () => {
  it("suggests minutes that sum to 240 (rounding aside) for a full rotation", () => {
    const roster = Array.from({ length: 12 }, (_, i) =>
      player({ position: "PG", overallRating: 90 - i }),
    );
    const recommended = recommendRotation(roster);
    const total = recommended.reduce((sum, r) => sum + r.suggestedMinutes, 0);
    expect(total).toBeGreaterThanOrEqual(235);
    expect(total).toBeLessThanOrEqual(245);
  });

  it("suggests more minutes for a higher rank than a lower one", () => {
    const roster = Array.from({ length: 8 }, (_, i) =>
      player({ position: "PG", overallRating: 90 - i }),
    );
    const recommended = recommendRotation(roster).sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < recommended.length; i++) {
      expect(recommended[i - 1].suggestedMinutes).toBeGreaterThanOrEqual(
        recommended[i].suggestedMinutes,
      );
    }
  });

  it("returns an empty recommendation for an empty roster", () => {
    expect(recommendRotation([])).toEqual([]);
  });
});
