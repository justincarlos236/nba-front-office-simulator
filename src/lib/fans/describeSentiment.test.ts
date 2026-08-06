import { describe, it, expect } from "vitest";
import {
  describeTradeSentiment,
  describeSigningSentiment,
  describeLotterySentiment,
} from "./describeSentiment";

describe("describeTradeSentiment", () => {
  // The exact regression this module exists to fix: fanReactions.ts's old
  // "Fans are buzzing" fired identically for every trade regardless of
  // whether it was lopsided in either direction - see
  // docs/FANS_PAGE_REDESIGN.md Part 2.3.
  it("reads distinctly different for a lopsided win vs. a lopsided loss", () => {
    const won = describeTradeSentiment({ delta: 6, sentNames: ["A"], acquiredNames: ["B"] });
    const lost = describeTradeSentiment({ delta: -6, sentNames: ["A"], acquiredNames: ["B"] });
    expect(won).not.toBe(lost);
    expect(won).toMatch(/robbed/);
    expect(lost).toMatch(/furious/);
  });

  it("reads as a shrug for a genuinely fair trade", () => {
    const fair = describeTradeSentiment({ delta: 0, sentNames: ["A"], acquiredNames: ["B"] });
    expect(fair).toMatch(/shrugged/);
  });

  it("names the real players on both sides", () => {
    const text = describeTradeSentiment({
      delta: 0,
      sentNames: ["Marcus Reed"],
      acquiredNames: ["Jamal Price"],
    });
    expect(text).toContain("Marcus Reed");
    expect(text).toContain("Jamal Price");
  });
});

describe("describeSigningSentiment", () => {
  it("distinguishes a re-signing from a fresh outside addition", () => {
    const reSign = describeSigningSentiment({ playerName: "X", isReSigning: true, delta: 1 });
    const fresh = describeSigningSentiment({ playerName: "X", isReSigning: false, delta: 1 });
    expect(reSign).not.toBe(fresh);
  });
});

describe("describeLotterySentiment", () => {
  it("distinguishes winning the #1 pick from an ordinary jump", () => {
    const wonOne = describeLotterySentiment(2, true);
    const jumped = describeLotterySentiment(2, false);
    expect(wonOne).not.toBe(jumped);
  });

  it("distinguishes a fall from a jump", () => {
    const fell = describeLotterySentiment(-3, false);
    const jumped = describeLotterySentiment(3, false);
    expect(fell).toMatch(/[Ff]ell/);
    expect(jumped).toMatch(/[Jj]umped/);
  });
});
