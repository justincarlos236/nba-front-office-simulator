import { describe, expect, it } from "vitest";
import { groupContractYears, type BallDontLieContract } from "./balldontlieContracts";

function row(playerId: number, season: number, capHit: number | null): BallDontLieContract {
  return {
    id: playerId * 100 + season,
    player_id: playerId,
    season,
    team_id: 1,
    cap_hit: capHit,
    total_cash: capHit,
    base_salary: capHit,
    player: {
      id: playerId,
      first_name: "A",
      last_name: "B",
      position: "C",
      draft_year: null,
      draft_round: null,
      draft_number: null,
    },
    team: { id: 1, abbreviation: "BOS" },
  };
}

describe("groupContractYears", () => {
  it("turns one row per season into a single multi-year deal", () => {
    const years = groupContractYears(
      [row(1, 2025, 10_000_000), row(1, 2026, 11_000_000), row(1, 2027, 12_000_000)],
      2025,
    ).get(1);
    expect(years).toEqual([
      { season: 2025, salaryCents: 1_000_000_000 },
      { season: 2026, salaryCents: 1_100_000_000 },
      { season: 2027, salaryCents: 1_200_000_000 },
    ]);
  });

  it("converts dollars to integer cents", () => {
    const years = groupContractYears([row(1, 2025, 2_536_898)], 2025).get(1);
    expect(years).toEqual([{ season: 2025, salaryCents: 253_689_800 }]);
  });

  /**
   * A gap means the deal ended and a later row is a different contract - one
   * the simulator has no business seeding, because by then its own free agency
   * should have decided where that player is.
   */
  it("stops at a gap rather than welding two contracts together", () => {
    const years = groupContractYears(
      [row(1, 2025, 10_000_000), row(1, 2026, 11_000_000), row(1, 2028, 30_000_000)],
      2025,
    ).get(1);
    expect(years).toHaveLength(2);
    expect(years!.at(-1)!.season).toBe(2026);
  });

  it("drops a player whose deal does not cover the seeding season", () => {
    // Only future years on record - he is a free agent as of 2025.
    expect(groupContractYears([row(1, 2026, 10_000_000)], 2025).has(1)).toBe(false);
  });

  it("ignores rows with no usable salary", () => {
    expect(groupContractYears([row(1, 2025, null)], 2025).has(1)).toBe(false);
    expect(groupContractYears([row(1, 2025, 0)], 2025).has(1)).toBe(false);
  });

  it("keeps players separate", () => {
    const grouped = groupContractYears([row(1, 2025, 5_000_000), row(2, 2025, 9_000_000)], 2025);
    expect(grouped.get(1)![0].salaryCents).toBe(500_000_000);
    expect(grouped.get(2)![0].salaryCents).toBe(900_000_000);
  });
});
