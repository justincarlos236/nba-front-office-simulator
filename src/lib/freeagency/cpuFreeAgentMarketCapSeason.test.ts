import { describe, expect, it } from "vitest";
import { runCpuFreeAgentMarket } from "./cpuFreeAgentMarket";

/**
 * A club's room is priced at the season it is bidding on.
 *
 * The cap sheet here is built for `newSeason`, but it used to read each
 * player's *finishing-season* salary, because the roster was loaded with
 * contract years filtered to the season that was ending. Three things followed:
 * a deal expiring that summer still counted against the new cap, a raise taking
 * effect in `newSeason` did not, and a contract starting in `newSeason` was
 * invisible. Clubs mis-read their own room in the one place it decides whether
 * they bid at all.
 *
 * Both fixtures below invert under the old code, which is what makes them worth
 * having: the expiring club looked broke and the committed club looked empty.
 */

const NEW_SEASON = 2030;
const FINISHING_SEASON = NEW_SEASON - 1;
const BIG_SALARY = 14_000_000_00n;

function rostered(i: number, years: { season: number; salaryCents: bigint }[] | null) {
  return {
    id: `p${i}`,
    leagueTeamId: "team-a",
    overallRating: 74,
    potentialRating: 74,
    careerGamesMissedToInjury: 0,
    playerId: `player-${i}`,
    player: {
      position: (["PG", "SG", "SF", "PF", "C"] as const)[i % 5],
      draftYear: NEW_SEASON - 8,
      birthDate: null,
    },
    contract: years ? { years } : null,
  };
}

/** A free agent good enough that a club with room would want him. */
const FREE_AGENT = {
  id: "fa-1",
  leagueTeamId: null,
  overallRating: 82,
  potentialRating: 84,
  careerGamesMissedToInjury: 0,
  playerId: "player-fa",
  player: { position: "SF", draftYear: NEW_SEASON - 6, birthDate: null },
  contract: null,
};

const TEAM = {
  id: "team-a",
  wins: 41,
  losses: 41,
  gmPersonality: "BALANCED",
  cashReserveCents: 50_000_000_00n,
};

function marketWith(opts: {
  yearsFor: (i: number) => { season: number; salaryCents: bigint }[] | null;
  reSignings?: { leaguePlayerId: string; offerSalaryCents: bigint }[];
}) {
  const roster = Array.from({ length: 12 }, (_, i) => rostered(i, opts.yearsFor(i)));
  const leaguePlayers = [...roster, FREE_AGENT];
  return runCpuFreeAgentMarket({
    leagueId: "L1",
    newSeason: NEW_SEASON,
    userTeamId: null,
    leaguePlayers,
    reSignings: opts.reSignings,
    playerUpdates: leaguePlayers.map((lp) => ({
      id: lp.id,
      leagueTeamId: lp.leagueTeamId,
      retiredSeason: null,
      overallRating: lp.overallRating,
    })),
    teamById: new Map([[TEAM.id, TEAM]]),
  });
}

describe("the CPU market prices room at the season it is bidding on", () => {
  it("frees up a club whose deals expire before the new season", async () => {
    // Every contract covers only the finishing season, so nothing is owed in
    // `newSeason`. The old code read those figures anyway and thought the club
    // was capped out.
    const signings = await marketWith({
      yearsFor: () => [{ season: FINISHING_SEASON, salaryCents: BIG_SALARY }],
    });
    expect(signings.length).toBeGreaterThan(0);
  });

  it("holds down a club already committed for the new season", async () => {
    // The mirror image: nothing owed in the finishing season, everything owed
    // in `newSeason`. The old code saw no finishing-season row and read the
    // club as empty.
    const signings = await marketWith({
      yearsFor: () => [{ season: NEW_SEASON, salaryCents: BIG_SALARY }],
    });
    expect(signings).toEqual([]);
  });

  it("counts a re-signing agreed earlier in the same advance", async () => {
    // Those deals are decided in memory and not written until later in the
    // season advance. Ignoring them lets a club spend the same money twice.
    const signings = await marketWith({
      yearsFor: () => null,
      reSignings: Array.from({ length: 12 }, (_, i) => ({
        leaguePlayerId: `p${i}`,
        offerSalaryCents: BIG_SALARY,
      })),
    });
    expect(signings).toEqual([]);
  });
});
