import { describe, expect, it } from "vitest";
import { computeRotationAdjustedStrength } from "./rotationStrength";
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
  it("rates every team on one curve, whether or not a rotation was ever saved", () => {
    // REGRESSION: this used to delegate to computeTeamStrength when nobody had
    // a slot, so CPU teams (which never set one) were permanently on a
    // different model from any user who opened the Rotation screen - worth
    // ~+2.4 strength for opening a page. The two models must not diverge.
    const ratings = Array.from({ length: 13 }, (_, i) => 90 - i);
    const untouched = Array.from({ length: 13 }, (_, i) =>
      player({ position: "PG", overallRating: ratings[i] }),
    );
    // The same roster with the same depth order stated explicitly.
    const slotted = untouched.map((p, i) => ({
      ...p,
      rotationSlot: i < 12 ? i : null,
    }));
    expect(computeRotationAdjustedStrength(slotted)).toBeCloseTo(
      computeRotationAdjustedStrength(untouched),
      6,
    );
  });

  it("counts a newly acquired star even when twelve slots are already claimed", () => {
    // REGRESSION (P0): every trade and signing writes rotationSlot: null, and
    // a full slot list left the newcomer out of the rotation entirely - so
    // trading for the best player in the league moved strength by exactly 0.00
    // and he never appeared in a box score.
    const squad = Array.from({ length: 13 }, (_, i) =>
      player({ position: "SF", overallRating: 78 - i * 2, rotationSlot: i < 12 ? i : null }),
    );
    const before = computeRotationAdjustedStrength(squad);
    const after = computeRotationAdjustedStrength([
      player({ position: "PG", overallRating: 95 }),
      ...squad,
    ]);
    expect(after).toBeGreaterThan(before);
  });

  it("does not let a marginal player displace one the user deliberately chose", () => {
    // Starting a favoured role player is a legitimate choice; only a clearly
    // better player takes their spot.
    const chosen = player({ position: "C", overallRating: 60, rotationSlot: 0 });
    const rest = Array.from({ length: 11 }, (_, i) =>
      player({ position: "SF", overallRating: 80 - i, rotationSlot: i + 1 }),
    );
    const marginal = player({ position: "SF", overallRating: 62 });
    const resolved = computeRotationAdjustedStrength([chosen, ...rest, marginal]);
    const withoutMarginal = computeRotationAdjustedStrength([chosen, ...rest]);
    expect(resolved).toBe(withoutMarginal);
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

describe("positional balance", () => {
  const ratings = [93, 85, 82, 79, 76, 74, 72, 70, 68, 66, 64, 62];
  const mins = [36, 34, 32, 30, 28, 24, 20, 16, 10, 6, 2, 2];
  type Pos = "PG" | "SG" | "SF" | "PF" | "C";

  const strength = (positions: Pos[]) =>
    computeRotationAdjustedStrength(
      ratings.map((overallRating, i) => ({
        leaguePlayerId: `p${i}`,
        overallRating,
        position: positions[i],
        rotationSlot: i,
        targetMinutesPerGame: mins[i],
        injuryStatus: "HEALTHY" as const,
      })) as never,
    );

  const balanced: Pos[] = ["PG", "SG", "SF", "PF", "C", "PG", "SG", "SF", "PF", "C", "SF", "C"];
  const bigHeavy: Pos[] = ["C", "PF", "SF", "SG", "PG", "C", "PF", "SF", "SG", "PG", "SF", "C"];
  const allGuards: Pos[] = Array(12).fill("PG");
  const allCentres: Pos[] = Array(12).fill("C");

  const noPointGuard: Pos[] = ["SG","SG","SF","PF","C","SF","SG","SF","PF","C","SF","C"];
  const noCentre: Pos[] = ["PG","SG","SF","PF","PF","PG","SG","SF","PF","PF","SF","PF"];

  it("charges a rotation with nobody to create off the dribble", () => {
    // Wings can run some point, so this is a real cost rather than the full
    // penalty - but it is no longer free, which it was when PG sat inside a
    // single broad perimeter group.
    expect(strength(balanced) - strength(noPointGuard)).toBeGreaterThan(1);
  });

  it("charges a rotation with nobody to protect the rim", () => {
    expect(strength(balanced) - strength(noCentre)).toBeGreaterThan(1);
  });

  it("charges more for missing both than for missing either alone", () => {
    const both: Pos[] = ["SG","SG","SF","PF","PF","SF","SG","SF","PF","PF","SF","SF"];
    expect(strength(balanced) - strength(both)).toBeGreaterThan(
      strength(balanced) - strength(noPointGuard),
    );
    expect(strength(balanced) - strength(both)).toBeGreaterThan(
      strength(balanced) - strength(noCentre),
    );
  });

  it("charges a rotation with no frontcourt at all", () => {
    expect(strength(balanced) - strength(allGuards)).toBeGreaterThan(5);
  });

  it("charges a rotation that cannot handle the ball just the same", () => {
    expect(strength(balanced) - strength(allCentres)).toBeGreaterThan(5);
  });

  it("leaves an ordinary balanced rotation alone", () => {
    // Floors, not targets. A rotation whose bigs sit lower in the order is
    // still a real rotation and must not be taxed for it.
    expect(strength(balanced)).toBeCloseTo(79.27, 1);
  });

  it("leaves a big-heavy rotation alone too", () => {
    expect(strength(bigHeavy)).toBeCloseTo(strength(balanced), 5);
  });

  it("never rates a broken shape above a balanced one", () => {
    for (const shape of [allGuards, allCentres]) {
      expect(strength(shape)).toBeLessThan(strength(balanced));
    }
  });
});
