import { describe, expect, it } from "vitest";
import { getPlayerValueTier } from "./playerValueTier";

describe("getPlayerValueTier", () => {
  it("classifies MVP-caliber ratings as Superstar", () => {
    expect(getPlayerValueTier(85)).toBe("SUPERSTAR");
    expect(getPlayerValueTier(80)).toBe("SUPERSTAR");
  });

  it("classifies All-Star-caliber ratings as Star", () => {
    expect(getPlayerValueTier(79)).toBe("STAR");
    expect(getPlayerValueTier(68)).toBe("STAR");
  });

  it("classifies quality-starter ratings as Starter", () => {
    expect(getPlayerValueTier(67)).toBe("STARTER");
    expect(getPlayerValueTier(55)).toBe("STARTER");
  });

  it("classifies bench ratings as Rotation Player", () => {
    expect(getPlayerValueTier(54)).toBe("ROTATION");
    expect(getPlayerValueTier(40)).toBe("ROTATION");
  });

  it("classifies deep-bench ratings as Minimum-Level Player", () => {
    expect(getPlayerValueTier(39)).toBe("MINIMUM");
    expect(getPlayerValueTier(0)).toBe("MINIMUM");
  });
});
