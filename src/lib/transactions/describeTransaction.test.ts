import { describe, expect, it } from "vitest";
import { describeRetirement, describeSigning, describeTrade } from "./describeTransaction";

describe("describeTrade", () => {
  it("names both sides when it's a player-for-player trade", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentPlayerNames: ["X"] },
      { teamLabel: "Los Angeles Lakers", sentPlayerNames: ["Y"] },
    );
    expect(result).toBe("Chicago Bulls traded X to the Los Angeles Lakers for Y");
  });

  it("joins multiple players with an oxford comma", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentPlayerNames: ["X", "Y", "Z"] },
      { teamLabel: "Los Angeles Lakers", sentPlayerNames: ["W"] },
    );
    expect(result).toBe("Chicago Bulls traded X, Y, and Z to the Los Angeles Lakers for W");
  });

  it("joins exactly two players with 'and', no comma", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentPlayerNames: ["X", "Y"] },
      { teamLabel: "Los Angeles Lakers", sentPlayerNames: ["W"] },
    );
    expect(result).toBe("Chicago Bulls traded X and Y to the Los Angeles Lakers for W");
  });

  it("omits 'for' when the other side sent nothing back", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentPlayerNames: ["X"] },
      { teamLabel: "Los Angeles Lakers", sentPlayerNames: [] },
    );
    expect(result).toBe("Chicago Bulls traded X to the Los Angeles Lakers");
  });

  it("phrases from the other side's perspective when only they sent players", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentPlayerNames: [] },
      { teamLabel: "Los Angeles Lakers", sentPlayerNames: ["Y"] },
    );
    expect(result).toBe("Los Angeles Lakers traded Y to the Chicago Bulls");
  });
});

describe("describeSigning", () => {
  it("pluralizes multi-year deals", () => {
    expect(describeSigning("Chicago Bulls", "X", 3, 48_700_000_00n)).toBe(
      "Chicago Bulls signed X to a 3-year, $48.7M deal",
    );
  });

  it("uses singular '1-year' for one-year deals", () => {
    expect(describeSigning("Chicago Bulls", "X", 1, 850_000_00n)).toBe(
      "Chicago Bulls signed X to a 1-year, $850.0K deal",
    );
  });
});

describe("describeRetirement", () => {
  it("names the team when rostered", () => {
    expect(describeRetirement("X", "Chicago Bulls")).toBe(
      "X has announced their retirement from the Chicago Bulls",
    );
  });

  it("omits team when unrostered", () => {
    expect(describeRetirement("X", null)).toBe("X has announced their retirement");
  });
});
