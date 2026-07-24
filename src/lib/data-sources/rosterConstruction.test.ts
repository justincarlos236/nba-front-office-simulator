import { describe, it, expect } from "vitest";
import { selectTopPerTeam } from "./rosterConstruction";

interface P {
  id: string;
  team: string | null;
  rating: number;
}

describe("selectTopPerTeam", () => {
  const items: P[] = [
    { id: "a", team: "X", rating: 90 },
    { id: "b", team: "X", rating: 70 },
    { id: "c", team: "X", rating: 80 },
    { id: "d", team: "Y", rating: 60 },
    { id: "e", team: null, rating: 99 }, // no team -> ignored
  ];

  it("keeps the top N per team by rating and drops the rest", () => {
    const { rostered, byTeam } = selectTopPerTeam(
      items,
      (p) => p.team,
      (p) => p.rating,
      2,
    );
    const ids = [...rostered].map((p) => p.id).sort();
    expect(ids).toEqual(["a", "c", "d"]); // X keeps top 2 (a,c), Y keeps its 1, null dropped
    expect(byTeam.get("X")!.map((p) => p.id)).toEqual(["a", "c", "b"]); // sorted desc
  });

  it("keeps everyone when the team is under the cap", () => {
    const { rostered } = selectTopPerTeam(
      items,
      (p) => p.team,
      (p) => p.rating,
      15,
    );
    expect(rostered.size).toBe(4); // all with a team; the null one excluded
  });
});
