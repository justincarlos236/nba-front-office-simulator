import { describe, expect, it } from "vitest";
import {
  developPlayerRating,
  developmentTraitFromId,
  effectiveCeiling,
} from "./developPlayerRating";

function fixedRng(value: number): () => number {
  return () => value;
}

describe("developPlayerRating", () => {
  it("grows a young player with room to grow, never past their potential", () => {
    const result = developPlayerRating({
      overallRating: 70,
      potentialRating: 85,
      age: 22,
      rng: fixedRng(0.99),
    });
    expect(result).toBeGreaterThan(70);
    expect(result).toBeLessThanOrEqual(85);
  });

  it("never grows a young player past their potential even with max luck", () => {
    const result = developPlayerRating({
      overallRating: 84,
      potentialRating: 85,
      age: 20,
      rng: fixedRng(0.99),
    });
    expect(result).toBeLessThanOrEqual(85);
  });

  it("does not grow a young player already at their potential", () => {
    const result = developPlayerRating({
      overallRating: 85,
      potentialRating: 85,
      age: 22,
      rng: fixedRng(0.5),
    });
    // Falls through to prime-drift behavior instead of growth.
    expect(result).toBeGreaterThanOrEqual(84);
    expect(result).toBeLessThanOrEqual(86);
  });

  it("keeps prime-age players roughly flat", () => {
    const result = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 28,
      rng: fixedRng(0.5),
    });
    expect(result).toBeGreaterThanOrEqual(79);
    expect(result).toBeLessThanOrEqual(81);
  });

  it("declines an older player's rating", () => {
    const result = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 34,
      rng: fixedRng(0.5),
    });
    expect(result).toBeLessThan(80);
  });

  it("declines faster the further past 30 a player is", () => {
    const rng = fixedRng(0.5);
    const at31 = developPlayerRating({ overallRating: 80, potentialRating: 80, age: 31, rng });
    const at38 = developPlayerRating({ overallRating: 80, potentialRating: 80, age: 38, rng });
    expect(80 - at38).toBeGreaterThan(80 - at31);
  });

  it("never produces a rating below the floor or above the ceiling", () => {
    const low = developPlayerRating({
      overallRating: 26,
      potentialRating: 26,
      age: 40,
      rng: fixedRng(0.99),
    });
    expect(low).toBeGreaterThanOrEqual(25);

    const high = developPlayerRating({
      overallRating: 98,
      potentialRating: 99,
      age: 22,
      rng: fixedRng(0.99),
    });
    expect(high).toBeLessThanOrEqual(99);
  });

  it("is deterministic for a fixed rng", () => {
    const input = { overallRating: 75, potentialRating: 82, age: 24, rng: fixedRng(0.3) };
    expect(developPlayerRating(input)).toBe(developPlayerRating(input));
  });

  it("a high-quality Player Development Coach boosts young-player growth", () => {
    const base = () =>
      developPlayerRating({ overallRating: 65, potentialRating: 90, age: 21, rng: fixedRng(0.1) });
    const coached = () =>
      developPlayerRating({
        overallRating: 65,
        potentialRating: 90,
        age: 21,
        rng: fixedRng(0.1),
        developmentCoachQuality: 99,
      });
    expect(coached()).toBeGreaterThanOrEqual(base());
  });

  it("an unspecified (neutral) coach quality behaves identically to today's curve", () => {
    const input = { overallRating: 70, potentialRating: 88, age: 22, rng: fixedRng(0.4) };
    expect(developPlayerRating(input)).toBe(
      developPlayerRating({ ...input, developmentCoachQuality: 72 }),
    );
  });

  it("a well-funded Player Development department boosts young-player growth vs. a starved one", () => {
    const withInvestment = { overallRating: 65, potentialRating: 90, age: 21, rng: fixedRng(0.1) };
    const maximum = developPlayerRating({ ...withInvestment, playerDevelopmentDelta: 14 });
    const minimal = developPlayerRating({ ...withInvestment, playerDevelopmentDelta: -10 });
    expect(maximum).toBeGreaterThanOrEqual(minimal);
  });

  it("an unspecified or zero Player Development delta behaves identically to today's curve", () => {
    const input = { overallRating: 70, potentialRating: 88, age: 22, rng: fixedRng(0.4) };
    expect(developPlayerRating(input)).toBe(
      developPlayerRating({ ...input, playerDevelopmentDelta: 0 }),
    );
  });

  it("a high-quality coach dampens an aging player's decline", () => {
    const uncoached = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 35,
      rng: fixedRng(0.5),
    });
    const coached = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 35,
      rng: fixedRng(0.5),
      developmentCoachQuality: 99,
    });
    expect(coached).toBeGreaterThanOrEqual(uncoached);
  });

  it("an unspecified minutesPerGame behaves identically to before Rotation Management existed", () => {
    const input = { overallRating: 70, potentialRating: 88, age: 22, rng: fixedRng(0.4) };
    expect(developPlayerRating(input)).toBe(
      developPlayerRating({ ...input, minutesPerGame: undefined }),
    );
  });

  it("a young player who actually played heavy minutes grows faster than one who barely played", () => {
    const base = { overallRating: 65, potentialRating: 90, age: 21, rng: fixedRng(0.1) };
    const heavyMinutes = developPlayerRating({ ...base, minutesPerGame: 34 });
    const barelyPlayed = developPlayerRating({ ...base, minutesPerGame: 4 });
    expect(heavyMinutes).toBeGreaterThanOrEqual(barelyPlayed);
  });

  it("heavy real playing time dampens an aging player's decline", () => {
    const base = { overallRating: 80, potentialRating: 80, age: 35, rng: fixedRng(0.5) };
    const heavyMinutes = developPlayerRating({ ...base, minutesPerGame: 34 });
    const benched = developPlayerRating({ ...base, minutesPerGame: 4 });
    expect(heavyMinutes).toBeGreaterThanOrEqual(benched);
  });

  it("an unspecified morale behaves identically to before the Morale system existed", () => {
    const input = { overallRating: 70, potentialRating: 88, age: 22, rng: fixedRng(0.4) };
    expect(developPlayerRating(input)).toBe(developPlayerRating({ ...input, morale: undefined }));
  });

  it("a young happy player grows faster than an equally young miserable one", () => {
    const base = { overallRating: 65, potentialRating: 90, age: 21, rng: fixedRng(0.1) };
    const happy = developPlayerRating({ ...base, morale: 95 });
    const miserable = developPlayerRating({ ...base, morale: 5 });
    expect(happy).toBeGreaterThanOrEqual(miserable);
  });

  it("good morale dampens an aging player's decline", () => {
    const base = { overallRating: 80, potentialRating: 80, age: 35, rng: fixedRng(0.5) };
    const happy = developPlayerRating({ ...base, morale: 95 });
    const miserable = developPlayerRating({ ...base, morale: 5 });
    expect(happy).toBeGreaterThanOrEqual(miserable);
  });
});

/**
 * docs/audits/DEVELOPMENT_AUDIT.md D-P1-1: decline used to be absolute, so a 99 and a
 * 70 lost the same 1-3 points at 30 and no player could be elite past 34 -
 * while the seeded league opens with LeBron at 40, Durant and Curry at 37 and
 * Kawhi at 34.
 */
describe("decline scales with quality", () => {
  const rng = () => 0.5;

  it("takes less from an elite player than from a fringe one at the same age", () => {
    const eliteLoss =
      95 - developPlayerRating({ overallRating: 95, potentialRating: 95, age: 34, rng });
    const fringeLoss =
      70 - developPlayerRating({ overallRating: 70, potentialRating: 70, age: 34, rng });
    expect(eliteLoss).toBeLessThan(fringeLoss);
  });

  it("still declines every elite player - damping is never a reprieve", () => {
    for (const age of [31, 34, 37, 40]) {
      const after = developPlayerRating({ overallRating: 99, potentialRating: 99, age, rng });
      expect(after).toBeLessThan(99);
    }
  });

  it("lets a star still be a star in his mid-thirties", () => {
    // The property the old model made impossible: measured across a cohort
    // rather than one career, since a single unlucky run of rolls says nothing.
    const N = 300;
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const finals: number[] = [];
    for (let i = 0; i < N; i++) {
      let rating = 95;
      for (let age = 27; age < 35; age++) {
        rating = developPlayerRating({
          overallRating: rating,
          potentialRating: 95,
          age,
          rng: rand,
        });
      }
      finals.push(rating);
    }
    const mean = finals.reduce((a, b) => a + b, 0) / N;
    expect(mean).toBeGreaterThan(85);
    // And it is not merely the average surviving - real ones do too.
    expect(finals.filter((r) => r >= 90).length / N).toBeGreaterThan(0.05);
  });

  it("accelerates with age regardless of quality", () => {
    const at31 = 95 - developPlayerRating({ overallRating: 95, potentialRating: 95, age: 31, rng });
    const at39 = 95 - developPlayerRating({ overallRating: 95, potentialRating: 95, age: 39, rng });
    expect(at39).toBeGreaterThan(at31);
  });
});

/**
 * docs/audits/DEVELOPMENT_AUDIT.md D-P0-2: potential used to be a certainty, so every
 * prospect reached the number on his scouting report and the league drifted to
 * 221 players at 80+ against a real 82.
 */
describe("the scouting report is an estimate", () => {
  it("gives a worse prospect a lower real ceiling from the same report", () => {
    expect(effectiveCeiling(70, 95, 0.1)).toBeLessThan(effectiveCeiling(70, 95, 0.9));
  });

  it("never puts a player's ceiling below where he already is", () => {
    for (const trait of [0, 0.25, 0.5, 1]) {
      expect(effectiveCeiling(88, 90, trait)).toBeGreaterThanOrEqual(88);
    }
  });

  it("is stable as the player develops, rather than chasing him upward", () => {
    // Measuring the shortfall from a player's *current* rating makes the
    // ceiling recede every season - an asymptote toward full potential, which
    // is the certainty this replaces.
    const trait = 0.4;
    const early = effectiveCeiling(70, 95, trait);
    const later = effectiveCeiling(80, 95, trait);
    expect(later).toBe(Math.max(80, early));
  });

  it("is deterministic for a player, so a career replays identically", () => {
    expect(developmentTraitFromId("abc123")).toBe(developmentTraitFromId("abc123"));
    expect(developmentTraitFromId("abc123")).not.toBe(developmentTraitFromId("abc124"));
  });

  it("spreads traits across the whole range", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `player-${i}`);
    const traits = ids.map(developmentTraitFromId);
    expect(Math.min(...traits)).toBeLessThan(0.1);
    expect(Math.max(...traits)).toBeGreaterThan(0.9);
  });

  it("never develops a young player past his real ceiling", () => {
    const rng = () => 0.99;
    let rating = 70;
    for (let age = 20; age <= 26; age++) {
      rating = developPlayerRating({
        overallRating: rating,
        potentialRating: 95,
        age,
        rng,
        developmentTrait: 0.2,
      });
    }
    expect(rating).toBeLessThanOrEqual(effectiveCeiling(70, 95, 0.2));
  });
});
