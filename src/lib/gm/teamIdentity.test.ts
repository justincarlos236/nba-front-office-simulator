import { describe, expect, it } from "vitest";
import { computeTeamIdentity } from "./teamIdentity";

describe("computeTeamIdentity", () => {
  it("classifies the top of the league as a Contender", () => {
    expect(computeTeamIdentity(0.9, 27)).toBe("CONTENDER");
    expect(computeTeamIdentity(0.8, 27)).toBe("CONTENDER");
  });

  it("classifies direct playoff qualifiers as a Playoff Team", () => {
    expect(computeTeamIdentity(0.7, 27)).toBe("PLAYOFF_TEAM");
    expect(computeTeamIdentity(0.6, 27)).toBe("PLAYOFF_TEAM");
  });

  it("classifies the play-in range as a Play-In Team", () => {
    expect(computeTeamIdentity(0.5, 27)).toBe("PLAY_IN_TEAM");
    expect(computeTeamIdentity(0.33, 27)).toBe("PLAY_IN_TEAM");
  });

  it("classifies a bad young team as Rebuilding", () => {
    expect(computeTeamIdentity(0.1, 24)).toBe("REBUILDING");
    expect(computeTeamIdentity(0.1, 26)).toBe("REBUILDING");
  });

  it("classifies a bad old team as Tanking", () => {
    expect(computeTeamIdentity(0.1, 27)).toBe("TANKING");
    expect(computeTeamIdentity(0.05, 32)).toBe("TANKING");
  });
});
