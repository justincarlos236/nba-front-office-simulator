import { describe, expect, it } from "vitest";
import {
  isWithinTradeCooldown,
  daysUntilTradeable,
  TRADE_COOLDOWN_DAYS,
} from "./recentAcquisition";

const SEASON = 2026;
const acquired = (dayIndex: number | null, season: number | null = SEASON) => ({
  joinedTeamSeason: season,
  joinedTeamDayIndex: dayIndex,
});

describe("isWithinTradeCooldown", () => {
  /**
   * The regression this exists for. docs/TRADE_EXPLOIT_AUDIT.md P0-1: a greedy
   * ladder compounded 21.5% of book value by upgrading the same roster slot
   * over and over, each trade sending away the player acquired in the previous
   * one. This rule is what breaks the ladder.
   */
  it("blocks a player acquired today from being flipped", () => {
    expect(isWithinTradeCooldown(acquired(40), SEASON, 40)).toBe(true);
  });

  it("blocks him for the whole cooldown and releases him after", () => {
    expect(isWithinTradeCooldown(acquired(0), SEASON, TRADE_COOLDOWN_DAYS - 1)).toBe(true);
    expect(isWithinTradeCooldown(acquired(0), SEASON, TRADE_COOLDOWN_DAYS)).toBe(false);
  });

  it("does not restrict a player acquired in an earlier season", () => {
    // The offseason alone exceeds any cooldown this rule would sensibly use.
    expect(isWithinTradeCooldown(acquired(150, SEASON - 1), SEASON, 5)).toBe(false);
  });

  /**
   * Fails open on unknown history. A seeded player has no acquisition to be
   * recent from, and blocking a trade on missing data is a worse failure than
   * allowing one.
   */
  it("treats an unknown acquisition as tradeable", () => {
    expect(isWithinTradeCooldown(acquired(null), SEASON, 40)).toBe(false);
    expect(isWithinTradeCooldown(acquired(10, null), SEASON, 40)).toBe(false);
    expect(isWithinTradeCooldown(acquired(null, null), SEASON, 40)).toBe(false);
  });

  it("honours a custom cooldown length", () => {
    expect(isWithinTradeCooldown(acquired(0), SEASON, 20, 30)).toBe(true);
    expect(isWithinTradeCooldown(acquired(0), SEASON, 20, 10)).toBe(false);
  });
});

describe("daysUntilTradeable", () => {
  it("counts down to eligibility", () => {
    expect(daysUntilTradeable(acquired(10), SEASON, 10)).toBe(TRADE_COOLDOWN_DAYS);
    expect(daysUntilTradeable(acquired(10), SEASON, 40)).toBe(TRADE_COOLDOWN_DAYS - 30);
  });

  it("reports zero for a player who may already be traded", () => {
    expect(daysUntilTradeable(acquired(0), SEASON, TRADE_COOLDOWN_DAYS)).toBe(0);
    expect(daysUntilTradeable(acquired(null), SEASON, 40)).toBe(0);
  });

  it("is long enough to matter against a season", () => {
    // A 174-day season, so this caps one roster slot at roughly two upgrades.
    expect(TRADE_COOLDOWN_DAYS).toBeGreaterThanOrEqual(30);
    expect(TRADE_COOLDOWN_DAYS).toBeLessThan(174 / 2);
  });
});
