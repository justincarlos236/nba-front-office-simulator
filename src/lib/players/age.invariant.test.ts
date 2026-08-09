import { describe, expect, it } from "vitest";
import { resolvePlayerAge, resolvePlayerExperience, estimateAge } from "./age";
import { retirementProbability } from "@/lib/development/retirement";

/**
 * Invariants for player age.
 *
 * These exist because the age defect passed the entire test suite. Both halves
 * were individually correct and individually tested: `estimateAge` returns a
 * sensible fallback when it has no draft year, and `retirementProbability`
 * returns a sensible curve for any age you hand it. Nothing asserted that the
 * two *connect* — that a real league contains players of varying ages, or that
 * anybody in it can ever retire.
 *
 * The seeded roster carries `birthDate` and no `draftYear`, so every real
 * player resolved to the constant 27 forever: no growth, no decline, and a
 * retirement probability of exactly zero. A six-season save recorded zero
 * retirements and grew to 777 players.
 */

const SEASON = 2026;
const born = (year: number, month = 5, day = 15) => new Date(Date.UTC(year, month, day));

describe("age resolution prefers the accurate source", () => {
  it("uses birthDate when present, even if a draft year disagrees", () => {
    // A 34-year-old whose draft year would imply 26. birthDate wins.
    const player = { birthDate: born(1992), draftYear: SEASON - 4 };
    expect(resolvePlayerAge(player, SEASON)).toBe(34);
    expect(estimateAge(player.draftYear, SEASON)).toBe(26);
  });

  it("falls back to draft year when there is no birthDate", () => {
    expect(resolvePlayerAge({ birthDate: null, draftYear: SEASON - 5 }, SEASON)).toBe(27);
  });

  it("falls back to the constant only when a row carries neither", () => {
    expect(resolvePlayerAge({ birthDate: null, draftYear: null }, SEASON)).toBe(27);
  });

  it("ages a player as seasons advance", () => {
    // The original defect: a real player's age never moved, ever.
    const player = { birthDate: born(1998), draftYear: null };
    const ages = [2026, 2027, 2028, 2029].map((s) => resolvePlayerAge(player, s));
    expect(ages).toEqual([28, 29, 30, 31]);
  });

  it("derives experience from the same source as age", () => {
    const player = { birthDate: born(1996), draftYear: null };
    expect(resolvePlayerAge(player, SEASON)).toBe(30);
    // ~22 at draft, so a 30-year-old has roughly eight years in.
    expect(resolvePlayerExperience(player, SEASON)).toBe(8);
  });
});

describe("a realistic roster reaches every life stage", () => {
  // Ages spanning a believable NBA roster, expressed as birth dates.
  const roster = [2006, 2004, 2002, 2000, 1998, 1996, 1994, 1992, 1990, 1986].map((y) => ({
    birthDate: born(y),
    draftYear: null,
  }));
  const ages = roster.map((p) => resolvePlayerAge(p, SEASON));

  it("produces a real age spread rather than one constant", () => {
    // The defect's signature: every player the same age.
    expect(new Set(ages).size).toBeGreaterThan(5);
    expect(Math.max(...ages) - Math.min(...ages)).toBeGreaterThan(15);
  });

  it("puts players in all three development branches", () => {
    // developPlayerRating: grows at <=26, drifts under 30, declines at 30+.
    // Every real player used to sit in the middle branch forever.
    expect(ages.some((a) => a <= 26)).toBe(true);
    expect(ages.some((a) => a > 26 && a < 30)).toBe(true);
    expect(ages.some((a) => a >= 30)).toBe(true);
  });

  it("makes retirement reachable", () => {
    // Risk starts at 33. With every player pinned at 27 this was exactly zero
    // for the entire league, permanently.
    const atRisk = ages.filter((a) => retirementProbability(a, 75) > 0);
    expect(atRisk.length).toBeGreaterThan(0);
  });

  it("eventually forces the oldest players out", () => {
    // Retirement is certain at 41, so no player can be immortal.
    expect(retirementProbability(41, 90)).toBe(1);
    expect(retirementProbability(45, 99)).toBe(1);
  });
});
