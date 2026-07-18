import { describe, expect, it } from "vitest";
import playerSeasonStats from "./playerSeasonStats.json";

describe("playerSeasonStats fixture", () => {
  it("covers the 2023-24 season", () => {
    expect(playerSeasonStats.season).toBe(2023);
    expect(playerSeasonStats.seasonLabel).toBe("2023-24");
  });

  it("has a realistic number of qualifying players", () => {
    expect(playerSeasonStats.players.length).toBeGreaterThan(300);
    expect(playerSeasonStats.players.length).toBeLessThan(600);
  });

  it("keeps every stat within a plausible per-game range", () => {
    for (const player of playerSeasonStats.players) {
      expect(player.gamesPlayed).toBeGreaterThanOrEqual(10);
      // A regular season is 82 team-games; a small upper margin absorbs a
      // rare upstream data artifact affecting a couple of mid-season-traded
      // players (e.g. Buddy Hield shows 84) rather than distorting real
      // aggregated totals with an artificial clamp.
      expect(player.gamesPlayed).toBeLessThanOrEqual(85);
      expect(player.minutesPerGame).toBeGreaterThan(0);
      expect(player.minutesPerGame).toBeLessThanOrEqual(48);
      expect(player.pointsPerGame).toBeGreaterThanOrEqual(0);
      expect(player.pointsPerGame).toBeLessThan(50);
      if (player.fgPct !== null) {
        expect(player.fgPct).toBeGreaterThanOrEqual(0);
        expect(player.fgPct).toBeLessThanOrEqual(1);
      }
      if (player.trueShootingPct !== null) {
        expect(player.trueShootingPct).toBeGreaterThanOrEqual(0);
        expect(player.trueShootingPct).toBeLessThanOrEqual(1);
      }
    }
  });

  it("includes well-known 2023-24 statistical leaders", () => {
    const names = playerSeasonStats.players.map((p) => p.personName);
    expect(names).toContain("Nikola Jokic");
    expect(names).toContain("Luka Doncic");
    expect(names).toContain("Joel Embiid");
  });
});
