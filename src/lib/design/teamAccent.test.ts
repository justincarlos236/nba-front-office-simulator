import { describe, expect, it } from "vitest";
import { contrastRatio, resolveTeamAccent } from "./teamAccent";
import { TEAM_SEEDS } from "../../../prisma/data/teams";

const GROUND = "#0b0f14";

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#000000", "#000000")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#f5b112", GROUND)).toBeCloseTo(contrastRatio(GROUND, "#f5b112"), 5);
  });
});

describe("resolveTeamAccent", () => {
  it("keeps a primary that already clears AA", () => {
    // Bright gold, comfortably legible on the ground.
    const accent = resolveTeamAccent("#FDBB30", "#000000");
    expect(accent.via).toBe("primary");
    expect(accent.hex).toBe("#FDBB30");
  });

  it("falls to the secondary when the primary is too dark", () => {
    // Cleveland: wine primary fails contrast, gold secondary carries real chroma.
    const accent = resolveTeamAccent("#860038", "#FDBB30");
    expect(accent.via).toBe("secondary");
    expect(accent.hex).toBe("#FDBB30");
  });

  it("lightens when both brand colours are too dark", () => {
    // Minnesota: navy primary, mid-blue secondary - neither clears AA.
    const accent = resolveTeamAccent("#0C2340", "#236192");
    expect(accent.via).toBe("lightened");
    expect(contrastRatio(accent.hex, GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves hue when lightening", () => {
    // A lightened navy must still read as blue, not drift to grey.
    const accent = resolveTeamAccent("#0C2340", "#0C2340");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.hex.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("picks readable ink for the accent", () => {
    const gold = resolveTeamAccent("#FDBB30", "#000000");
    expect(gold.inkHex).toBe("#0b0f14");
  });

  it("never throws on missing colours", () => {
    const accent = resolveTeamAccent(null, undefined);
    expect(contrastRatio(accent.hex, GROUND)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("every real NBA team resolves to a legible accent", () => {
  it("covers all 30 teams at AA or better", () => {
    expect(TEAM_SEEDS).toHaveLength(30);
    const failures = TEAM_SEEDS.filter((team) => {
      const accent = resolveTeamAccent(team.primaryColor, team.secondaryColor);
      return contrastRatio(accent.hex, GROUND) < 4.5;
    });
    expect(failures.map((t) => t.abbreviation)).toEqual([]);
  });

  it("keeps the accent readable against its own ink in every case", () => {
    for (const team of TEAM_SEEDS) {
      const accent = resolveTeamAccent(team.primaryColor, team.secondaryColor);
      expect(contrastRatio(accent.hex, accent.inkHex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("documents the cascade distribution so a data change is visible in review", () => {
    const byVia: Record<string, number> = {
      primary: 0,
      secondary: 0,
      lightened: 0,
      monochrome: 0,
    };
    for (const team of TEAM_SEEDS) {
      byVia[resolveTeamAccent(team.primaryColor, team.secondaryColor).via] += 1;
    }
    // Measured against the real seed data. If this changes, the team fixture
    // changed and the DESIGN.md intake note needs updating with it.
    expect(byVia).toEqual({ primary: 0, secondary: 13, lightened: 15, monochrome: 2 });
  });

  it("never paints a near-neutral as a franchise colour", () => {
    // Contrast alone let Brooklyn's white through at 19:1, which rendered the
    // franchise header as a blinding white slab. Legible is not the same as
    // being a team colour.
    const washedOut = ["#FFFFFF", "#C4CED4", "#EEE1C6", "#F2F5F7"];
    for (const team of TEAM_SEEDS) {
      const { hex } = resolveTeamAccent(team.primaryColor, team.secondaryColor);
      expect(washedOut).not.toContain(hex.toUpperCase());
    }
  });

  it("falls back to a stated neutral for a genuinely monochrome franchise", () => {
    // Brooklyn: black and white, no chroma anywhere.
    const accent = resolveTeamAccent("#000000", "#FFFFFF");
    expect(accent.via).toBe("monochrome");
    expect(contrastRatio(accent.hex, accent.inkHex)).toBeGreaterThanOrEqual(4.5);
  });
});
