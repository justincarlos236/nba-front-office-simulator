import { describe, expect, it } from "vitest";
import { computeTransactionSentiment, type SentimentTransaction } from "./transactionSentiment";

function txn(overrides: Partial<SentimentTransaction>): SentimentTransaction {
  return {
    type: "SIGNING",
    importance: "STANDARD",
    description: "...",
    ...overrides,
  };
}

describe("computeTransactionSentiment", () => {
  it("is zero with no transactions", () => {
    expect(computeTransactionSentiment([])).toBe(0);
  });

  it("is positive for a championship-caliber award story", () => {
    const total = computeTransactionSentiment([txn({ type: "AWARD", importance: "MAJOR" })]);
    expect(total).toBeGreaterThan(0);
  });

  it("is negative for a breaking staff firing", () => {
    const total = computeTransactionSentiment([
      txn({ type: "STAFF_FIRE", importance: "BREAKING" }),
    ]);
    expect(total).toBeLessThan(0);
  });

  it("weighs BREAKING stories more heavily than MINOR ones of the same type", () => {
    const minor = computeTransactionSentiment([txn({ type: "SIGNING", importance: "MINOR" })]);
    const breaking = computeTransactionSentiment([
      txn({ type: "SIGNING", importance: "BREAKING" }),
    ]);
    expect(breaking).toBeGreaterThan(minor);
  });

  it("ignores ownership messages entirely", () => {
    expect(
      computeTransactionSentiment([txn({ type: "OWNERSHIP_MESSAGE", importance: "BREAKING" })]),
    ).toBe(0);
  });

  it("sums across multiple transactions", () => {
    const total = computeTransactionSentiment([
      txn({ type: "SIGNING", importance: "STANDARD" }),
      txn({ type: "INJURY", importance: "STANDARD", description: "X suffers a groin strain." }),
    ]);
    expect(total).toBeCloseTo(0.6 - 0.4);
  });

  it("treats an injury recovery as positive, not negative like a fresh injury", () => {
    const freshInjury = computeTransactionSentiment([
      txn({ type: "INJURY", description: "X suffers a groin strain, expected to miss 5 games." }),
    ]);
    const recovery = computeTransactionSentiment([
      txn({ type: "INJURY", description: "X has been cleared to return from injury." }),
    ]);
    expect(freshInjury).toBeLessThan(0);
    expect(recovery).toBeGreaterThan(0);
  });

  it("reads rotation-change direction from the description, not a single fixed sentiment", () => {
    const promotion = computeTransactionSentiment([
      txn({ type: "ROTATION_CHANGE", description: "X earns a spot in the Bulls starting lineup" }),
    ]);
    const demotion = computeTransactionSentiment([
      txn({ type: "ROTATION_CHANGE", description: "X moves to the bench for the Bulls" }),
    ]);
    expect(promotion).toBeGreaterThan(0);
    expect(demotion).toBeLessThan(0);
  });
});
