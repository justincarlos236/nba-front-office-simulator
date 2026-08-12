import { describe, expect, it } from "vitest";
import { maxIndividualSalaryCents } from "../cap/maxSalary";
import {
  demandAdjustedPriceCents,
  runCpuFreeAgentPass,
  type PursuableFreeAgent,
  type PursuingTeam,
} from "./cpuFreeAgentPass";

const MILLION = 1_000_000_00n; // cents
const SEASON = 2026;

function team(overrides: Partial<PursuingTeam> = {}): PursuingTeam {
  return {
    leagueTeamId: overrides.leagueTeamId ?? "t1",
    identity: overrides.identity ?? "PLAYOFF_TEAM",
    needs: overrides.needs ?? ["RIM_PROTECTOR"],
    personality: overrides.personality ?? "BALANCED",
    rosterSize: overrides.rosterSize ?? 10,
    capSpaceCents: overrides.capSpaceCents ?? 80n * MILLION,
    financialThresholdMultiplier: overrides.financialThresholdMultiplier ?? 1,
  };
}

function agent(overrides: Partial<PursuableFreeAgent> = {}): PursuableFreeAgent {
  return {
    leaguePlayerId: overrides.leaguePlayerId ?? "p1",
    position: overrides.position ?? "C",
    overallRating: overrides.overallRating ?? 80,
    potentialRating: overrides.potentialRating ?? 82,
    age: overrides.age ?? 26,
    careerGamesMissedToInjury: overrides.careerGamesMissedToInjury ?? 0,
    years: 2,
    estimatedValueCents: overrides.estimatedValueCents ?? 20n * MILLION,
    interestedTeamIds: overrides.interestedTeamIds ?? ["t1"],
  };
}

describe("CPU free-agent pass", () => {
  it("signs nobody when no team is interested", () => {
    // The board showed no suitors, so nothing may happen - display and
    // outcome are driven by the same interest model and must not diverge.
    const signings = runCpuFreeAgentPass([agent({ interestedTeamIds: [] })], [team()], SEASON);
    expect(signings).toHaveLength(0);
  });

  it("only lets a team that was shown as interested sign the player", () => {
    const signings = runCpuFreeAgentPass(
      [agent({ interestedTeamIds: ["t1"] })],
      [team({ leagueTeamId: "t1" }), team({ leagueTeamId: "t2" })],
      SEASON,
    );
    for (const s of signings) expect(s.leagueTeamId).toBe("t1");
  });

  it("gives a player to exactly one team", () => {
    const signings = runCpuFreeAgentPass(
      [agent({ interestedTeamIds: ["t1", "t2", "t3"] })],
      [team({ leagueTeamId: "t1" }), team({ leagueTeamId: "t2" }), team({ leagueTeamId: "t3" })],
      SEASON,
    );
    expect(signings.filter((s) => s.leaguePlayerId === "p1")).toHaveLength(1);
  });

  it("skips a team at the roster limit", () => {
    const signings = runCpuFreeAgentPass([agent()], [team({ rosterSize: 15 })], SEASON);
    expect(signings).toHaveLength(0);
  });

  it("will not let a team spend its entire cap space on one player", () => {
    // A club that empties its books on a single signing cannot fill the rest
    // of its roster; the 70% ceiling keeps one pass from draining the market
    // into one team.
    const signings = runCpuFreeAgentPass(
      [agent({ estimatedValueCents: 30n * MILLION })],
      [team({ capSpaceCents: 35n * MILLION })],
      SEASON,
    );
    expect(signings).toHaveLength(0);

    const affordable = runCpuFreeAgentPass(
      [agent({ estimatedValueCents: 30n * MILLION })],
      [team({ capSpaceCents: 60n * MILLION })],
      SEASON,
    );
    expect(affordable).toHaveLength(1);
  });

  it("spends down cap space as it signs, so one team cannot sign everyone", () => {
    const rich = team({ capSpaceCents: 90n * MILLION, rosterSize: 5 });
    const agents = Array.from({ length: 6 }, (_, i) =>
      agent({
        leaguePlayerId: `p${i}`,
        years: 2,
        estimatedValueCents: 30n * MILLION,
        interestedTeamIds: ["t1"],
      }),
    );
    const signings = runCpuFreeAgentPass(agents, [rich], SEASON);
    // $90M of room at a 70% per-signing ceiling cannot absorb six $30M deals.
    expect(signings.length).toBeLessThan(6);
    const spent = signings.reduce((sum, s) => sum + s.salaryCents, 0n);
    expect(spent).toBeLessThanOrEqual(90n * MILLION);
  });

  it("respects the roster limit across a whole pass", () => {
    const nearlyFull = team({ rosterSize: 14, capSpaceCents: 200n * MILLION });
    const agents = Array.from({ length: 5 }, (_, i) =>
      agent({ leaguePlayerId: `p${i}`, estimatedValueCents: 20n * MILLION }),
    );
    const signings = runCpuFreeAgentPass(agents, [nearlyFull], SEASON);
    expect(signings.length).toBeLessThanOrEqual(1);
  });

  it("clears the market best player first", () => {
    // A club with room for one takes the best man available, not whoever it
    // happened to consider first.
    const signings = runCpuFreeAgentPass(
      [
        agent({ leaguePlayerId: "weak", overallRating: 70 }),
        agent({ leaguePlayerId: "strong", overallRating: 88 }),
      ],
      [team({ rosterSize: 14 })],
      SEASON,
    );
    expect(signings).toHaveLength(1);
    expect(signings[0].leaguePlayerId).toBe("strong");
  });

  it("signs at the player's estimated value", () => {
    const signings = runCpuFreeAgentPass(
      [agent({ estimatedValueCents: 17n * MILLION })],
      [team()],
      SEASON,
    );
    expect(signings[0]?.salaryCents).toBe(17n * MILLION);
  });

  it("is deterministic", () => {
    // A user who read the board and chose to wait must be able to understand
    // exactly why they lost a player. Randomness would make that impossible.
    const build = () => ({
      agents: [agent({ leaguePlayerId: "p1" }), agent({ leaguePlayerId: "p2" })],
      teams: [team({ leagueTeamId: "t1" }), team({ leagueTeamId: "t2" })],
    });
    const first = (() => {
      const { agents, teams } = build();
      return runCpuFreeAgentPass(agents, teams, SEASON);
    })();
    for (let i = 0; i < 5; i += 1) {
      const { agents, teams } = build();
      expect(runCpuFreeAgentPass(agents, teams, SEASON)).toEqual(first);
    }
  });

  it("ignores an interested team id that is not in the league", () => {
    const signings = runCpuFreeAgentPass(
      [agent({ interestedTeamIds: ["ghost"] })],
      [team({ leagueTeamId: "t1" })],
      SEASON,
    );
    expect(signings).toHaveLength(0);
  });

  it("handles an empty market", () => {
    expect(runCpuFreeAgentPass([], [team()], SEASON)).toEqual([]);
    expect(runCpuFreeAgentPass([agent()], [], SEASON)).toEqual([]);
  });
});

/**
 * docs/CONTRACT_AUDIT.md C-P1-4: demand used to decide who signed a player but
 * never what he cost, so a user could outbid by a dollar and win every time.
 */
describe("demandAdjustedPriceCents", () => {
  const BASE = 20_000_000_00n;
  const SEASON = 2025;
  const PEAK_AGE = 27;

  it("charges the asking price when only one club is serious", () => {
    expect(demandAdjustedPriceCents(BASE, 1, PEAK_AGE, SEASON)).toBe(BASE);
  });

  it("raises the price as suitors pile up", () => {
    const prices = [1, 2, 3, 4].map((n) => demandAdjustedPriceCents(BASE, n, PEAK_AGE, SEASON));
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThan(prices[i - 1]);
  });

  it("caps a bidding war rather than letting clubs talk each other into anything", () => {
    const many = demandAdjustedPriceCents(BASE, 30, PEAK_AGE, SEASON);
    expect(many).toBeLessThanOrEqual((BASE * 133n) / 100n);
  });

  it("never breaks the individual maximum", () => {
    const nearMax = 50_000_000_00n;
    const bid = demandAdjustedPriceCents(nearMax, 8, 24, SEASON);
    expect(Number(bid)).toBeLessThanOrEqual(maxIndividualSalaryCents(24, SEASON));
  });

  it("treats zero suitors as no premium", () => {
    expect(demandAdjustedPriceCents(BASE, 0, PEAK_AGE, SEASON)).toBe(BASE);
  });
});
