import { describe, it, expect } from "vitest";
import {
  curateFranchiseMemory,
  relocationMemoryEntry,
  type MemoryTransaction,
} from "./franchiseMemory";

function tx(overrides: Partial<MemoryTransaction> = {}): MemoryTransaction {
  return {
    id: "1",
    season: 2025,
    type: "AWARD",
    description: "test",
    importance: "MAJOR",
    ...overrides,
  };
}

describe("curateFranchiseMemory", () => {
  it("excludes MINOR and STANDARD entries entirely", () => {
    const result = curateFranchiseMemory([
      tx({ id: "minor", importance: "MINOR" }),
      tx({ id: "standard", importance: "STANDARD" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("excludes types not on the curated allowlist even at BREAKING", () => {
    const result = curateFranchiseMemory([
      tx({ id: "x", type: "STAFF_HIRE", importance: "BREAKING" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("includes allowlisted types at MAJOR or BREAKING", () => {
    const result = curateFranchiseMemory([
      tx({ id: "award", type: "AWARD", importance: "MAJOR" }),
      tx({ id: "trade", type: "TRADE", importance: "BREAKING" }),
    ]);
    expect(result.map((e) => e.id).sort()).toEqual(["award", "trade"]);
  });

  it("ranks BREAKING above MAJOR", () => {
    const result = curateFranchiseMemory([
      tx({ id: "major", type: "AWARD", importance: "MAJOR", season: 2025 }),
      tx({ id: "breaking", type: "AWARD", importance: "BREAKING", season: 2020 }),
    ]);
    expect(result[0].id).toBe("breaking");
  });

  it("breaks ties by recency", () => {
    const result = curateFranchiseMemory([
      tx({ id: "older", type: "AWARD", importance: "MAJOR", season: 2020 }),
      tx({ id: "newer", type: "AWARD", importance: "MAJOR", season: 2025 }),
    ]);
    expect(result[0].id).toBe("newer");
  });

  it("caps the result to a short permanent list", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      tx({ id: `t${i}`, type: "AWARD", importance: "BREAKING", season: 2000 + i }),
    );
    const result = curateFranchiseMemory(many);
    expect(result.length).toBeLessThanOrEqual(8);
  });
});

describe("relocationMemoryEntry", () => {
  it("returns null when the franchise never relocated", () => {
    expect(relocationMemoryEntry({ relocatedCityName: null, relocatedAtSeason: null })).toBeNull();
  });

  it("returns a real entry naming the city when relocated", () => {
    const entry = relocationMemoryEntry({ relocatedCityName: "Seattle", relocatedAtSeason: 2031 });
    expect(entry).not.toBeNull();
    expect(entry!.description).toContain("Seattle");
    expect(entry!.season).toBe(2031);
  });

  it("outranks every curated entry's weight", () => {
    const entry = relocationMemoryEntry({ relocatedCityName: "Seattle", relocatedAtSeason: 2031 })!;
    const curated = curateFranchiseMemory([tx({ importance: "BREAKING" })]);
    expect(entry.weight).toBeGreaterThan(curated[0].weight);
  });
});
