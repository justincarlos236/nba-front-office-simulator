import { describe, expect, it } from "vitest";
import { highestImportance, importanceForRating } from "./newsImportance";

describe("importanceForRating", () => {
  it("rates a superstar as MAJOR", () => {
    expect(importanceForRating(94)).toBe("MAJOR");
  });

  it("rates a star as STANDARD", () => {
    expect(importanceForRating(84)).toBe("STANDARD");
  });

  it("rates a starter/rotation/minimum player as MINOR", () => {
    expect(importanceForRating(75)).toBe("MINOR");
    expect(importanceForRating(68)).toBe("MINOR");
    expect(importanceForRating(60)).toBe("MINOR");
  });
});

describe("highestImportance", () => {
  it("picks the biggest level among several", () => {
    expect(highestImportance(["MINOR", "STANDARD", "MINOR"])).toBe("STANDARD");
    expect(highestImportance(["MAJOR", "BREAKING", "MINOR"])).toBe("BREAKING");
  });

  it("defaults to MINOR for an empty list", () => {
    expect(highestImportance([])).toBe("MINOR");
  });
});
