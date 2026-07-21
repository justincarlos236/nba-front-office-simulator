import { describe, expect, it } from "vitest";
import { getJobSecurityLevel } from "./jobSecurity";

describe("getJobSecurityLevel", () => {
  it("buckets the full 0-100 range correctly", () => {
    expect(getJobSecurityLevel(100)).toBe("VERY_SECURE");
    expect(getJobSecurityLevel(85)).toBe("VERY_SECURE");
    expect(getJobSecurityLevel(84)).toBe("SECURE");
    expect(getJobSecurityLevel(70)).toBe("SECURE");
    expect(getJobSecurityLevel(69)).toBe("STABLE");
    expect(getJobSecurityLevel(50)).toBe("STABLE");
    expect(getJobSecurityLevel(49)).toBe("UNDER_PRESSURE");
    expect(getJobSecurityLevel(30)).toBe("UNDER_PRESSURE");
    expect(getJobSecurityLevel(29)).toBe("HOT_SEAT");
    expect(getJobSecurityLevel(15)).toBe("HOT_SEAT");
    expect(getJobSecurityLevel(14)).toBe("CRITICAL");
    expect(getJobSecurityLevel(0)).toBe("CRITICAL");
  });
});
