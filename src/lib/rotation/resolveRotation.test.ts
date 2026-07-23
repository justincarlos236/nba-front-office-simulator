import { describe, expect, it } from "vitest";
import { resolveRotation } from "./resolveRotation";
import { buildAutoRotation } from "./autoRotation";
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

describe("resolveRotation", () => {
  it("is byte-identical to buildAutoRotation when nobody has a custom rotationSlot", () => {
    const roster = [
      player({ position: "PG", overallRating: 88 }),
      player({ position: "SG", overallRating: 82 }),
      player({ position: "SF", overallRating: 79 }),
      player({ position: "PF", overallRating: 75 }),
      player({ position: "C", overallRating: 70 }),
      player({ position: "SG", overallRating: 65 }),
    ];
    const auto = buildAutoRotation(roster);
    const resolved = resolveRotation(roster);

    expect(resolved).toHaveLength(auto.length);
    resolved.forEach((entry, i) => {
      expect(entry.player.leaguePlayerId).toBe(auto[i].player.leaguePlayerId);
      expect(entry.rank).toBe(auto[i].rank);
      expect(entry.targetMinutes).toBeNull();
    });
  });

  it("places an explicitly-slotted player at their exact rank, ahead of higher-rated teammates", () => {
    const promoted = player({
      position: "SG",
      overallRating: 60,
      rotationSlot: 0,
      targetMinutesPerGame: 30,
    });
    const star = player({ position: "PG", overallRating: 95 });
    const filler = Array.from({ length: 4 }, (_, i) =>
      player({ position: "SF", overallRating: 70 - i }),
    );

    const resolved = resolveRotation([promoted, star, ...filler]);
    const promotedEntry = resolved.find((e) => e.player.leaguePlayerId === promoted.leaguePlayerId);
    expect(promotedEntry?.rank).toBe(0);
    expect(promotedEntry?.targetMinutes).toBe(30);
  });

  it("auto-fills gaps around custom slots without disturbing them", () => {
    const promoted = player({ position: "SG", overallRating: 60, rotationSlot: 3 });
    const others = Array.from({ length: 5 }, (_, i) =>
      player({ position: "PG", overallRating: 90 - i }),
    );

    const resolved = resolveRotation([promoted, ...others]);
    const promotedEntry = resolved.find((e) => e.player.leaguePlayerId === promoted.leaguePlayerId);
    expect(promotedEntry?.rank).toBe(3);
    // Every other player fills the remaining slots (0,1,2,4,5) in some order - none collide with slot 3.
    const otherRanks = resolved
      .filter((e) => e.player.leaguePlayerId !== promoted.leaguePlayerId)
      .map((e) => e.rank);
    expect(otherRanks).not.toContain(3);
    expect(new Set(resolved.map((e) => e.rank)).size).toBe(resolved.length);
  });

  it("falls back to auto-rank when two players collide on the same slot", () => {
    const a = player({ position: "PG", overallRating: 80, rotationSlot: 0 });
    const b = player({ position: "SG", overallRating: 75, rotationSlot: 0 });
    const resolved = resolveRotation([a, b]);
    expect(resolved).toHaveLength(2);
    expect(new Set(resolved.map((e) => e.rank)).size).toBe(2);
  });

  it("respects a player explicitly given zero target minutes rather than falling back to a rank default", () => {
    const benched = player({
      position: "PG",
      overallRating: 90,
      rotationSlot: 0,
      targetMinutesPerGame: 0,
    });
    const resolved = resolveRotation([benched]);
    expect(resolved[0].targetMinutes).toBe(0);
  });
});
