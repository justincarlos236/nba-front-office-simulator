import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateOrigin, type ProspectPathway } from "./prospectBio";

describe("generateOrigin", () => {
  it("always assigns a pathway consistent with isInternational", () => {
    const rng = createSeededRandom("origin-consistency");
    for (let i = 0; i < 200; i++) {
      const origin = generateOrigin(rng);
      if (origin.isInternational) {
        expect(origin.pathway).toBe("INTERNATIONAL_PROFESSIONAL");
        expect(origin.nationality).not.toBe("USA");
      } else {
        expect(["POWER_CONFERENCE", "MID_MAJOR", "DEVELOPMENT_PATHWAY"]).toContain(origin.pathway);
        expect(origin.nationality).toBe("USA");
      }
    }
  });

  it("produces all four pathways across enough draws", () => {
    const rng = createSeededRandom("origin-coverage");
    const seen = new Set<ProspectPathway>();
    for (let i = 0; i < 500; i++) {
      seen.add(generateOrigin(rng).pathway);
    }
    expect(seen).toEqual(
      new Set<ProspectPathway>([
        "POWER_CONFERENCE",
        "MID_MAJOR",
        "INTERNATIONAL_PROFESSIONAL",
        "DEVELOPMENT_PATHWAY",
      ]),
    );
  });

  it("skews toward power conference as the plurality pathway", () => {
    const rng = createSeededRandom("origin-plurality");
    const counts: Record<ProspectPathway, number> = {
      POWER_CONFERENCE: 0,
      MID_MAJOR: 0,
      INTERNATIONAL_PROFESSIONAL: 0,
      DEVELOPMENT_PATHWAY: 0,
    };
    for (let i = 0; i < 1000; i++) {
      counts[generateOrigin(rng).pathway] += 1;
    }
    const max = Math.max(...Object.values(counts));
    expect(counts.POWER_CONFERENCE).toBe(max);
  });
});
