import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import {
  pickClassCharacter,
  classCharacterModifiers,
  CLASS_CHARACTER_LABEL,
  type ClassCharacter,
} from "./classCharacter";

describe("pickClassCharacter", () => {
  it("is deterministic for the same rng sequence", () => {
    const a = pickClassCharacter(createSeededRandom("class-1"));
    const b = pickClassCharacter(createSeededRandom("class-1"));
    expect(a).toBe(b);
  });

  it("produces every character across enough draws", () => {
    const rng = createSeededRandom("class-coverage");
    const seen = new Set<ClassCharacter>();
    for (let i = 0; i < 500; i++) {
      seen.add(pickClassCharacter(rng));
    }
    expect(seen).toEqual(
      new Set<ClassCharacter>([
        "BALANCED",
        "TOP_HEAVY",
        "DEEP_BUT_FLAT",
        "INTERNATIONAL_HEAVY",
        "INJURY_RIDDLED",
        "WEAK_CLASS",
      ]),
    );
  });

  it("BALANCED is the plurality character", () => {
    const rng = createSeededRandom("class-plurality");
    const counts: Record<ClassCharacter, number> = {
      BALANCED: 0,
      TOP_HEAVY: 0,
      DEEP_BUT_FLAT: 0,
      INTERNATIONAL_HEAVY: 0,
      INJURY_RIDDLED: 0,
      WEAK_CLASS: 0,
    };
    for (let i = 0; i < 1000; i++) counts[pickClassCharacter(rng)] += 1;
    const max = Math.max(...Object.values(counts));
    expect(counts.BALANCED).toBe(max);
  });
});

describe("classCharacterModifiers", () => {
  it("every character has a registered label and description", () => {
    for (const character of Object.keys(CLASS_CHARACTER_LABEL) as ClassCharacter[]) {
      expect(classCharacterModifiers(character)).toBeTruthy();
    }
  });

  it("BALANCED applies no modification at all", () => {
    const mods = classCharacterModifiers("BALANCED");
    expect(mods.overallAtPick1Delta).toBe(0);
    expect(mods.overallAtPick60Delta).toBe(0);
    expect(mods.potentialAtPick1Delta).toBe(0);
    expect(mods.internationalRateMultiplier).toBe(1);
    expect(mods.injuryRiskDelta).toBe(0);
    expect(mods.bigBoardNoiseMultiplier).toBe(1);
  });

  it("TOP_HEAVY raises the top of the class and lowers the bottom", () => {
    const mods = classCharacterModifiers("TOP_HEAVY");
    expect(mods.overallAtPick1Delta).toBeGreaterThan(0);
    expect(mods.overallAtPick60Delta).toBeLessThanOrEqual(0);
  });

  it("DEEP_BUT_FLAT lowers the top of the class and raises the bottom", () => {
    const mods = classCharacterModifiers("DEEP_BUT_FLAT");
    expect(mods.overallAtPick1Delta).toBeLessThan(0);
    expect(mods.overallAtPick60Delta).toBeGreaterThan(0);
  });

  it("INTERNATIONAL_HEAVY raises the international rate multiplier above 1", () => {
    expect(
      classCharacterModifiers("INTERNATIONAL_HEAVY").internationalRateMultiplier,
    ).toBeGreaterThan(1);
  });

  it("INJURY_RIDDLED raises injury risk above 0", () => {
    expect(classCharacterModifiers("INJURY_RIDDLED").injuryRiskDelta).toBeGreaterThan(0);
  });

  it("WEAK_CLASS lowers ratings across the whole curve", () => {
    const mods = classCharacterModifiers("WEAK_CLASS");
    expect(mods.overallAtPick1Delta).toBeLessThan(0);
    expect(mods.overallAtPick60Delta).toBeLessThan(0);
    expect(mods.potentialAtPick1Delta).toBeLessThan(0);
  });
});
