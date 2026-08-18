import { describe, expect, it } from "vitest";
import { simulateGame, computeHomeWinProbability } from "./simulateGame";

/**
 * Statistical safeguards for the game model.
 *
 * The simulation audit (docs/audits/SIMULATION_AUDIT.md) found that every P0 and P1
 * defect it identified passed the existing unit suite, because nothing tested
 * *emergent* behaviour - only that functions returned plausible-looking values.
 * A model can be individually correct at every call site and still produce a
 * league where the best team wins 45 games.
 *
 * These tests assert the properties that actually make the engine feel like
 * basketball. They are deliberately loose: they are regression nets against
 * the specific failures found, not a re-derivation of the tuning. Every one of
 * them fails against the pre-audit engine.
 *
 * Seeded throughout - a statistical test on `Math.random` is a flaky test, and
 * the suite already has that problem elsewhere.
 */

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE = 12_000;

function sample(home: number, away: number, seed = 1234) {
  const rng = seeded(seed);
  const margins: number[] = [];
  const scores: number[] = [];
  let homeWins = 0;
  for (let i = 0; i < SAMPLE; i += 1) {
    const r = simulateGame(home, away, rng);
    margins.push(Math.abs(r.homeScore - r.awayScore));
    scores.push(r.homeScore, r.awayScore);
    if (r.homeWon) homeWins += 1;
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Computed once, not once per element - recomputing the mean inside the
  // variance map is O(n^2) and dominated the whole suite's runtime.
  const avgScore = mean(scores);
  const scoreSd = Math.sqrt(mean(scores.map((v) => (v - avgScore) ** 2)));
  return {
    homeWinRate: homeWins / SAMPLE,
    avgMargin: mean(margins),
    margins,
    avgScore,
    scoreSd,
    band: (lo: number, hi: number) =>
      margins.filter((m) => m >= lo && m <= hi).length / margins.length,
  };
}

describe("margin responds to team quality (P1-5 regression)", () => {
  it("widens as the mismatch grows", () => {
    // The pre-audit engine returned 12.49 for all three of these, because the
    // margin was drawn from a bounded uniform that never saw team strength.
    const even = sample(72, 72).avgMargin;
    const mismatch = sample(80, 72).avgMargin;
    const blowout = sample(88, 72).avgMargin;
    expect(mismatch).toBeGreaterThan(even + 3);
    expect(blowout).toBeGreaterThan(mismatch + 3);
  });

  it("keeps the stated win probability consistent with simulated results", () => {
    // Win probability and margin now come from one distribution, so they
    // cannot disagree. Tolerance covers sampling noise at this sample size.
    for (const [h, a] of [
      [72, 72],
      [78, 72],
      [72, 78],
      [85, 72],
    ]) {
      const s = sample(h, a, 99);
      expect(s.homeWinRate).toBeCloseTo(computeHomeWinProbability(h, a), 1);
    }
  });
});

describe("margin distribution covers real basketball (P1-6 regression)", () => {
  const s = sample(72, 72, 555);

  it("produces one-possession finishes", () => {
    // The pre-audit engine produced ZERO games decided by 1-2 points across
    // 246,000 simulated games: MIN_MARGIN was 3.
    expect(s.band(1, 2)).toBeGreaterThan(0.04);
  });

  it("produces genuine blowouts", () => {
    // Likewise zero above 22, because MAX_MARGIN was 22.
    expect(s.band(26, 999)).toBeGreaterThan(0.05);
    expect(Math.max(...s.margins)).toBeGreaterThan(30);
  });

  it("still puts most games in a normal competitive range", () => {
    // Blowouts must stay the exception, not the rule.
    expect(s.band(1, 20)).toBeGreaterThan(0.7);
  });
});

describe("scoring is NBA-shaped", () => {
  const s = sample(72, 72, 777);

  it("averages a realistic team score", () => {
    expect(s.avgScore).toBeGreaterThan(108);
    expect(s.avgScore).toBeLessThan(120);
  });

  it("varies as much as real box scores do", () => {
    // Pre-audit this was 9.7 against a real 12-13, because the loser's score
    // was a narrow uniform and the winner was loser + a capped margin.
    expect(s.scoreSd).toBeGreaterThan(10);
    expect(s.scoreSd).toBeLessThan(15);
  });

  it("never produces an impossible score", () => {
    // Counted rather than asserted per iteration - an expect() inside a tight
    // loop dominates the runtime of the whole suite.
    const rng = seeded(4242);
    let tooLow = 0;
    let tied = 0;
    let winnerMismatch = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const r = simulateGame(95, 55, rng);
      if (r.homeScore <= 50 || r.awayScore <= 50) tooLow += 1;
      if (r.homeScore === r.awayScore) tied += 1;
      if (r.homeWon !== r.homeScore > r.awayScore) winnerMismatch += 1;
    }
    expect(tooLow).toBe(0);
    // Basketball has no ties.
    expect(tied).toBe(0);
    // The reported winner must match the scoreline.
    expect(winnerMismatch).toBe(0);
  });
});

describe("home-court advantage is real but modest", () => {
  it("lands in the NBA's own band at equal strength", () => {
    // Real NBA home teams win 54-58%. Worth checking explicitly: the margin
    // rework briefly pushed this to 67% because the advantage was still
    // expressed in the old model's units.
    const rate = sample(72, 72, 2468).homeWinRate;
    expect(rate).toBeGreaterThan(0.52);
    expect(rate).toBeLessThan(0.6);
  });
});
