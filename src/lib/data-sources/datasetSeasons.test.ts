import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATASET_ROSTER_SEASON, REFERENCE_STAT_SEASON, seasonLabel } from "./datasetSeasons";

/**
 * The seasons this build describes, pinned to the dataset it actually ships.
 *
 * **A hardcoded season does not fail loudly; it ages.** `PROFILE_SEASON` was
 * the literal `2023`, written when the dataset was 2023-24 and never revisited
 * when it moved to 2026-27 rosters. Because the earlier import's rows were
 * never deleted, the database still held 818 stat rows for 2023 beside 823 for
 * 2025 - so every query kept returning data, and nothing anywhere looked
 * broken. It was simply the wrong season.
 *
 * The reach is what makes this worth a test rather than a correction.
 * `leagueTeamStrength` selected a player's real baseline with that constant and
 * `boxScore.ts` builds its per-36 rate priors from that baseline, so every
 * simulated box score in the game was shaped by 2023-24 form. The player
 * profile priced market value with it too, against 2023-24 cap rules and an
 * age three years short.
 */

interface Manifest {
  version: string;
  seasonYear: number;
}

const dataset = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma/data/nbaDataset.json"), "utf8"),
) as { manifest: Manifest; players: { stats?: { season: number } | null }[] };

describe("the declared seasons match the shipped dataset", () => {
  it("takes the roster season from the manifest", () => {
    expect(DATASET_ROSTER_SEASON).toBe(dataset.manifest.seasonYear);
  });

  it("uses the season most players actually have stats for", () => {
    // Derived rather than asserted against a second literal: whichever season
    // the bulk of the dataset describes is the one a real-world baseline
    // should read. A re-import that shifts it fails here.
    const counts = new Map<number, number>();
    for (const player of dataset.players) {
      const season = player.stats?.season;
      if (season === undefined) continue;
      counts.set(season, (counts.get(season) ?? 0) + 1);
    }
    const [mostCommon] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    expect(REFERENCE_STAT_SEASON).toBe(mostCommon[0]);
  });

  it("keeps the baseline one behind the roster season", () => {
    // A roster season that has not been played yet cannot be anyone's
    // completed statistical record.
    expect(REFERENCE_STAT_SEASON).toBe(DATASET_ROSTER_SEASON - 1);
  });

  it("writes a season the way basketball does", () => {
    expect(seasonLabel(2025)).toBe("2025-26");
    expect(seasonLabel(1999)).toBe("1999-00");
    expect(seasonLabel(2009)).toBe("2009-10");
  });
});

/**
 * No season is written as a literal where it decides what data is loaded or
 * what the user is told the data is.
 *
 * Comments and imports are stripped first - a comment naming the season a
 * defect happened in is exactly where that belongs. `src/lib/cap/constants.ts`
 * is exempt because its literals *are* the data: the real CBA cap tables are
 * keyed by the season they were published for, and are not derived from
 * anything.
 */
const ROOTS = ["src/app", "src/components", "src/lib"];
const EXEMPT = [
  // The CBA cap tables, keyed by the season each was published for.
  "src/lib/cap/constants.ts",
  // Declares the constants; the literals here are the single source.
  "src/lib/data-sources/datasetSeasons.ts",
  // Real published payroll figures, cited for calibration.
  "src/lib/valuation/realPayrollShape.ts",
];

function sourceFilesUnder(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

function withoutCommentsAndImports(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Trailing `//` comments too, not only whole comment lines - a season
      // named in an explanatory aside beside code is documentation.
      .replace(/\/\/.*$/gm, "")
      .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?$/gm, "")
  );
}

/**
 * The 2023 CBA is an agreement, not a season.
 *
 * Marketing copy names it directly ("real 2023 CBA salary-cap rules") and that
 * year is a proper part of its name - it does not move when the dataset does.
 */
const NAMES_THE_AGREEMENT = /\b20\d{2}\s+CBA\b/;

const FILES = ROOTS.flatMap(sourceFilesUnder).filter(
  (file) => !EXEMPT.some((e) => file.endsWith(e.replace(/\//g, path.sep))),
);

describe("no season is hardcoded", () => {
  it("finds files to scan, so a broken walk cannot pass vacuously", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("never writes a modern season as a bare literal", () => {
    // 2023-2039. Narrow on purpose: this is about seasons, and a wider net
    // would catch array sizes, pixel values and cent amounts.
    const offenders: string[] = [];
    for (const file of FILES) {
      const stripped = withoutCommentsAndImports(readFileSync(file, "utf8"));
      for (const [index, line] of stripped.split("\n").entries()) {
        if (/\b20(2[3-9]|3[0-9])\b/.test(line) && !NAMES_THE_AGREEMENT.test(line)) {
          offenders.push(
            `${path.relative(process.cwd(), file).replace(/\\/g, "/")}:${index + 1}  ${line.trim()}`,
          );
        }
      }
    }
    expect(
      offenders,
      "Import DATASET_ROSTER_SEASON or REFERENCE_STAT_SEASON from " +
        "@/lib/data-sources/datasetSeasons instead. A hardcoded season does not " +
        "break when the dataset moves - it silently serves the wrong year.\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });
});
