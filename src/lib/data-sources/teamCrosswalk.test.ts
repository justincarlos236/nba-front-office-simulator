import { describe, it, expect } from "vitest";
import { mapEspnTeamAbbreviation, isKnownTeam } from "./teamCrosswalk";

describe("mapEspnTeamAbbreviation", () => {
  it("remaps the six diverging ESPN abbreviations to ours", () => {
    expect(mapEspnTeamAbbreviation("GS")).toBe("GSW");
    expect(mapEspnTeamAbbreviation("NO")).toBe("NOP");
    expect(mapEspnTeamAbbreviation("NY")).toBe("NYK");
    expect(mapEspnTeamAbbreviation("SA")).toBe("SAS");
    expect(mapEspnTeamAbbreviation("UTAH")).toBe("UTA");
    expect(mapEspnTeamAbbreviation("WSH")).toBe("WAS");
  });
  it("passes through the abbreviations that already match", () => {
    expect(mapEspnTeamAbbreviation("BOS")).toBe("BOS");
    expect(mapEspnTeamAbbreviation("LAL")).toBe("LAL");
    expect(mapEspnTeamAbbreviation("PHX")).toBe("PHX");
  });
  it("returns null for a missing team", () => {
    expect(mapEspnTeamAbbreviation(null)).toBeNull();
  });
});

describe("isKnownTeam", () => {
  it("checks membership against the seeded team set", () => {
    const known = new Set(["BOS", "GSW", "NYK"]);
    expect(isKnownTeam("GSW", known)).toBe(true);
    expect(isKnownTeam("GS", known)).toBe(false); // must be mapped first
  });
});
