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

describe("stale rotation slots (P0 regression)", () => {
  function p(id: string, rating: number, slot: number | null): RosterPlayerForSimulation {
    return {
      leaguePlayerId: id,
      fullName: id,
      overallRating: rating,
      position: "SF",
      realStat: null,
      rotationSlot: slot,
      targetMinutesPerGame: null,
    };
  }

  it("places a newly acquired star even when all twelve slots are claimed", () => {
    // Every trade and signing writes rotationSlot: null. With twelve slots
    // already taken, the newcomer used to be dropped from the rotation
    // entirely - contributing nothing to team strength and never appearing in
    // a box score.
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    const resolved = resolveRotation([p("star", 95, null), ...squad]);
    expect(resolved.some((e) => e.player.leaguePlayerId === "star")).toBe(true);
    // ...and near the top, not buried at the end of the bench.
    expect(resolved.findIndex((e) => e.player.leaguePlayerId === "star")).toBe(0);
  });

  it("keeps the rotation at its maximum size after a displacement", () => {
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    const resolved = resolveRotation([p("star", 95, null), ...squad]);
    expect(resolved).toHaveLength(12);
    // The weakest man is the one who makes way.
    expect(resolved.some((e) => e.player.leaguePlayerId === "old11")).toBe(false);
  });

  it("leaves a marginally better player out rather than overriding a real choice", () => {
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    // old11 is rated 56; a 58 is not a clear enough upgrade to override intent.
    const resolved = resolveRotation([p("marginal", 58, null), ...squad]);
    expect(resolved.some((e) => e.player.leaguePlayerId === "marginal")).toBe(false);
  });

  it("promotes by quality when a slot is vacated, not by slot number", () => {
    // An injured player is filtered out before the rotation resolves, leaving
    // their slot open. Filling open slots in ascending order handed a vacated
    // slot 0 to whoever was next in the bench queue - putting the thirteenth
    // best player on starter minutes when the starter went down.
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    const bench = p("bench12", 52, null);
    const starOut = squad.slice(1); // old0 (the 78) is hurt

    const resolved = resolveRotation([bench, ...starOut]);
    // The next-best man leads the rotation - not the call-up, who used to
    // inherit the vacated slot 0 and its starter minutes.
    expect(resolved[0].player.leaguePlayerId).toBe("old1");
    // The call-up settles near the back. Not necessarily last: he only slides
    // past players he is clearly worse than, and old11 (56) is within the
    // margin of him (52).
    const benchRank = resolved.findIndex((e) => e.player.leaguePlayerId === "bench12");
    expect(benchRank).toBeGreaterThan(8);
  });

  it("orders the rotation from best to worst once call-ups are involved", () => {
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    const resolved = resolveRotation([p("star", 95, null), ...squad.slice(2)]);
    const ratings = resolved.map((e) => e.player.overallRating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  it("assigns contiguous ranks from 0 after displacement", () => {
    const squad = Array.from({ length: 12 }, (_, i) => p(`old${i}`, 78 - i * 2, i));
    const resolved = resolveRotation([p("star", 95, null), ...squad]);
    expect(resolved.map((e) => e.rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
