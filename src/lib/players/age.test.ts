import { describe, expect, it } from "vitest";
import { estimateAge, estimateExperience } from "./age";

describe("estimateAge", () => {
  it("assumes a 22-year-old rookie in their draft season", () => {
    expect(estimateAge(2023, 2023)).toBe(22);
  });

  it("ages a player forward as the season advances", () => {
    expect(estimateAge(2023, 2024)).toBe(23);
    expect(estimateAge(2013, 2023)).toBe(32);
  });

  it("falls back to a default age when draft year is unknown", () => {
    expect(estimateAge(null, 2023)).toBe(27);
  });

  it("clamps at a 19-year-old floor", () => {
    expect(estimateAge(2028, 2023)).toBe(19);
  });
});

describe("estimateExperience", () => {
  it("is zero in a rookie's draft season", () => {
    expect(estimateExperience(2023, 2023)).toBe(0);
  });

  it("grows as the season advances", () => {
    expect(estimateExperience(2013, 2023)).toBe(10);
    expect(estimateExperience(2013, 2024)).toBe(11);
  });

  it("falls back to a default when draft year is unknown", () => {
    expect(estimateExperience(null, 2023)).toBe(5);
  });

  it("never goes negative", () => {
    expect(estimateExperience(2025, 2023)).toBe(0);
  });
});
