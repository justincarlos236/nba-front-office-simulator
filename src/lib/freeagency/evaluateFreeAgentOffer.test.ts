import { describe, expect, it } from "vitest";
import { evaluateFreeAgentOffer } from "./evaluateFreeAgentOffer";

const MINIMUM = 1_192_000_00n;
const STAR_ASK = 40_600_000_00n;

const offer = (params: {
  ask?: bigint;
  offer: bigint;
  suitors?: number;
  tier?: "SUPERSTAR" | "STAR" | "STARTER" | "ROTATION" | "MINIMUM";
}) =>
  evaluateFreeAgentOffer({
    askingPriceCents: params.ask ?? STAR_ASK,
    offerSalaryCents: params.offer,
    rivalSuitors: params.suitors ?? 0,
    valueTier: params.tier ?? "STAR",
    minimumSalaryCents: MINIMUM,
  });

describe("evaluateFreeAgentOffer", () => {
  /**
   * The regression this file exists for. docs/audits/FREE_AGENCY_AUDIT.md FA-P0-1:
   * every free agent in the game could be signed for the veteran minimum,
   * measured at up to a 35x discount to market. If this test ever passes a
   * minimum offer for a star, the exploit is back.
   */
  it("refuses a minimum offer for a star, even with nobody else bidding", () => {
    const decision = offer({ offer: MINIMUM, suitors: 0, tier: "STAR" });
    expect(decision.accepted).toBe(false);
    expect(decision.requiredSalaryCents).toBeGreaterThan(MINIMUM * 20n);
  });

  it("refuses a minimum offer for a superstar in a crowded market", () => {
    expect(offer({ offer: MINIMUM, suitors: 6, tier: "SUPERSTAR" }).accepted).toBe(false);
  });

  it("accepts an offer at the asking price", () => {
    expect(offer({ offer: STAR_ASK, suitors: 3 }).accepted).toBe(true);
  });

  it("accepts an offer above the asking price", () => {
    expect(offer({ offer: STAR_ASK * 2n, suitors: 6 }).accepted).toBe(true);
  });

  describe("demand moves what a player will settle for", () => {
    it("takes a discount when no rival is bidding", () => {
      const decision = offer({ offer: 0n, suitors: 0 });
      // 60% of ask - a bargain, but not a giveaway.
      expect(Number(decision.requiredSalaryCents)).toBeCloseTo(Number(STAR_ASK) * 0.6, -6);
    });

    it("insists on full price once three clubs want him", () => {
      expect(offer({ offer: 0n, suitors: 3 }).requiredSalaryCents).toBe(STAR_ASK);
    });

    it("does not ask for more than full price no matter how many suitors", () => {
      expect(offer({ offer: 0n, suitors: 30 }).requiredSalaryCents).toBe(STAR_ASK);
    });

    it("raises its price monotonically as suitors are added", () => {
      const required = [0, 1, 2, 3].map((suitors) =>
        Number(offer({ offer: 0n, suitors }).requiredSalaryCents),
      );
      for (let i = 1; i < required.length; i++) {
        expect(required[i]).toBeGreaterThan(required[i - 1]);
      }
    });

    it("treats a negative suitor count as no demand rather than inverting", () => {
      expect(offer({ offer: 0n, suitors: -5 }).requiredSalaryCents).toBe(
        offer({ offer: 0n, suitors: 0 }).requiredSalaryCents,
      );
    });
  });

  describe("minimum deals stay possible where they should be", () => {
    /**
     * Filling out the back of a roster with minimum contracts is the
     * legitimate use of the mechanism, and a 13-man roster floor would be
     * unmeetable without it.
     */
    it("lets a fringe player sign for the minimum when nobody else wants him", () => {
      const ask = 3_100_000_00n;
      expect(offer({ ask, offer: MINIMUM, suitors: 0, tier: "MINIMUM" }).accepted).toBe(true);
      expect(offer({ ask, offer: MINIMUM, suitors: 0, tier: "ROTATION" }).accepted).toBe(true);
    });

    it("stops being available at the minimum once a rival wants him", () => {
      const ask = 3_100_000_00n;
      expect(offer({ ask, offer: MINIMUM, suitors: 1, tier: "ROTATION" }).accepted).toBe(false);
    });

    it("does not extend the minimum-deal courtesy to a starter", () => {
      const ask = 15_000_000_00n;
      expect(offer({ ask, offer: MINIMUM, suitors: 0, tier: "STARTER" }).accepted).toBe(false);
    });

    it("never requires less than the league minimum", () => {
      // A player whose market value sits below the minimum still cannot be
      // signed for less than it.
      const decision = offer({ ask: 100_00n, offer: 0n, suitors: 0, tier: "MINIMUM" });
      expect(decision.requiredSalaryCents).toBe(MINIMUM);
    });
  });
});
