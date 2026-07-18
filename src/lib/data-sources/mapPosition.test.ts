import { describe, expect, it } from "vitest";
import { mapPosition } from "./mapPosition";

describe("mapPosition", () => {
  it("maps single-letter positions", () => {
    expect(mapPosition("G")).toBe("PG");
    expect(mapPosition("F")).toBe("SF");
    expect(mapPosition("C")).toBe("C");
  });

  it("maps combo-guard and combo-forward positions", () => {
    expect(mapPosition("G-F")).toBe("SG");
    expect(mapPosition("F-G")).toBe("SG");
    expect(mapPosition("F-C")).toBe("PF");
    expect(mapPosition("C-F")).toBe("PF");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mapPosition(" g ")).toBe("PG");
    expect(mapPosition("c")).toBe("C");
  });

  it("falls back to SF for blank or unknown values", () => {
    expect(mapPosition("")).toBe("SF");
    expect(mapPosition(null)).toBe("SF");
    expect(mapPosition(undefined)).toBe("SF");
    expect(mapPosition("???")).toBe("SF");
  });
});
