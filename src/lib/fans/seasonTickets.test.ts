import { describe, it, expect } from "vitest";
import {
  computeSeasonTicketBaseDelta,
  applySeasonTicketBaseDelta,
  computeAttendanceFloor,
} from "./seasonTickets";

describe("computeSeasonTicketBaseDelta", () => {
  const neutral = { winPct: 0.5, ticketPosture: "STANDARD" as const, fanHappiness: 65 };

  it("a winning, happy, fan-friendly team grows the base", () => {
    const delta = computeSeasonTicketBaseDelta({
      winPct: 0.7,
      ticketPosture: "FAN_FRIENDLY",
      fanHappiness: 85,
    });
    expect(delta).toBeGreaterThan(0);
  });

  it("a losing, unhappy, premium-priced team erodes the base", () => {
    const delta = computeSeasonTicketBaseDelta({
      winPct: 0.3,
      ticketPosture: "PREMIUM",
      fanHappiness: 40,
    });
    expect(delta).toBeLessThan(0);
  });

  it("erosion is asymmetrically faster than growth for a mirrored good/bad scenario", () => {
    const good = computeSeasonTicketBaseDelta({
      winPct: 0.65,
      ticketPosture: "FAN_FRIENDLY",
      fanHappiness: 80,
    });
    const bad = computeSeasonTicketBaseDelta({
      winPct: 0.35,
      ticketPosture: "PREMIUM",
      fanHappiness: 50,
    });
    expect(Math.abs(bad)).toBeGreaterThan(Math.abs(good));
  });

  it("premium pricing alone, even while winning, drags the delta down versus fan-friendly", () => {
    const premium = computeSeasonTicketBaseDelta({
      ...neutral,
      winPct: 0.6,
      ticketPosture: "PREMIUM",
    });
    const fanFriendly = computeSeasonTicketBaseDelta({
      ...neutral,
      winPct: 0.6,
      ticketPosture: "FAN_FRIENDLY",
    });
    expect(premium).toBeLessThan(fanFriendly);
  });

  it("stays within its caps", () => {
    const maxGood = computeSeasonTicketBaseDelta({
      winPct: 1,
      ticketPosture: "FAN_FRIENDLY",
      fanHappiness: 100,
    });
    const maxBad = computeSeasonTicketBaseDelta({
      winPct: 0,
      ticketPosture: "PREMIUM",
      fanHappiness: 0,
    });
    expect(maxGood).toBeLessThanOrEqual(3);
    expect(maxBad).toBeGreaterThanOrEqual(-9);
  });
});

describe("applySeasonTicketBaseDelta", () => {
  it("clamps into 0-100", () => {
    expect(applySeasonTicketBaseDelta(99, 10)).toBe(100);
    expect(applySeasonTicketBaseDelta(2, -10)).toBe(0);
  });
});

describe("computeAttendanceFloor", () => {
  it("is modest at the neutral starting base (65)", () => {
    const floor = computeAttendanceFloor(65);
    expect(floor).toBeGreaterThan(0.1);
    expect(floor).toBeLessThan(0.75);
  });

  it("increases monotonically with the base", () => {
    expect(computeAttendanceFloor(0)).toBeLessThan(computeAttendanceFloor(50));
    expect(computeAttendanceFloor(50)).toBeLessThan(computeAttendanceFloor(100));
  });

  it("a fully eroded base (0) offers close to no protection", () => {
    expect(computeAttendanceFloor(0)).toBeLessThan(0.15);
  });

  it("a maxed base offers strong protection", () => {
    expect(computeAttendanceFloor(100)).toBeGreaterThan(0.85);
  });
});
