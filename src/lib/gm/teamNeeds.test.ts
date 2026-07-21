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
      player("PG", 70),
      player("SG", 60),
      player("SF", 82), // star scorer
      player("PF", 58),
      player("C", 60),
      player("PG", 45),
      player("SG", 44),
      player("SF", 43),
      player("PF", 42),
      player("C", 41),
    ];
    expect(computeTeamNeeds(roster)).toEqual([]);
  });

  it("flags a missing star scorer", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 60),
      player("SG", 60),
      player("SF", 60),
      player("PF", 60),
      player("C", 60),
      player("PG", 45),
      player("SG", 45),
      player("SF", 45),
      player("PF", 45),
    ];
    expect(computeTeamNeeds(roster)).toContain("STAR_SCORER");
  });

  it("flags a weak position independently", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 30), // weak point guard
      player("SG", 82),
      player("SF", 60),
      player("PF", 60),
      player("C", 60),
      player("PG", 45),
      player("SG", 45),
      player("SF", 45),
      player("PF", 45),
    ];
    const needs = computeTeamNeeds(roster);
    expect(needs).toContain("POINT_GUARD");
    expect(needs).not.toContain("RIM_PROTECTOR");
    expect(needs).not.toContain("WING_DEFENDER");
  });

  it("flags thin bench depth when few rotation-caliber players exist", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 82),
      player("SG", 60),
      player("SF", 60),
      player("PF", 60),
      player("C", 60),
    ];
    expect(computeTeamNeeds(roster)).toContain("BENCH_DEPTH");
  });

  it("judges a position by its best player, not the average", () => {
    const roster: TeamNeedRosterPlayer[] = [
      player("PG", 82),
      player("C", 70), // one strong center is enough, even with weak backups
      player("C", 20),
      player("SG", 60),
      player("SF", 60),
      player("PF", 60),
      player("PG", 45),
      player("SG", 45),
      player("SF", 45),
    ];
    expect(computeTeamNeeds(roster)).not.toContain("RIM_PROTECTOR");
  });
});
