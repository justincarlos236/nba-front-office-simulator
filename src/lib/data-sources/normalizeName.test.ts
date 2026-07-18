import { describe, expect, it } from "vitest";
import { normalizePlayerName } from "./normalizeName";

describe("normalizePlayerName", () => {
  it("strips accents", () => {
    expect(normalizePlayerName("Luka Doncic")).toBe(normalizePlayerName("Luka Dončić"));
  });

  it("lowercases and collapses whitespace", () => {
    expect(normalizePlayerName("  Stephen   Curry ")).toBe("stephen curry");
  });

  it("strips common suffixes", () => {
    expect(normalizePlayerName("Gary Trent Jr.")).toBe("gary trent");
    expect(normalizePlayerName("Kelly Oubre III")).toBe("kelly oubre");
  });

  it("strips periods and apostrophes", () => {
    expect(normalizePlayerName("O.G. Anunoby")).toBe("og anunoby");
    expect(normalizePlayerName("De'Aaron Fox")).toBe("deaaron fox");
  });

  it("treats equivalent names as equal after normalization", () => {
    expect(normalizePlayerName("Nikola Jokic")).toBe(normalizePlayerName("Nikola Jokić"));
  });
});
