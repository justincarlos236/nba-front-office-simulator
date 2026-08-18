import { describe, expect, it } from "vitest";
import { deriveLeaguePhase } from "./leaguePhase";

describe("deriveLeaguePhase", () => {
  it("is regular-season whenever games remain, regardless of anything else", () => {
    expect(deriveLeaguePhase(5, false, false, false)).toBe("regular-season");
    expect(deriveLeaguePhase(1, true, true, true)).toBe("regular-season");
  });

  it("is playoffs-incomplete once the regular season ends but no champion is crowned", () => {
    expect(deriveLeaguePhase(0, false, false, false)).toBe("playoffs-incomplete");
    expect(deriveLeaguePhase(0, false, true, true)).toBe("playoffs-incomplete");
  });

  it("is pre-draft once a champion is crowned but the lottery hasn't run yet", () => {
    expect(deriveLeaguePhase(0, true, false, false)).toBe("pre-draft");
  });

  it("is draft-incomplete once the lottery has run but picks are still pending", () => {
    expect(deriveLeaguePhase(0, true, false, true)).toBe("draft-incomplete");
  });

  it("is ready once the regular season, playoffs, and draft are all complete", () => {
    expect(deriveLeaguePhase(0, true, true, true)).toBe("ready");
  });

  // an existing save that already ran
  // its lottery must land in exactly the phase it did before the pre-draft
  // window existed, never in a half-state that skips backward.
  it("keeps a save that already started its draft in draft-incomplete, not pre-draft", () => {
    expect(deriveLeaguePhase(0, true, false, true)).toBe("draft-incomplete");
  });
});
