import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateStaffMember } from "./generateStaff";

describe("generateStaffMember", () => {
  it("is deterministic for a given seed", () => {
    const a = generateStaffMember("HEAD_COACH", createSeededRandom("league-1-team-1-HEAD_COACH"));
    const b = generateStaffMember("HEAD_COACH", createSeededRandom("league-1-team-1-HEAD_COACH"));
    expect(a).toEqual(b);
  });

  it("produces different staff for different seeds", () => {
    const a = generateStaffMember("HEAD_COACH", createSeededRandom("league-1-team-1-HEAD_COACH"));
    const b = generateStaffMember("HEAD_COACH", createSeededRandom("league-1-team-2-HEAD_COACH"));
    expect(a.fullName).not.toBe(b.fullName);
  });

  it("keeps quality within the 60-99 range", () => {
    for (let i = 0; i < 50; i++) {
      const staff = generateStaffMember("HEAD_COACH", createSeededRandom(`seed-${i}`));
      expect(staff.quality).toBeGreaterThanOrEqual(60);
      expect(staff.quality).toBeLessThanOrEqual(99);
    }
  });

  it("skews toward the middle of the range rather than uniform", () => {
    let extremeCount = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const staff = generateStaffMember("HEAD_COACH", createSeededRandom(`skew-${i}`));
      if (staff.quality <= 65 || staff.quality >= 94) extremeCount++;
    }
    // A uniform 60-99 distribution would put roughly 26% in these tails;
    // the averaged-two-rolls approach should land meaningfully lower.
    expect(extremeCount / trials).toBeLessThan(0.2);
  });

  it("only assigns a style to Head Coach", () => {
    const coach = generateStaffMember("HEAD_COACH", createSeededRandom("style-check"));
    const devCoach = generateStaffMember(
      "PLAYER_DEVELOPMENT_COACH",
      createSeededRandom("style-check-2"),
    );
    const medical = generateStaffMember("MEDICAL_STAFF", createSeededRandom("style-check-3"));
    expect(coach.style).not.toBeNull();
    expect(devCoach.style).toBeNull();
    expect(medical.style).toBeNull();
  });

  it("respects each role's age range", () => {
    for (let i = 0; i < 30; i++) {
      const coach = generateStaffMember("HEAD_COACH", createSeededRandom(`age-hc-${i}`));
      expect(coach.age).toBeGreaterThanOrEqual(38);
      expect(coach.age).toBeLessThanOrEqual(68);

      const dev = generateStaffMember(
        "PLAYER_DEVELOPMENT_COACH",
        createSeededRandom(`age-dev-${i}`),
      );
      expect(dev.age).toBeGreaterThanOrEqual(32);
      expect(dev.age).toBeLessThanOrEqual(60);
    }
  });

  it("pays a higher-quality hire more than a lower-quality one at the same role", () => {
    // Force specific quality via a fixed rng sequence isn't practical here
    // (quality is derived from two averaged draws) - instead, sample many
    // and confirm the correlation holds across the population.
    const samples = Array.from({ length: 100 }, (_, i) =>
      generateStaffMember("HEAD_COACH", createSeededRandom(`salary-${i}`)),
    );
    const sorted = [...samples].sort((a, b) => a.quality - b.quality);
    const lowQualityAvgSalary =
      sorted.slice(0, 20).reduce((sum, s) => sum + Number(s.annualSalaryCents), 0) / 20;
    const highQualityAvgSalary =
      sorted.slice(-20).reduce((sum, s) => sum + Number(s.annualSalaryCents), 0) / 20;
    expect(highQualityAvgSalary).toBeGreaterThan(lowQualityAvgSalary);
  });

  it("gives Head Coach a meaningfully higher salary than Medical Staff at similar quality", () => {
    const coach = generateStaffMember("HEAD_COACH", createSeededRandom("compare-1"));
    const medical = generateStaffMember("MEDICAL_STAFF", createSeededRandom("compare-1"));
    // Same seed -> same quality roll, so this isolates the role's base salary difference.
    expect(coach.quality).toBe(medical.quality);
    expect(Number(coach.annualSalaryCents)).toBeGreaterThan(Number(medical.annualSalaryCents) * 2);
  });

  it("keeps contract length within 2-4 years", () => {
    for (let i = 0; i < 30; i++) {
      const staff = generateStaffMember("HEAD_COACH", createSeededRandom(`years-${i}`));
      expect(staff.contractYears).toBeGreaterThanOrEqual(2);
      expect(staff.contractYears).toBeLessThanOrEqual(4);
    }
  });
});
