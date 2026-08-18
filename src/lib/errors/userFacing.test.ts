import { describe, expect, it } from "vitest";
import { toUserFacingError } from "./userFacing";

describe("toUserFacingError", () => {
  it("never returns the raw engine message as the summary", () => {
    const raw = "validateTrade: SECOND_APRON_AGGREGATION_PROHIBITED at index 2";
    const { summary } = toUserFacingError(new Error(raw));
    expect(summary).not.toContain("validateTrade");
    expect(summary).not.toContain("PROHIBITED");
  });

  it("marks a league-office ruling distinctly from a user mistake", () => {
    expect(toUserFacingError(new Error("second apron rule")).ruling).toBe(true);
    expect(toUserFacingError(new Error("Your roster is full")).ruling).toBeUndefined();
  });

  it("always offers a next step for the failures a user can act on", () => {
    const cases = [
      "second apron",
      "salary matching failed",
      "no-trade clause",
      "stepien rule",
      "not enough cap space",
      "roster is full",
    ];
    for (const message of cases) {
      expect(toUserFacingError(new Error(message)).remedy).toBeTruthy();
    }
  });

  it("falls back to a plain sentence for an unrecognised failure", () => {
    const { summary, remedy } = toUserFacingError(new Error("ECONNRESET"));
    expect(summary).toBe("That didn't go through.");
    expect(remedy).toContain("Nothing was changed");
  });

  it("handles non-Error throws without crashing", () => {
    expect(toUserFacingError("something").summary).toBeTruthy();
    expect(toUserFacingError(null).summary).toBeTruthy();
    expect(toUserFacingError(undefined).summary).toBeTruthy();
  });

  it("treats NEXT_REDIRECT as a non-error - it is how a successful action returns", () => {
    expect(toUserFacingError(new Error("NEXT_REDIRECT")).summary).toBe("That didn't go through.");
  });

  it("explains the apron block in cap terms rather than naming the rule constant", () => {
    const { summary, remedy } = toUserFacingError(new Error("SECOND_APRON"));
    expect(summary.toLowerCase()).toContain("second apron");
    expect(remedy?.toLowerCase()).toContain("aggregate");
  });
});

describe("an already-user-facing failure passes through", () => {
  it("returns a returned failure unchanged", () => {
    // Server actions report by returning, because a thrown message is redacted
    // in production. ErrorNotice takes `unknown` and must handle both forms.
    const returned = {
      summary: "Bismack Biyombo turned this down.",
      remedy: "He will sign for $6.1M per year. Raise your offer to at least that.",
    };
    expect(toUserFacingError(returned)).toBe(returned);
  });

  it("keeps a ruling flagged as one", () => {
    const ruling = { summary: "The second apron blocks this deal.", ruling: true };
    expect(toUserFacingError(ruling).ruling).toBe(true);
  });

  it("does not mistake an Error for one, since Error has no summary", () => {
    expect(toUserFacingError(new Error("second apron")).summary).toBe(
      "The second apron blocks this deal.",
    );
  });
});
