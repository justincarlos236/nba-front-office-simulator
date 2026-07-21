import { describe, expect, it } from "vitest";
import { computeTeamNeeds, type TeamNeedRosterPlayer } from "./teamNeeds";

function player(
  position: TeamNeedRosterPlayer["position"],
  overallRating: number,
): TeamNeedRosterPlayer {
  return { position, overallRating };
}

describe("computeTeamNeeds", () => {
  it("recognizes a team with no needs when fully stocked", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 80),
      player("SG", 75),
      player("SF", 90), // star scorer
      player("PF", 78),
      player("C", 76),
      player("PG", 68),
      player("SG", 67),
      player("SF", 66),
      player("PF", 65),
      player("C", 65),
    ];
    expect(computeTeamNeeds(roster)).toEqual([]);
  });

  it("flags a missing star scorer", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 75),
      player("SG", 75),
      player("SF", 75),
      player("PF", 75),
      player("C", 75),
      player("PG", 70),
      player("SG", 70),
      player("SF", 70),
      player("PF", 70),
    ];
    expect(computeTeamNeeds(roster)).toContain("STAR_SCORER");
  });

  it("flags a weak position independently", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 55), // weak point guard
      player("SG", 90),
      player("SF", 75),
      player("PF", 75),
      player("C", 75),
      player("PG", 70),
      player("SG", 70),
      player("SF", 70),
      player("PF", 70),
    ];
    const needs = computeTeamNeeds(roster);
    expect(needs).toContain("POINT_GUARD");
    expect(needs).not.toContain("RIM_PROTECTOR");
    expect(needs).not.toContain("WING_DEFENDER");
  });

  it("flags thin bench depth when few rotation-caliber players exist", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 90),
      player("SG", 75),
      player("SF", 75),
      player("PF", 75),
      player("C", 75),
    ];
    expect(computeTeamNeeds(roster)).toContain("BENCH_DEPTH");
  });

  it("judges a position by its best player, not the average", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 90),
      player("C", 78), // one strong center is enough, even with weak backups
      player("C", 45),
      player("SG", 75),
      player("SF", 75),
      player("PF", 75),
      player("PG", 70),
      player("SG", 70),
      player("SF", 70),
    ];
    expect(computeTeamNeeds(roster)).not.toContain("RIM_PROTECTOR");
  });
});
