import { describe, expect, it } from "vitest";
import { getPlayerValueTier } from "./playerValueTier";

describe("getPlayerValueTier", () => {
  it("classifies MVP-caliber ratings as Superstar", () => {
    expect(getPlayerValueTier(95)).toBe("SUPERSTAR");
    expect(getPlayerValueTier(90)).toBe("SUPERSTAR");
  });

  it("classifies All-Star-caliber ratings as Star", () => {
    expect(getPlayerValueTier(89)).toBe("STAR");
    expect(getPlayerValueTier(80)).toBe("STAR");
  });

  it("classifies quality-starter ratings as Starter", () => {
    expect(getPlayerValueTier(79)).toBe("STARTER");
    expect(getPlayerValueTier(72)).toBe("STARTER");
  });

  it("classifies bench ratings as Rotation Player", () => {
    expect(getPlayerValueTier(71)).toBe("ROTATION");
    expect(getPlayerValueTier(65)).toBe("ROTATION");
  });

  it("classifies deep-bench ratings as Minimum-Level Player", () => {
    expect(getPlayerValueTier(64)).toBe("MINIMUM");
    expect(getPlayerValueTier(60)).toBe("MINIMUM");
  });
});
