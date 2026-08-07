import { describe, expect, it } from "vitest";
import { generateProspectName, generateUniqueProspectName } from "./prospectNames";

describe("generateUniqueProspectName", () => {
  it("returns a name in the same format as generateProspectName", () => {
    const rng = () => 0;
    const name = generateUniqueProspectName(rng, new Set());
    expect(name).toBe(generateProspectName(() => 0));
  });

  it("retries until it finds a name not already in the taken set", () => {
    const values = [0, 0, 0.5]; // first two draws collide with an already-taken name
    let i = 0;
    const rng = () => values[i++];
    const taken = new Set([generateProspectName(() => 0)]);
    const name = generateUniqueProspectName(rng, taken);
    expect(name).not.toBe(generateProspectName(() => 0));
  });

  it("adds the returned name to the taken set", () => {
    const taken = new Set<string>();
    const name = generateUniqueProspectName(() => 0.3, taken);
    expect(taken.has(name)).toBe(true);
  });

  it("never returns a duplicate across many sequential calls with real randomness", () => {
    const taken = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < 60; i++) {
      names.push(generateUniqueProspectName(Math.random, taken));
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
