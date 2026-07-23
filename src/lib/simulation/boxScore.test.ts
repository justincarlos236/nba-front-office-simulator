import { describe, expect, it } from "vitest";
import { allocateMinutes, generateBoxScore, type GameRosters } from "./boxScore";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { Position } from "@/generated/prisma/client";

// Matches simulateGame.ts's own AVERAGE_TEAM_SCORE, so reconciliation
// targets a realistic team total rather than an arbitrary one.
const AVERAGE_TEAM_SCORE_APPROX = 112;

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeRoster(
  overrides: Partial<RosterPlayerForSimulation> & { position: Position; overallRating: number },
  id: string,
): RosterPlayerForSimulation {
  return {
    leaguePlayerId: id,
    fullName: id,
    realStat: null,
    ...overrides,
  };
}

/** A believable 13-man roster: 5 starters (one per position), 8 bench, mix of real/fictional. */
function fullRoster(prefix: string): RosterPlayerForSimulation[] {
  const positions: Position[] = ["PG", "SG", "SF", "PF", "C"];
  const roster: RosterPlayerForSimulation[] = [];
  positions.forEach((position, i) => {
    roster.push(
      makeRoster({ position, overallRating: 88 - i * 2 }, `${prefix}-starter-${position}`),
    );
  });
  for (let i = 0; i < 8; i++) {
    roster.push(
      makeRoster(
        { position: positions[i % positions.length], overallRating: 70 - i * 2 },
        `${prefix}-bench-${i}`,
      ),
    );
  }
  return roster;
}

function realStatBaseline() {
  return {
    minutesPerGame: 34,
    pointsPerGame: 25,
    reboundsPerGame: 6,
    assistsPerGame: 5,
    stealsPerGame: 1.2,
    blocksPerGame: 0.5,
    turnoversPerGame: 3,
    fgPct: 0.48,
    fg3Pct: 0.37,
    ftPct: 0.85,
    trueShootingPct: 0.6,
  };
}

describe("allocateMinutes", () => {
  it("allocates exactly 240 team-minutes", () => {
    const roster = fullRoster("home");
    const minutes = allocateMinutes(roster, 8, () => 0.5);
    const total = [...minutes.values()].reduce((sum, m) => sum + m, 0);
    expect(total).toBe(240);
  });

  it("never allocates more than 40 minutes to any player", () => {
    const roster = fullRoster("home");
    for (let i = 0; i < 20; i++) {
      const minutes = allocateMinutes(roster, 5, Math.random);
      for (const m of minutes.values()) {
        expect(m).toBeLessThanOrEqual(40);
        expect(m).toBeGreaterThan(0);
      }
    }
  });

  it("gives starters more minutes than deep bench on average", () => {
    const roster = fullRoster("home");
    const minutes = allocateMinutes(roster, 8, () => 0.5);
    const starterMinutes = minutes.get("home-starter-PG") ?? 0;
    const deepBenchMinutes = minutes.get("home-bench-7") ?? 0;
    expect(starterMinutes).toBeGreaterThan(deepBenchMinutes);
  });

  it("shifts minutes from starters to bench in a blowout", () => {
    const roster = fullRoster("home");
    const closeGame = allocateMinutes(roster, 3, () => 0.5);
    const blowout = allocateMinutes(roster, 35, () => 0.5);
    expect(blowout.get("home-starter-PG") ?? 0).toBeLessThan(closeGame.get("home-starter-PG") ?? 0);
  });

  it("returns an empty map for an empty roster", () => {
    expect(allocateMinutes([], 10, Math.random).size).toBe(0);
  });

  it("a high benchTrustDelta coach plays the bench deeper than a low/negative one", () => {
    const roster = fullRoster("home");
    let trustedRosterSize = 0;
    let shortLeashRosterSize = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      trustedRosterSize += allocateMinutes(roster, 8, Math.random, {
        benchTrustDelta: 1,
        threePaMultiplier: 1,
      }).size;
      shortLeashRosterSize += allocateMinutes(roster, 8, Math.random, {
        benchTrustDelta: -1,
        threePaMultiplier: 1,
      }).size;
    }
    expect(trustedRosterSize / trials).toBeGreaterThan(shortLeashRosterSize / trials);
  });

  it("guides minutes toward a custom targetMinutesPerGame rather than the rank-based default", () => {
    // A deep bench player (would normally get very few minutes) is
    // promoted into the starting slot with a real assigned target -
    // Rotation Management should push their actual minutes up near that
    // target, still varying naturally, rather than the old rank-based
    // curve winning out.
    const roster = fullRoster("home").map((p) =>
      p.leaguePlayerId === "home-bench-7" ? { ...p, rotationSlot: 0, targetMinutesPerGame: 34 } : p,
    );
    const samples = Array.from({ length: 30 }, () => allocateMinutes(roster, 6, Math.random));
    const promotedMinutes = samples.map((m) => m.get("home-bench-7") ?? 0);
    const average = promotedMinutes.reduce((sum, m) => sum + m, 0) / promotedMinutes.length;

    expect(average).toBeGreaterThan(25); // clearly elevated from a deep-bench default (~a few minutes)
    expect(new Set(promotedMinutes).size).toBeGreaterThan(1); // still varies game to game, not pinned exactly
  });

  it("still allocates exactly 240 team-minutes with a custom rotation in play", () => {
    const roster = fullRoster("home").map((p, i) => ({
      ...p,
      rotationSlot: i,
      targetMinutesPerGame: i === 0 ? 36 : undefined,
    }));
    const minutes = allocateMinutes(roster, 8, () => 0.5);
    const total = [...minutes.values()].reduce((sum, m) => sum + m, 0);
    expect(total).toBe(240);
  });
});

describe("generateBoxScore", () => {
  function rosters(): GameRosters {
    return {
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      homeRoster: fullRoster("home"),
      awayRoster: fullRoster("away"),
      homeStrength: 80,
      awayStrength: 75,
    };
  }

  it("is deterministic for a given rng sequence", () => {
    const values = Array.from({ length: 500 }, (_, i) => (i % 97) / 97);
    const a = generateBoxScore(rosters(), 112, 104, fixedRng(values));
    const b = generateBoxScore(rosters(), 112, 104, fixedRng(values));
    expect(a).toEqual(b);
  });

  it("reconciles home and away points to the exact team score", () => {
    for (let trial = 0; trial < 20; trial++) {
      const lines = generateBoxScore(rosters(), 118, 101, Math.random);
      const homePoints = lines
        .filter((l) => l.leagueTeamId === "home-team")
        .reduce((sum, l) => sum + l.points, 0);
      const awayPoints = lines
        .filter((l) => l.leagueTeamId === "away-team")
        .reduce((sum, l) => sum + l.points, 0);
      expect(homePoints).toBe(118);
      expect(awayPoints).toBe(101);
    }
  });

  it("never produces negative or impossible stat lines", () => {
    for (let trial = 0; trial < 20; trial++) {
      const lines = generateBoxScore(rosters(), 130, 95, Math.random);
      for (const line of lines) {
        expect(line.minutesPlayed).toBeGreaterThan(0);
        expect(line.points).toBeGreaterThanOrEqual(0);
        expect(line.rebounds).toBeGreaterThanOrEqual(0);
        expect(line.assists).toBeGreaterThanOrEqual(0);
        expect(line.steals).toBeGreaterThanOrEqual(0);
        expect(line.blocks).toBeGreaterThanOrEqual(0);
        expect(line.turnovers).toBeGreaterThanOrEqual(0);
        expect(line.fgMade).toBeGreaterThanOrEqual(0);
        expect(line.fgMade).toBeLessThanOrEqual(line.fgAttempted);
        expect(line.fg3Made).toBeLessThanOrEqual(line.fg3Attempted);
        expect(line.fg3Attempted).toBeLessThanOrEqual(line.fgAttempted);
        expect(line.ftMade).toBeLessThanOrEqual(line.ftAttempted);
      }
    }
  });

  it("keeps team rebounds/assists within a believable NBA range", () => {
    // The band guardrail is a proportional rescale-and-round, not an exact
    // clamp (unlike points, which reconcile exactly) - independent
    // per-player rounding can land the summed total a point or two past the
    // edge, so the tolerance here is intentionally a little wider than the
    // nominal band itself.
    const ROUNDING_SLACK = 3;
    for (let trial = 0; trial < 20; trial++) {
      const lines = generateBoxScore(rosters(), 112, 108, Math.random);
      for (const teamId of ["home-team", "away-team"]) {
        const teamLines = lines.filter((l) => l.leagueTeamId === teamId);
        const totalRebounds = teamLines.reduce((sum, l) => sum + l.rebounds, 0);
        const totalAssists = teamLines.reduce((sum, l) => sum + l.assists, 0);
        expect(totalRebounds).toBeGreaterThanOrEqual(28 - ROUNDING_SLACK);
        expect(totalRebounds).toBeLessThanOrEqual(58 + ROUNDING_SLACK);
        expect(totalAssists).toBeGreaterThanOrEqual(8 - ROUNDING_SLACK);
        expect(totalAssists).toBeLessThanOrEqual(38 + ROUNDING_SLACK);
      }
    }
  });

  it("never generates a row for a player who wasn't allocated minutes", () => {
    const lines = generateBoxScore(rosters(), 112, 108, Math.random);
    // 5 starters + up to 7 real-rotation bench players per team, capped
    // well under the full 13-man roster (deep bench regularly DNPs).
    const homeLines = lines.filter((l) => l.leagueTeamId === "home-team");
    expect(homeLines.length).toBeLessThanOrEqual(12);
    expect(homeLines.length).toBeGreaterThanOrEqual(5);
  });

  it("a high-rated player's season-long average stays believable and clearly outpaces deep bench", () => {
    // Team totals are fixed externally (simulateGame's job, not this
    // engine's) and every player's points reconcile to that fixed total -
    // so a star's realized ppg is inherently a share of the team score, not
    // an independent readout of their own prior in isolation. What this
    // engine actually owes is: no gross mean drift over a season (no wild
    // outlier average), and a clear, consistent gap between a star and deep
    // bench - not an exact reproduction of a hand-picked input number.
    const star: RosterPlayerForSimulation = {
      leaguePlayerId: "star",
      fullName: "star",
      position: "SF",
      overallRating: 90,
      realStat: realStatBaseline(),
    };
    const homeRoster = [star, ...fullRoster("bench")];
    const opponent = fullRoster("opp");

    let starPoints = 0;
    let benchPoints = 0;
    let games = 0;
    for (let i = 0; i < 82; i++) {
      const lines = generateBoxScore(
        {
          homeTeamId: "home-team",
          awayTeamId: "away-team",
          homeRoster,
          awayRoster: opponent,
          homeStrength: 85,
          awayStrength: 78,
        },
        AVERAGE_TEAM_SCORE_APPROX,
        AVERAGE_TEAM_SCORE_APPROX - 8,
        Math.random,
      );
      const starLine = lines.find((l) => l.leaguePlayerId === "star");
      // A moderate bench player (not the deepest scratch-prone slot), so it
      // reliably gets minutes most nights rather than mostly DNPs.
      const benchLine = lines.find((l) => l.leaguePlayerId === "bench-bench-2");
      if (starLine) {
        starPoints += starLine.points;
        games++;
      }
      if (benchLine) benchPoints += benchLine.points;
    }

    const starPpg = starPoints / games;
    const benchPpg = benchPoints / games;
    expect(starPpg).toBeGreaterThan(15);
    expect(starPpg).toBeLessThan(38);
    expect(starPpg).toBeGreaterThan(benchPpg * 1.5);
  });

  it("a higher threePaMultiplier coach shifts the team's shot selection toward threes", () => {
    let paceAndSpaceThreeShare = 0;
    let grindItOutThreeShare = 0;
    const trials = 15;
    for (let i = 0; i < trials; i++) {
      const paceRosters: GameRosters = {
        homeTeamId: "home-team",
        awayTeamId: "away-team",
        homeRoster: fullRoster("home"),
        awayRoster: fullRoster("away"),
        homeStrength: 80,
        awayStrength: 78,
        homeCoachModifier: { benchTrustDelta: 0, threePaMultiplier: 1.3 },
      };
      const grindRosters: GameRosters = {
        ...paceRosters,
        homeCoachModifier: { benchTrustDelta: 0, threePaMultiplier: 0.7 },
      };

      const paceLines = generateBoxScore(paceRosters, 112, 108, Math.random).filter(
        (l) => l.leagueTeamId === "home-team",
      );
      const grindLines = generateBoxScore(grindRosters, 112, 108, Math.random).filter(
        (l) => l.leagueTeamId === "home-team",
      );

      const shareOf = (lines: typeof paceLines) => {
        const fga = lines.reduce((sum, l) => sum + l.fgAttempted, 0);
        const fg3a = lines.reduce((sum, l) => sum + l.fg3Attempted, 0);
        return fga > 0 ? fg3a / fga : 0;
      };
      paceAndSpaceThreeShare += shareOf(paceLines);
      grindItOutThreeShare += shareOf(grindLines);
    }

    expect(paceAndSpaceThreeShare / trials).toBeGreaterThan(grindItOutThreeShare / trials);
  });
});
