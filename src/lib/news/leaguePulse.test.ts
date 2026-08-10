import { describe, expect, it } from "vitest";
import {
  computeLeaguePulse,
  recordLabel,
  streakLabel,
  type PulseInjury,
  type PulseTeam,
} from "./leaguePulse";

const team = (over: Partial<PulseTeam> = {}): PulseTeam => ({
  leagueTeamId: "t1",
  label: "Team",
  wins: 10,
  losses: 10,
  currentStreak: 0,
  ...over,
});

const injury = (over: Partial<PulseInjury> = {}): PulseInjury => ({
  leaguePlayerId: "p1",
  playerName: "A Player",
  teamLabel: "Team",
  leagueTeamId: "t1",
  overallRating: 80,
  gamesRemaining: 5,
  ...over,
});

describe("computeLeaguePulse", () => {
  it("finds the hottest and coldest teams from standings state", () => {
    const pulse = computeLeaguePulse(
      [
        team({ leagueTeamId: "hot", currentStreak: 8 }),
        team({ leagueTeamId: "warm", currentStreak: 4 }),
        team({ leagueTeamId: "cold", currentStreak: -6 }),
      ],
      [],
      null,
    );
    expect(pulse.hottest?.leagueTeamId).toBe("hot");
    expect(pulse.coldest?.leagueTeamId).toBe("cold");
  });

  it("reports no streak storyline when nobody is actually streaking", () => {
    const pulse = computeLeaguePulse(
      [team({ currentStreak: 1 }), team({ currentStreak: -2 })],
      [],
      null,
    );
    // Two straight wins is not a storyline. An empty module beats a fake one.
    expect(pulse.hottest).toBeNull();
    expect(pulse.coldest).toBeNull();
  });

  it("ranks the best record by win percentage, not raw wins", () => {
    const pulse = computeLeaguePulse(
      [
        team({ leagueTeamId: "more-games", wins: 30, losses: 30 }),
        team({ leagueTeamId: "better", wins: 20, losses: 5 }),
      ],
      [],
      null,
    );
    expect(pulse.best?.leagueTeamId).toBe("better");
  });

  it("ignores teams that have not played when picking the best record", () => {
    const pulse = computeLeaguePulse(
      [
        team({ leagueTeamId: "unplayed", wins: 0, losses: 0 }),
        team({ leagueTeamId: "played", wins: 1, losses: 0 }),
      ],
      [],
      null,
    );
    expect(pulse.best?.leagueTeamId).toBe("played");
  });

  it("surfaces the injury that hurts most, not merely the newest", () => {
    const pulse = computeLeaguePulse(
      [team()],
      [
        injury({ leaguePlayerId: "role", overallRating: 75, gamesRemaining: 20 }),
        injury({ leaguePlayerId: "star", overallRating: 92, gamesRemaining: 4 }),
      ],
      null,
    );
    expect(pulse.keyInjury?.leaguePlayerId).toBe("star");
  });

  it("prefers the user's own team when the injuries are comparable", () => {
    const pulse = computeLeaguePulse(
      [team()],
      [
        injury({ leaguePlayerId: "theirs", leagueTeamId: "other", overallRating: 95 }),
        injury({ leaguePlayerId: "mine", leagueTeamId: "mine", overallRating: 80 }),
      ],
      "mine",
    );
    expect(pulse.keyInjury?.leaguePlayerId).toBe("mine");
  });

  it("does not promote a fringe player's absence to a storyline", () => {
    const pulse = computeLeaguePulse([team()], [injury({ overallRating: 62 })], null);
    expect(pulse.keyInjury).toBeNull();
    // Still counted - the module can say how many are out without headlining one.
    expect(pulse.injuredCount).toBe(1);
  });

  it("handles an empty league without inventing anything", () => {
    const pulse = computeLeaguePulse([], [], null);
    expect(pulse).toEqual({
      hottest: null,
      coldest: null,
      best: null,
      keyInjury: null,
      injuredCount: 0,
    });
  });
});

describe("labels", () => {
  it("reads naturally in both directions", () => {
    expect(streakLabel(5)).toBe("Won 5 straight");
    expect(streakLabel(-3)).toBe("Lost 3 straight");
    expect(recordLabel(team({ wins: 12, losses: 7 }))).toBe("12-7");
  });
});
