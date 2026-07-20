import { describe, expect, it } from "vitest";
import { deriveScoutingProfile } from "./scoutingProfile";

describe("deriveScoutingProfile", () => {
  it("keeps every attribute within [25, 99]", () => {
    const profile = deriveScoutingProfile({ id: "p1", overallRating: 90, position: "C" });
    for (const value of [
      profile.scoring,
      profile.playmaking,
      profile.defense,
      profile.rebounding,
      profile.athleticism,
    ]) {
      expect(value).toBeGreaterThanOrEqual(25);
      expect(value).toBeLessThanOrEqual(99);
    }
  });

  it("returns exactly 2 strengths and 2 weaknesses, non-overlapping", () => {
    const profile = deriveScoutingProfile({ id: "p2", overallRating: 70, position: "SF" });
    expect(profile.strengths).toHaveLength(2);
    expect(profile.weaknesses).toHaveLength(2);
    for (const s of profile.strengths) {
      expect(profile.weaknesses).not.toContain(s);
    }
  });

  it("skews centers toward rebounding/defense over playmaking", () => {
    const center = deriveScoutingProfile({ id: "center-1", overallRating: 70, position: "C" });
    expect(center.rebounding).toBeGreaterThan(center.playmaking);
  });

  it("skews point guards toward playmaking over rebounding", () => {
    const pg = deriveScoutingProfile({ id: "pg-1", overallRating: 70, position: "PG" });
    expect(pg.playmaking).toBeGreaterThan(pg.rebounding);
  });

  it("is deterministic for the same prospect id", () => {
    const a = deriveScoutingProfile({ id: "same-id", overallRating: 65, position: "SG" });
    const b = deriveScoutingProfile({ id: "same-id", overallRating: 65, position: "SG" });
    expect(a).toEqual(b);
  });

  it("gives different prospects different profiles", () => {
    const a = deriveScoutingProfile({ id: "id-a", overallRating: 65, position: "SG" });
    const b = deriveScoutingProfile({ id: "id-b", overallRating: 65, position: "SG" });
    expect(a).not.toEqual(b);
  });
});
