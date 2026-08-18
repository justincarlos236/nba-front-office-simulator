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

  const noPointGuard: Pos[] = ["SG", "SG", "SF", "PF", "C", "SF", "SG", "SF", "PF", "C", "SF", "C"];
  const noCentre: Pos[] = ["PG", "SG", "SF", "PF", "PF", "PG", "SG", "SF", "PF", "PF", "SF", "PF"];

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
    const both: Pos[] = ["SG", "SG", "SF", "PF", "PF", "SF", "SG", "SF", "PF", "PF", "SF", "SF"];
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

/**
 * Heavy minutes must pay, but not at face value.
 *
 * The per-player ceiling was raised from 40 to 48 so a user can make the call a
 * real head coach can - ride your best player and wear the consequences. That
 * only reads as a decision if the extra range costs something. The injury model
 * prices the whole 36-to-48 jump at roughly +0.14 expected injuries a season,
 * which on its own would have made 48 close to free, so minutes above a
 * sustainable load contribute at half credit here.
 */
describe("minutes above a sustainable load", () => {
  const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C", "PG", "SG", "SF", "PF", "C"];
  const OTHERS = [34, 32, 30, 28, 22, 20, 18, 14, 12];

  /** A balanced ten-man rotation whose best player is set to `starMinutes`. */
  function withStarAt(starMinutes: number): RosterPlayerForSimulation[] {
    const minutes = [starMinutes, ...OTHERS];
    return POSITIONS.map((position, i) =>
      player({
        position,
        overallRating: 92 - i * 3,
        rotationSlot: i,
        targetMinutesPerGame: minutes[i],
      }),
    );
  }

  const at = (m: number) => computeRotationAdjustedStrength(withStarAt(m));

  it("still rewards playing the best player more", () => {
    // The discount must not invert the incentive. Leaning on a 92 ahead of a
    // 65 is correct; it is simply not free.
    expect(at(48)).toBeGreaterThan(at(36));
    expect(at(36)).toBeGreaterThan(at(30));
  });

  it("pays less for a minute above the plateau than one below it", () => {
    // The property the constant exists to create. Below 36 each minute is
    // worth full credit; above it, half. Compared per minute so the two
    // stretches are measured on the same scale.
    const belowPerMinute = (at(36) - at(30)) / 6;
    const abovePerMinute = (at(42) - at(36)) / 6;
    expect(abovePerMinute).toBeLessThan(belowPerMinute);
    expect(abovePerMinute).toBeCloseTo(belowPerMinute / 2, 2);
  });

  it("keeps a near-linear return within the sustainable range", () => {
    // No discount applies below the plateau, so equal minute steps there are
    // worth about the same - a curve that bent everywhere would be a different
    // change from the one intended. "About": strength is a weighted *average*,
    // so raising one player's minutes also raises the divisor, which bends the
    // return slightly on its own. That residual is ~2%, against the ~50% the
    // discount itself produces, so the two are not confusable.
    const stepA = (at(34) - at(30)) / 4;
    const stepB = (at(36) - at(32)) / 4;
    expect(Math.abs(stepA / stepB - 1)).toBeLessThan(0.05);
  });

  it("does not discount a rotation left on the automatic curve", () => {
    // CPU teams set no targets and must be unaffected by any of this.
    const auto = POSITIONS.map((position, i) =>
      player({ position, overallRating: 92 - i * 3, rotationSlot: i }),
    );
    const before = computeRotationAdjustedStrength(auto);
    expect(before).toBeGreaterThan(0);
    expect(computeRotationAdjustedStrength(auto)).toBe(before);
  });
});
