import { describe, expect, it } from "vitest";
import { TEAM_SEEDS } from "./teams";

describe("TEAM_SEEDS", () => {
  it("has exactly 30 teams", () => {
    expect(TEAM_SEEDS).toHaveLength(30);
  });

  it("has unique abbreviations", () => {
    const abbreviations = TEAM_SEEDS.map((t) => t.abbreviation);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
  });

  it("splits 15/15 between conferences", () => {
    const east = TEAM_SEEDS.filter((t) => t.conference === "EAST");
    const west = TEAM_SEEDS.filter((t) => t.conference === "WEST");
    expect(east).toHaveLength(15);
    expect(west).toHaveLength(15);
  });

  it("groups each conference into three five-team divisions", () => {
    for (const conference of ["EAST", "WEST"] as const) {
      const divisions = new Map<string, number>();
      for (const team of TEAM_SEEDS.filter((t) => t.conference === conference)) {
        divisions.set(team.division, (divisions.get(team.division) ?? 0) + 1);
      }
      expect(divisions.size).toBe(3);
      for (const count of divisions.values()) {
        expect(count).toBe(5);
      }
    }
  });

  it("gives every team valid hex colors", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const team of TEAM_SEEDS) {
      expect(team.primaryColor).toMatch(hexPattern);
      expect(team.secondaryColor).toMatch(hexPattern);
    }
  });

  it("gives every team a real market-size classification", () => {
    for (const team of TEAM_SEEDS) {
      expect(["LARGE", "MID", "SMALL"]).toContain(team.marketSize);
    }
  });
});

/**
 * Logo URLs, checked for the shape of the failure that actually happened.
 *
 * Chicago's URL pointed at `wikipedia/en` for a file hosted on
 * `wikipedia/commons`. Both are valid-looking Wikimedia thumbnail URLs, so
 * nothing caught it - the card simply rendered nothing, and it stayed that way
 * through several sessions. A live fetch belongs in `scripts/check-team-logos.ts`
 * (Wikimedia throttles, so it cannot run in a test suite); what is checkable
 * here is that every URL is well-formed and none is obviously stale.
 */
describe("team logo urls", () => {
  const URLS = TEAM_SEEDS.map((t) => [t.abbreviation, t.logoUrl] as const);

  it.each(URLS)("%s points at a Wikimedia thumbnail", (_ab, url) => {
    expect(url).toMatch(
      /^https:\/\/upload\.wikimedia\.org\/wikipedia\/(en|commons)\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/.+\/\d+px-.+\.png$/,
    );
  });

  it.each(URLS)("%s requests a thumbnail wide enough for the largest use", (_ab, url) => {
    // The biggest on-screen draw is the lottery's `xl` badge at 112px, and a
    // wide mark is scaled to 1.6x that. Anything under ~200px would be
    // upscaled and soft there.
    const width = Number(url.match(/\/(\d+)px-/)?.[1]);
    expect(width).toBeGreaterThanOrEqual(200);
  });

  it("gives every club its own logo", () => {
    // A copy-paste between two entries would otherwise show one club's mark on
    // another's card, which reads as a data bug long before anyone suspects the
    // URL.
    const urls = TEAM_SEEDS.map((t) => t.logoUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
