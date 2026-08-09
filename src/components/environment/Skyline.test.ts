import { describe, expect, it } from "vitest";
import { cityFor, signaturePathFor } from "./Skyline";
import {
  CITIES,
  GENERIC,
  FIELD_MAX_HEIGHT,
  SIGNATURE_MAX_HEIGHT,
  SIGNATURE_MIN_HEIGHT,
  type CityComposition,
} from "./cities";
import { TEAM_SEEDS } from "../../../prisma/data/teams";

/**
 * The compositions are authored by hand, so the failure mode is a typo in a
 * path rather than a logic bug. More importantly, these tests enforce the
 * *hierarchy* - which is the whole reason the single-path version was replaced.
 *
 * The first implementation passed every test it had (closed, unique,
 * in-bounds) while being completely unrecognisable, because none of those
 * properties say anything about whether a city looks like itself. A structured
 * composition makes "exactly one Signature, drawn large, above its supports" a
 * checkable claim.
 */

/** All y-coordinates in a path. Everything is drawn in a 0-100 viewBox. */
function yValues(path: string): number[] {
  const ys: number[] = [];
  const re = /([MLVQ])\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?(?:[ ,]+(-?[\d.]+))?(?:[ ,]+(-?[\d.]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) {
    const [, cmd, a, b, , d] = m;
    if (cmd === "V") ys.push(Number(a));
    else if (cmd === "M" || cmd === "L") ys.push(Number(b));
    else if (cmd === "Q") {
      if (b !== undefined) ys.push(Number(b));
      if (d !== undefined) ys.push(Number(d));
    }
  }
  return ys.filter((n) => Number.isFinite(n));
}

/** Height above the baseline, in viewBox units. */
function heightOf(path: string): number {
  const ys = yValues(path);
  return ys.length === 0 ? 0 : 100 - Math.min(...ys);
}

const ALL: Array<[string, CityComposition]> = Object.entries(CITIES);

describe("every franchise has its own city", () => {
  it("gives all 30 franchises a composition, with no fallthrough to generic", () => {
    for (const team of TEAM_SEEDS) {
      const city = cityFor(team.abbreviation);
      expect(city, `${team.abbreviation} has no composition`).not.toBe(GENERIC);
      expect(city.landmark.length).toBeGreaterThan(0);
    }
  });

  it("gives every city a distinct landmark", () => {
    // Two franchises sharing a landmark means one is not differentiated by
    // place - the exact failure this system replaced.
    const landmarks = ALL.map(([, c]) => c.landmark);
    expect(new Set(landmarks).size).toBe(landmarks.length);
  });

  it("gives every city a distinct signature silhouette", () => {
    const signatures = ALL.map(([, c]) => c.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("differentiates the two Los Angeles franchises by district", () => {
    // Same metro, deliberately different views: the shared downtown may appear
    // as Support but never as both franchises' Signature.
    expect(cityFor("LAL").signature).not.toBe(cityFor("LAC").signature);
    expect(cityFor("LAL").landmark).not.toBe(cityFor("LAC").landmark);
  });

  it("differentiates the two New York franchises by borough", () => {
    expect(cityFor("NYK").signature).not.toBe(cityFor("BKN").signature);
    expect(cityFor("NYK").landmark).not.toBe(cityFor("BKN").landmark);
  });
});

describe("the One Landmark, Two Companions hierarchy", () => {
  it("draws the signature large enough to read at a glance", () => {
    for (const [name, city] of ALL) {
      const h = heightOf(city.signature);
      expect(h, `${name} signature is only ${h} tall`).toBeGreaterThanOrEqual(SIGNATURE_MIN_HEIGHT);
      expect(h, `${name} signature is ${h} tall and dominates`).toBeLessThanOrEqual(
        SIGNATURE_MAX_HEIGHT,
      );
    }
  });

  it("keeps the signature taller than everything supporting it", () => {
    // Hierarchy is the point: if a support form out-tops the landmark, the eye
    // goes to the wrong shape and the city stops being identifiable.
    for (const [name, city] of ALL) {
      const sig = heightOf(city.signature);
      for (const s of city.support) {
        expect(heightOf(s), `${name} has a support taller than its signature`).toBeLessThan(sig);
      }
    }
  });

  it("keeps the field low", () => {
    for (const [name, city] of ALL) {
      const h = heightOf(city.field);
      expect(h, `${name} field rises to ${h}`).toBeLessThanOrEqual(FIELD_MAX_HEIGHT);
    }
  });

  it("gives every city a field to rise out of, and one to three supports", () => {
    for (const [name, city] of ALL) {
      expect(city.field.length, `${name} has no field`).toBeGreaterThan(0);
      expect(city.support.length, `${name} support count`).toBeGreaterThanOrEqual(1);
      expect(city.support.length, `${name} has too many supports`).toBeLessThanOrEqual(3);
    }
  });
});

describe("drawing rules", () => {
  it("closes every subpath and starts every path with a move", () => {
    for (const [name, city] of ALL) {
      for (const path of [city.signature, ...city.support, city.field]) {
        expect(path.trimStart().startsWith("M"), `${name}: does not start with M`).toBe(true);
        expect(path.trimEnd().endsWith("Z"), `${name}: path is not closed`).toBe(true);
      }
    }
  });

  it("uses absolute commands only, so coordinates can be verified", () => {
    for (const [name, city] of ALL) {
      for (const path of [city.signature, ...city.support, city.field]) {
        expect(path, `${name}: uses relative commands`).not.toMatch(/[mlvhqcsa](?=[\s\d-])/);
      }
    }
  });

  it("keeps every coordinate inside the viewBox", () => {
    for (const [name, city] of ALL) {
      for (const path of [city.signature, ...city.support, city.field]) {
        for (const n of path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []) {
          expect(n, `${name}: coordinate ${n} out of range`).toBeGreaterThanOrEqual(0);
          expect(n, `${name}: coordinate ${n} out of range`).toBeLessThanOrEqual(400);
        }
      }
    }
  });
});

describe("relocation", () => {
  it("resolves a relocated franchise to its new city", () => {
    for (const city of ["Seattle", "Las Vegas", "Louisville"]) {
      expect(cityFor("OKC", city)).toBe(CITIES[city]);
      expect(cityFor("OKC", city)).not.toBe(cityFor("OKC"));
    }
  });

  it("ignores a relocation city it has no composition for", () => {
    // A destination added to the game but not yet drawn falls back to the
    // franchise's own city rather than to the generic silhouette.
    expect(cityFor("BOS", "Nowhere City")).toBe(cityFor("BOS"));
  });

  it("falls back rather than throwing on an unknown team", () => {
    expect(cityFor("ZZZ")).toBe(GENERIC);
    expect(signaturePathFor("ZZZ")).toBe(GENERIC.signature);
  });
});
