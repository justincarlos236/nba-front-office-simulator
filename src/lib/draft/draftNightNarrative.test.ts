import { describe, expect, it } from "vitest";
import { computeExpectedDraftRank, classifySelection } from "./draftNightNarrative";

describe("computeExpectedDraftRank", () => {
  it("ranks the highest-rated prospect as rank 1", () => {
    const ranks = computeExpectedDraftRank([
      { id: "a", overallRating: 70 },
      { id: "b", overallRating: 90 },
      { id: "c", overallRating: 60 },
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
    expect(ranks.get("c")).toBe(3);
  });
});

describe("classifySelection", () => {
  it("returns null when the gap doesn't clear the threshold", () => {
    expect(classifySelection(10, 5)).toBeNull();
    expect(classifySelection(5, 10)).toBeNull();
  });

  it("classifies a much-earlier-than-expected pick as a REACH", () => {
    expect(classifySelection(40, 10)).toBe("REACH");
  });

  it("classifies a much-later-than-expected pick as a STEAL", () => {
    expect(classifySelection(3, 25)).toBe("STEAL");
  });

  it("treats exactly the threshold gap as notable (inclusive boundary)", () => {
    expect(classifySelection(30, 15)).toBe("REACH");
    expect(classifySelection(15, 30)).toBe("STEAL");
  });
});
