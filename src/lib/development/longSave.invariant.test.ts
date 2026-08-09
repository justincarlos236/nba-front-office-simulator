import { describe, expect, it } from "vitest";
import { developPlayerRating } from "./developPlayerRating";
import { shouldRetire } from "./retirement";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60 } from "@/lib/draft/generateDraftClass";

/**
 * The headless multi-season harness.
 *
 * All three audits asked for this and none had built it, so every long-save
 * claim in them rested on a single six-season save. It runs the real
 * progression loop - age, develop, retire, draft, refill - over 20 seasons and
 * asserts the properties that make a long save survivable.
 *
 * It deliberately drives the *real* `developPlayerRating` and `shouldRetire`
 * rather than reimplementing them. What it approximates is only the league
 * scaffolding around them: 30 rosters, a 60-player draft, and free-agent
 * backfill. Those are simple enough to state plainly here and would otherwise
 * need a database.
 *
 * Every assertion below is a property the age defect violated. Before that fix
 * this harness would have shown population growing without bound, retirements
 * flat at zero, and the age distribution frozen at a single value.
 */

const TEAMS = 30;
const ROSTER_SIZE = 15;
const DRAFT_SIZE = 60;
const SEASONS = 20;

interface SimPlayer {
  age: number;
  overallRating: number;
  potentialRating: number;
}

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

/** A believable opening-day league: a talent pyramid across realistic ages. */
function seedLeague(rng: () => number): SimPlayer[] {
  const players: SimPlayer[] = [];
  for (let i = 0; i < TEAMS * ROSTER_SIZE; i += 1) {
    const slot = i % ROSTER_SIZE;
    const overallRating = Math.round(
      Math.max(60, Math.min(99, 84 - slot * 1.6 + (rng() - 0.5) * 6)),
    );
    players.push({
      // 19 to 38, weighted toward the middle - roughly a real league's shape.
      age: Math.round(19 + rng() * 8 + rng() * 8 + rng() * 3),
      overallRating,
      potentialRating: Math.min(99, overallRating + Math.round(rng() * 10)),
    });
  }
  return players;
}

/** One draft class, graded from pick 1 to pick 60 the way the real one is. */
function draftClass(rng: () => number): SimPlayer[] {
  return Array.from({ length: DRAFT_SIZE }, (_, pick) => {
    const t = pick / (DRAFT_SIZE - 1);
    const potentialRating = Math.round(
      POTENTIAL_AT_PICK_1 + (POTENTIAL_AT_PICK_60 - POTENTIAL_AT_PICK_1) * t,
    );
    return {
      age: 19 + Math.round(rng() * 3),
      overallRating: Math.max(60, potentialRating - 12 - Math.round(rng() * 8)),
      potentialRating,
    };
  });
}

interface SeasonReport {
  season: number;
  population: number;
  retirements: number;
  medianAge: number;
  medianRating: number;
  strengthSpread: number;
}

function runLongSave(seed: number): SeasonReport[] {
  const rng = seeded(seed);
  let pool = seedLeague(rng);
  const reports: SeasonReport[] = [];

  for (let season = 1; season <= SEASONS; season += 1) {
    const survivors: SimPlayer[] = [];
    let retirements = 0;

    for (const p of pool) {
      const age = p.age + 1;
      const overallRating = developPlayerRating({
        overallRating: p.overallRating,
        potentialRating: p.potentialRating,
        age,
        rng,
      });
      if (shouldRetire(age, overallRating, rng)) {
        retirements += 1;
        continue;
      }
      survivors.push({ age, overallRating, potentialRating: p.potentialRating });
    }

    // Everyone still playing, plus the new class. Deliberately uncapped:
    // retirement is the ONLY exit, exactly as in the real game, where a player
    // squeezed off a roster becomes a free agent and stays `isActive`. That is
    // what let the real six-season save reach 777 players, and it is the
    // property this harness exists to check.
    pool = [...survivors, ...draftClass(rng)];

    const ages = pool.map((p) => p.age).sort((a, b) => a - b);
    const ratings = pool.map((p) => p.overallRating).sort((a, b) => a - b);
    // Only the best 450 hold roster spots; the rest are the free-agent pool.
    // Rosters are snaked off the ranked list so teams are comparable.
    const rostered = [...pool]
      .sort((a, b) => b.overallRating - a.overallRating)
      .slice(0, TEAMS * ROSTER_SIZE);
    const rosters: number[][] = Array.from({ length: TEAMS }, () => []);
    rostered.forEach((p, i) => {
      const round = Math.floor(i / TEAMS);
      const slot = round % 2 === 0 ? i % TEAMS : TEAMS - 1 - (i % TEAMS);
      rosters[slot].push(p.overallRating);
    });
    const strengths = rosters.map(computeTeamStrength);

    reports.push({
      season,
      population: pool.length,
      retirements,
      medianAge: ages[Math.floor(ages.length / 2)],
      medianRating: ratings[Math.floor(ratings.length / 2)],
      strengthSpread: Math.max(...strengths) - Math.min(...strengths),
    });
  }
  return reports;
}

describe("a 20-season save stays healthy", () => {
  const runs = [1, 2, 3].map(runLongSave);

  it("retires players every single season", () => {
    // The age defect made this exactly zero, forever, by construction.
    for (const reports of runs) {
      for (const r of reports) {
        expect(r.retirements, `season ${r.season} had no retirements`).toBeGreaterThan(0);
      }
    }
  });

  it("retires a believable number rather than a cliff", () => {
    for (const reports of runs) {
      const total = reports.reduce((sum, r) => sum + r.retirements, 0);
      const perSeason = total / reports.length;
      // A 450-player league turning over somewhere between 3% and 20% a year.
      expect(perSeason).toBeGreaterThan(12);
      expect(perSeason).toBeLessThan(90);
    }
  });

  it("reaches a steady population instead of compounding", () => {
    // The real six-season save grew 537 -> 777 with zero attrition and no
    // ceiling in sight. With retirement working, intake and outflow balance:
    // traced over 25 seasons the population settles around 930-940 and stops
    // climbing. What matters is that it *converges*, not the exact level.
    for (const reports of runs) {
      const last = reports[reports.length - 1].population;
      const prev = reports[reports.length - 4].population;
      // Still moving by less than 5% over the final stretch.
      expect(Math.abs(last - prev) / last).toBeLessThan(0.05);
      // And bounded well short of runaway growth.
      expect(last).toBeLessThan(TEAMS * ROSTER_SIZE * 3);
    }
  });

  it("does not let retirements dry up once the seeded veterans are gone", () => {
    // A league that gets permanently younger would stop retiring anyone. The
    // back half is the real test - the front half still has the opening roster.
    for (const reports of runs) {
      const late = reports.slice(-8);
      const total = late.reduce((sum, r) => sum + r.retirements, 0);
      expect(total / late.length).toBeGreaterThan(15);
    }
  });

  it("keeps the age distribution realistic for two decades", () => {
    for (const reports of runs) {
      for (const r of reports) {
        expect(r.medianAge, `season ${r.season} median age`).toBeGreaterThanOrEqual(22);
        expect(r.medianAge, `season ${r.season} median age`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("does not inflate or collapse ratings over time", () => {
    for (const reports of runs) {
      const first = reports[0].medianRating;
      const last = reports[reports.length - 1].medianRating;
      // Drift of more than ten rating points across 20 seasons would mean the
      // development and draft pipelines are not in balance.
      expect(Math.abs(last - first), `median drifted ${first} -> ${last}`).toBeLessThanOrEqual(10);
    }
  });

  // NOT TESTED HERE: parity / team-strength spread.
  //
  // An earlier version asserted it and failed at 0.5 - but the harness assigns
  // rosters by snaking the ranked player pool, which balances teams by
  // construction. It measured the assignment, not the game, and read 0.46 even
  // in season 1. Testing a number this harness itself determines is worse than
  // not testing it. Parity belongs to a measurement against real saves, where
  // rosters are built by draft, trade and free agency.

  it("is deterministic for a given seed", () => {
    expect(runLongSave(7)).toEqual(runLongSave(7));
  });
});
