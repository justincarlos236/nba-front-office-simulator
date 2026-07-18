import { describe, expect, it } from "vitest";
import { formatCentsAsDollars, formatCentsCompact } from "./money";

describe("formatCentsAsDollars", () => {
  it("formats a large cap-hit-sized number with no decimals", () => {
    expect(formatCentsAsDollars(4_870_000_00n)).toBe("$4,870,000");
  });
});

describe("formatCentsCompact", () => {
  it("compacts millions", () => {
    expect(formatCentsCompact(48_700_000_00n)).toBe("$48.7M");
  });

  it("compacts thousands", () => {
    expect(formatCentsCompact(850_000_00n)).toBe("$850.0K");
  });

  it("leaves small amounts uncompacted", () => {
    expect(formatCentsCompact(500_00n)).toBe("$500");
  });
});
