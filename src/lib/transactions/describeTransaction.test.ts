import { describe, expect, it } from "vitest";
import {
  describeRetirement,
  describeSigning,
  describeTrade,
  describeDraftReach,
  describeDraftSteal,
} from "./describeTransaction";

describe("describeTrade", () => {
  it("names both sides when it's a player-for-player trade", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentAssetNames: ["X"] },
      { teamLabel: "Los Angeles Lakers", sentAssetNames: ["Y"] },
    );
    expect(result).toBe("Chicago Bulls traded X to the Los Angeles Lakers for Y");
  });

  it("joins multiple players with an oxford comma", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentAssetNames: ["X", "Y", "Z"] },
      { teamLabel: "Los Angeles Lakers", sentAssetNames: ["W"] },
    );
    expect(result).toBe("Chicago Bulls traded X, Y, and Z to the Los Angeles Lakers for W");
  });

  it("joins exactly two players with 'and', no comma", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentAssetNames: ["X", "Y"] },
      { teamLabel: "Los Angeles Lakers", sentAssetNames: ["W"] },
    );
    expect(result).toBe("Chicago Bulls traded X and Y to the Los Angeles Lakers for W");
  });

  it("omits 'for' when the other side sent nothing back", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentAssetNames: ["X"] },
      { teamLabel: "Los Angeles Lakers", sentAssetNames: [] },
    );
    expect(result).toBe("Chicago Bulls traded X to the Los Angeles Lakers");
  });

  it("phrases from the other side's perspective when only they sent players", () => {
    const result = describeTrade(
      { teamLabel: "Chicago Bulls", sentAssetNames: [] },
      { teamLabel: "Los Angeles Lakers", sentAssetNames: ["Y"] },
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

describe("describeDraftReach", () => {
  it("names the team, player, pick, and expected rank", () => {
    expect(describeDraftReach("Chicago Bulls", "X", 10, 40)).toBe(
      "Chicago Bulls reach for X at pick 10 - most boards had him closer to No. 40",
    );
  });
});

describe("describeDraftSteal", () => {
  it("names the player, expected rank, actual pick, and the team that found them", () => {
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3)).toBe(
      "X, projected around No. 3, falls all the way to pick 25 - a real steal for Chicago Bulls",
    );
  });

  it("adds no pathway clause when pathway is omitted or Power Conference", () => {
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3, null)).not.toContain("ranks");
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3, "POWER_CONFERENCE")).not.toContain(
      "ranks",
    );
  });

  it("adds a pathway clause for the three lower-visibility pathways", () => {
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3, "MID_MAJOR")).toContain(
      "out of the Mid-Major ranks",
    );
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3, "INTERNATIONAL_PROFESSIONAL")).toContain(
      "out of the international ranks",
    );
    expect(describeDraftSteal("Chicago Bulls", "X", 25, 3, "DEVELOPMENT_PATHWAY")).toContain(
      "out of the Development Pathway ranks",
    );
  });
});
