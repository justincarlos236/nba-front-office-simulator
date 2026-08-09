import { describe, expect, it } from "vitest";
import {
  computeRivalInterest,
  INTEREST_LABEL,
  INTEREST_TONE,
  type RivalTeam,
  type FreeAgentForInterest,
} from "./rivalInterest";

const MILLION = 1_000_000_00n; // cents

function rival(overrides: Partial<RivalTeam> = {}): RivalTeam {
  return {
    leagueTeamId: overrides.leagueTeamId ?? "t1",
    abbreviation: overrides.abbreviation ?? "AAA",
    capSpaceCents: overrides.capSpaceCents ?? 300n * MILLION,
    needs: overrides.needs ?? [],
    rosterCount: overrides.rosterCount ?? 12,
  };
}

const STARTER_CENTER: FreeAgentForInterest = {
  position: "C",
  overallRating: 78,
  estimatedValueCents: 200n * MILLION,
};

describe("rival interest", () => {
  it("reports nobody when no team can afford the player", () => {
    const result = computeRivalInterest(STARTER_CENTER, [
      rival({ capSpaceCents: 0n }),
      rival({ leagueTeamId: "t2", capSpaceCents: 10n * MILLION }),
    ]);
    expect(result.level).toBe("none");
    expect(result.rivals).toHaveLength(0);
    expect(INTEREST_LABEL.none).toBe("No reported interest");
  });

  it("ignores teams with a full roster even when they have the money", () => {
    const result = computeRivalInterest(STARTER_CENTER, [
      rival({ rosterCount: 15, needs: ["RIM_PROTECTOR"] }),
    ]);
    expect(result.level).toBe("none");
  });

  it("separates teams that need the player from teams that merely have room", () => {
    const result = computeRivalInterest(STARTER_CENTER, [
      rival({ leagueTeamId: "needy", abbreviation: "NED", needs: ["RIM_PROTECTOR"] }),
      rival({ leagueTeamId: "rich", abbreviation: "RCH", needs: [] }),
    ]);
    expect(result.rivals.map((r) => r.reason)).toEqual(["fills a need", "has the room"]);
    // Motivated bidders lead: they are the ones who actually outbid you.
    expect(result.rivals[0].abbreviation).toBe("NED");
  });

  it("treats spare cap room alone as mild rather than as competition", () => {
    // Fifteen teams with money left over is not competition.
    const many = Array.from({ length: 15 }, (_, i) =>
      rival({ leagueTeamId: `t${i}`, abbreviation: `T${i}`, needs: [] }),
    );
    expect(computeRivalInterest(STARTER_CENTER, many).level).toBe("mild");
  });

  it("treats a single motivated bidder as real competition", () => {
    const result = computeRivalInterest(STARTER_CENTER, [rival({ needs: ["RIM_PROTECTOR"] })]);
    expect(result.level).toBe("real");
    expect(INTEREST_TONE.real).toBe("caution");
  });

  it("escalates to heavy once three teams have the same hole", () => {
    const three = Array.from({ length: 3 }, (_, i) =>
      rival({ leagueTeamId: `t${i}`, abbreviation: `T${i}`, needs: ["RIM_PROTECTOR"] }),
    );
    const result = computeRivalInterest(STARTER_CENTER, three);
    expect(result.level).toBe("heavy");
    expect(INTEREST_TONE.heavy).toBe("negative");
  });

  it("lets a star answer a star need regardless of position", () => {
    // A star point guard fills STAR_SCORER for a team with no star, even though
    // that team's positional hole is at centre.
    const star: FreeAgentForInterest = {
      position: "PG",
      overallRating: 92,
      estimatedValueCents: 200n * MILLION,
    };
    const result = computeRivalInterest(star, [rival({ needs: ["STAR_SCORER"] })]);
    expect(result.rivals[0].reason).toBe("fills a need");
  });

  it("does not let a role player answer a star need", () => {
    const rolePlayer: FreeAgentForInterest = {
      position: "SG",
      overallRating: 68,
      estimatedValueCents: 200n * MILLION,
    };
    const result = computeRivalInterest(rolePlayer, [rival({ needs: ["STAR_SCORER"] })]);
    expect(result.rivals[0].reason).toBe("has the room");
    expect(result.level).toBe("mild");
  });

  it("matches wings to the wing need and guards to the guard need", () => {
    const wing: FreeAgentForInterest = { ...STARTER_CENTER, position: "SF" };
    expect(computeRivalInterest(wing, [rival({ needs: ["WING_DEFENDER"] })]).rivals[0].reason).toBe(
      "fills a need",
    );

    const guard: FreeAgentForInterest = { ...STARTER_CENTER, position: "PG" };
    expect(computeRivalInterest(guard, [rival({ needs: ["POINT_GUARD"] })]).rivals[0].reason).toBe(
      "fills a need",
    );

    // A centre does not answer a wing need.
    expect(
      computeRivalInterest(STARTER_CENTER, [rival({ needs: ["WING_DEFENDER"] })]).rivals[0].reason,
    ).toBe("has the room");
  });

  it("requires cap space to cover the player's full expected price", () => {
    // A team one dollar short is not a bidder.
    const justShort = rival({
      needs: ["RIM_PROTECTOR"],
      capSpaceCents: STARTER_CENTER.estimatedValueCents - 1n,
    });
    expect(computeRivalInterest(STARTER_CENTER, [justShort]).level).toBe("none");

    const exact = rival({
      needs: ["RIM_PROTECTOR"],
      capSpaceCents: STARTER_CENTER.estimatedValueCents,
    });
    expect(computeRivalInterest(STARTER_CENTER, [exact]).level).toBe("real");
  });

  it("is deterministic, so the user can plan against it", () => {
    // Pressure the user cannot reason about is noise, not strategy. Same
    // inputs must always give the same answer.
    const rivals = [
      rival({ leagueTeamId: "a", abbreviation: "AAA", needs: ["RIM_PROTECTOR"] }),
      rival({ leagueTeamId: "b", abbreviation: "BBB", needs: [] }),
    ];
    const first = computeRivalInterest(STARTER_CENTER, rivals);
    for (let i = 0; i < 5; i += 1) {
      expect(computeRivalInterest(STARTER_CENTER, rivals)).toEqual(first);
    }
  });

  it("handles an empty league without throwing", () => {
    expect(computeRivalInterest(STARTER_CENTER, []).level).toBe("none");
  });
});
