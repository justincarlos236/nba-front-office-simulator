import { describe, expect, it } from "vitest";
import { buildFuturePickRows } from "./futurePicks";

describe("buildFuturePickRows", () => {
  it("gives every team one round-1 and one round-2 pick per season", () => {
    const rows = buildFuturePickRows("league-1", ["team-a", "team-b"], [2027, 2028]);

    expect(rows).toHaveLength(2 * 2 * 2);
    expect(rows.filter((r) => r.season === 2027 && r.round === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.season === 2027 && r.round === 2)).toHaveLength(2);
    expect(rows.filter((r) => r.season === 2028)).toHaveLength(4);
  });

  it("starts originalTeamId and currentOwnerId as the same team", () => {
    const rows = buildFuturePickRows("league-1", ["team-a"], [2027]);
    for (const row of rows) {
      expect(row.originalTeamId).toBe("team-a");
      expect(row.currentOwnerId).toBe("team-a");
    }
  });

  it("returns an empty array for no seasons or no teams", () => {
    expect(buildFuturePickRows("league-1", ["team-a"], [])).toEqual([]);
    expect(buildFuturePickRows("league-1", [], [2027])).toEqual([]);
  });
});
