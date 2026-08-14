import { describe, expect, it } from "vitest";
import {
  decideRateLimit,
  SIGN_UP_POLICY,
  SIGN_IN_POLICY,
  LEAGUE_CREATION_POLICY,
  type RateLimitPolicy,
} from "./policy";

const NOW = 1_800_000_000_000;

const policy: RateLimitPolicy = {
  name: "test",
  limit: 3,
  windowMs: 60_000,
  message: "slow down",
};

/** `n` hits, the most recent `msAgo` milliseconds old, one second apart. */
const hits = (n: number, msAgo: number): number[] =>
  Array.from({ length: n }, (_, i) => NOW - msAgo - i * 1_000);

describe("decideRateLimit", () => {
  it("allows the first attempt when nothing has been recorded", () => {
    expect(decideRateLimit([], policy, NOW)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
  });

  it("allows attempts up to the limit and refuses the one past it", () => {
    expect(decideRateLimit(hits(2, 1_000), policy, NOW).allowed).toBe(true);
    expect(decideRateLimit(hits(3, 1_000), policy, NOW).allowed).toBe(false);
  });

  it("reports remaining capacity, and never a negative one", () => {
    expect(decideRateLimit(hits(1, 1_000), policy, NOW).remaining).toBe(1);
    expect(decideRateLimit(hits(2, 1_000), policy, NOW).remaining).toBe(0);
    expect(decideRateLimit(hits(9, 1_000), policy, NOW).remaining).toBe(0);
  });

  it("ignores hits that have aged out of the window", () => {
    // Three hits, but all older than the 60s window.
    expect(decideRateLimit(hits(3, 61_000), policy, NOW).allowed).toBe(true);
  });

  it("counts a hit exactly at the window edge as expired", () => {
    expect(decideRateLimit([NOW - 60_000], policy, NOW).remaining).toBe(2);
    expect(decideRateLimit([NOW - 59_999], policy, NOW).remaining).toBe(1);
  });

  /**
   * The reason this is a sliding window and not a fixed one. With fixed
   * buckets a caller spends the full allowance at the end of one bucket and
   * the full allowance again at the start of the next - twice the intended
   * rate across the boundary. Here the older hits still count until they
   * individually expire.
   */
  it("does not let a caller double the rate across a window boundary", () => {
    const spentJustBeforeBoundary = hits(3, 30_000);
    expect(decideRateLimit(spentJustBeforeBoundary, policy, NOW).allowed).toBe(false);
  });

  it("measures retryAfter from the oldest hit in the window, not the newest", () => {
    // Oldest is 50s old, so a 60s window frees a slot in 10s.
    const timestamps = [NOW - 50_000, NOW - 20_000, NOW - 1_000];
    expect(decideRateLimit(timestamps, policy, NOW).retryAfterMs).toBe(10_000);
  });

  it("never reports a negative retryAfter", () => {
    expect(decideRateLimit(hits(3, 59_999), policy, NOW).retryAfterMs).toBeGreaterThanOrEqual(0);
  });
});

/**
 * These limits exist to stop scripted abuse, not to police normal play - a
 * limit a real person hits by accident is a bug. These assertions pin that
 * intent so a later "let's tighten this up" has to argue with a test.
 */
describe("policy values stay loose enough for real people", () => {
  it("lets a household share an IP without being locked out of signing up", () => {
    expect(SIGN_UP_POLICY.limit).toBeGreaterThanOrEqual(5);
  });

  it("tolerates someone misremembering their password several times", () => {
    expect(SIGN_IN_POLICY.limit).toBeGreaterThanOrEqual(10);
  });

  it("lets a user create more leagues per hour than the cap allows them to hold", () => {
    // Otherwise the rate limit, not the franchise cap, is what a normal player
    // runs into first - and it would give a far more confusing message.
    expect(LEAGUE_CREATION_POLICY.limit).toBeGreaterThan(5);
  });

  it("gives every policy a message that tells the user when to retry", () => {
    for (const p of [SIGN_UP_POLICY, SIGN_IN_POLICY, LEAGUE_CREATION_POLICY]) {
      expect(p.message).toMatch(/again/i);
    }
  });
});
