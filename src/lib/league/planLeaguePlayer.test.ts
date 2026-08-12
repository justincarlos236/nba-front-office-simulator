import { describe, expect, it } from "vitest";
import { planLeaguePlayer } from "./planLeaguePlayer";

const STAR_STATS = {
  pointsPerGame: 27,
  reboundsPerGame: 8,
  assistsPerGame: 6,
  stealsPerGame: 1.3,
  blocksPerGame: 0.7,
  turnoversPerGame: 3,
  minutesPerGame: 35,
  trueShootingPct: 0.6,
};

describe("planLeaguePlayer", () => {
  it("produces a consistent rating/contract bundle for a young star", () => {
    const plan = planLeaguePlayer({
      season: 2025,
      age: 23,
      yearsOfExperience: 3,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-abc",
    });

    expect(plan.overallRating).toBeGreaterThan(70);
    expect(plan.potentialRating).toBeGreaterThanOrEqual(plan.overallRating);
    expect(plan.contract.years.length).toBeGreaterThan(0);
    expect(plan.contract.years[0].salaryCents).toBeGreaterThan(0n);
  });

  it("gives a young star a below-market rookie-scale contract", () => {
    const plan = planLeaguePlayer({
      season: 2025,
      age: 22,
      yearsOfExperience: 2,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-abc",
    });
    const veteranPlan = planLeaguePlayer({
      season: 2025,
      age: 22,
      yearsOfExperience: 8,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-abc",
    });

    expect(Number(plan.contract.years[0].salaryCents)).toBeLessThan(
      Number(veteranPlan.contract.years[0].salaryCents),
    );
  });

  it("is deterministic for the same seed and inputs", () => {
    const a = planLeaguePlayer({
      season: 2025,
      age: 28,
      yearsOfExperience: 6,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-xyz",
    });
    const b = planLeaguePlayer({
      season: 2025,
      age: 28,
      yearsOfExperience: 6,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-xyz",
    });
    expect(a).toEqual(b);
  });

  /**
   * The rating shown and the rating paid must be the same number. They used to
   * be resolved in two places - the seed rating in the caller, the contract
   * price off `computePerformanceScore` here - so a player could be displayed
   * as a 79 and paid like an 88. See docs/CONTRACT_AUDIT.md, C-P0-4.
   */
  it("prices the contract off the seed rating when the dataset carries one", () => {
    const scouted = planLeaguePlayer({
      season: 2025,
      age: 27,
      yearsOfExperience: 5,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: 70,
      seedPotentialRating: 70,
      seededContract: null,
      seed: "player-abc",
    });
    const unscouted = planLeaguePlayer({
      season: 2025,
      age: 27,
      yearsOfExperience: 5,
      stats: STAR_STATS,
      gamesPlayed: 74,
      seedOverallRating: null,
      seedPotentialRating: null,
      seededContract: null,
      seed: "player-abc",
    });

    expect(scouted.overallRating).toBe(70);
    expect(Number(scouted.contract.years[0].salaryCents)).toBeLessThan(
      Number(unscouted.contract.years[0].salaryCents),
    );
  });

  /**
   * C-P0-2: an eleven-game hot streak and a full season used to be identical
   * evidence, which put a 15-game Ty Jerome on the third-highest salary in the
   * league.
   */
  it("trusts a full season more than a handful of games", () => {
    const base = {
      season: 2025,
      age: 27,
      yearsOfExperience: 5,
      stats: STAR_STATS,
      seedOverallRating: 70,
      seedPotentialRating: 70,
      seededContract: null,
      seed: "player-abc",
    };
    const fullSeason = planLeaguePlayer({ ...base, gamesPlayed: 74 });
    const smallSample = planLeaguePlayer({ ...base, gamesPlayed: 11 });

    // Star production against a modest scouting rating: the more games behind
    // it, the more the production is allowed to move the price.
    expect(Number(smallSample.contract.years[0].salaryCents)).toBeLessThan(
      Number(fullSeason.contract.years[0].salaryCents),
    );
  });
});

/**
 * Seeding real contracts is what makes year one look like the real league
 * rather than like the valuation model's opinion of it. See
 * docs/CONTRACT_AUDIT.md - a real backup centre was starting on $29M because
 * the model rated him a top-50 veteran.
 */
describe("planLeaguePlayer - seeded real contracts", () => {
  const base = {
    season: 2025,
    age: 27,
    yearsOfExperience: 5,
    stats: STAR_STATS,
    gamesPlayed: 74,
    seedOverallRating: 88,
    seedPotentialRating: 88,
    seed: "player-abc",
  };

  it("uses a real contract verbatim rather than pricing the player", () => {
    const plan = planLeaguePlayer({
      ...base,
      seededContract: {
        years: [
          { season: 2025, salaryCents: 260_000_00 },
          { season: 2026, salaryCents: 273_000_00 },
        ],
      },
    });
    expect(plan.contract.years.map((y) => Number(y.salaryCents))).toEqual([260_000_00, 273_000_00]);
    expect(plan.contract.startSeason).toBe(2025);
    expect(plan.contract.endSeason).toBe(2026);
  });

  it("does not let the valuation model move a real salary", () => {
    // An 88-rated star would be generated far above a real minimum deal; the
    // whole point is that the real number wins.
    const seeded = planLeaguePlayer({
      ...base,
      seededContract: { years: [{ season: 2025, salaryCents: 260_000_00 }] },
    });
    const generated = planLeaguePlayer({ ...base, seededContract: null });
    expect(Number(seeded.contract.years[0].salaryCents)).toBe(260_000_00);
    expect(Number(generated.contract.years[0].salaryCents)).toBeGreaterThan(260_000_00);
  });

  it("still sets the rating from the seed, independent of the contract", () => {
    const plan = planLeaguePlayer({
      ...base,
      seededContract: { years: [{ season: 2025, salaryCents: 260_000_00 }] },
    });
    expect(plan.overallRating).toBe(88);
  });

  it("generates when the real deal does not cover the seeding season", () => {
    // Expired before the league starts - he is really a free agent, and
    // seeding it would put salary on a roster spot nobody pays for.
    const plan = planLeaguePlayer({
      ...base,
      seededContract: { years: [{ season: 2024, salaryCents: 260_000_00 }] },
    });
    expect(Number(plan.contract.years[0].salaryCents)).toBeGreaterThan(260_000_00);
    expect(plan.contract.startSeason).toBe(2025);
  });

  it("generates when the contract is empty or missing", () => {
    expect(
      planLeaguePlayer({ ...base, seededContract: { years: [] } }).contract.years.length,
    ).toBeGreaterThan(0);
    expect(
      planLeaguePlayer({ ...base, seededContract: null }).contract.years.length,
    ).toBeGreaterThan(0);
  });

  it("guarantees every seeded year, so cap sheets read one rule", () => {
    const plan = planLeaguePlayer({
      ...base,
      seededContract: {
        years: [
          { season: 2025, salaryCents: 260_000_00 },
          { season: 2026, salaryCents: 273_000_00 },
        ],
      },
    });
    for (const y of plan.contract.years) expect(y.guaranteedCents).toBe(y.salaryCents);
  });
});
