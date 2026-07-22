import { describe, expect, it } from "vitest";
import { describeFanReaction } from "./fanReactions";

describe("describeFanReaction", () => {
  it("returns a positive reaction for a signing", () => {
    const reaction = describeFanReaction({
      type: "SIGNING",
      description: "Bulls signed X to a 3-year deal",
    });
    expect(reaction?.tone).toBe("POSITIVE");
    expect(reaction?.text).toContain("Bulls signed X to a 3-year deal");
  });

  it("returns a positive reaction for an injury recovery, not the generic negative INJURY one", () => {
    const reaction = describeFanReaction({
      type: "INJURY",
      description: "X has been cleared to return from injury.",
    });
    expect(reaction?.tone).toBe("POSITIVE");
  });

  it("returns a negative reaction for a staff firing", () => {
    const reaction = describeFanReaction({
      type: "STAFF_FIRE",
      description: "Bulls fired X as Head Coach",
    });
    expect(reaction?.tone).toBe("NEGATIVE");
  });

  it("returns null for ownership messages - not a fan-facing story", () => {
    expect(
      describeFanReaction({ type: "OWNERSHIP_MESSAGE", description: "Ownership is thrilled." }),
    ).toBeNull();
  });

  it("returns null for an unknown transaction type", () => {
    expect(describeFanReaction({ type: "SOMETHING_NEW", description: "..." })).toBeNull();
  });
});
