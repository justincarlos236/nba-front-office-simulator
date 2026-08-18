import { describe, expect, it } from "vitest";
import { currentSeasonSalaryCents } from "../contracts/currentSeasonSalary";
import { formatCentsCompact } from "../money";
import { computeCapSheet } from "./capSheet";

/**
 * Test #8 of the display-vs-logic divergence sweep: the money a user sees for a
 * player's salary must be the same figure the cap engine does its math on.
 *
 * The whole family of bugs is a display path reading a different field than the
 * logic path beside it. For salary the concrete trap is `contract.years[0]`,
 * which is the current-season figure only when the query ordered or filtered
 * the years to put it first. When one path reads the season correctly and
 * another reads position 0, the roster shows one number and the cap sheet
 * counts another. These tests pin both paths to `currentSeasonSalaryCents` and
 * prove the pin has teeth against the array-position shortcut.
 */
describe("salary display and cap math read the same field", () => {
  const SEASON = 2026;

  // A full roster of multi-year contracts, each covering a past, the current,
  // and a future season, with the years intentionally NOT current-season-first.
  const roster = Array.from({ length: 13 }, (_, i) => ({
    playerId: `p${i}`,
    contract: {
      years: [
        { season: SEASON + 1, salaryCents: BigInt(9_000_000_00 + i * 100_000_00) },
        { season: SEASON, salaryCents: BigInt(6_000_000_00 + i * 100_000_00) },
        { season: SEASON - 1, salaryCents: BigInt(4_000_000_00 + i * 100_000_00) },
      ],
    },
  }));

  it("the displayed salary matches the cents the cap sheet summed for that player", () => {
    for (const player of roster) {
      const capMathCents = currentSeasonSalaryCents(player.contract, SEASON);
      const displayed = formatCentsCompact(currentSeasonSalaryCents(player.contract, SEASON));
      expect(displayed).toBe(formatCentsCompact(capMathCents));
    }
  });

  it("summed committed salary equals the sum of each player's displayed figure", () => {
    const capSheet = computeCapSheet({
      season: SEASON,
      contracts: roster.map((p) => ({
        playerId: p.playerId,
        salaryCents: currentSeasonSalaryCents(p.contract, SEASON),
      })),
    });

    const sumOfResolved = roster.reduce(
      (total, p) => total + currentSeasonSalaryCents(p.contract, SEASON),
      0n,
    );

    expect(capSheet.committedSalaryCents).toBe(sumOfResolved);
  });

  it("would diverge if either path fell back to years[0] (the bug this guards)", () => {
    // The array-position shortcut reads next season's salary here, so a cap
    // sheet built from years[0] disagrees with one built from the season lookup.
    const byArrayPosition = computeCapSheet({
      season: SEASON,
      contracts: roster.map((p) => ({
        playerId: p.playerId,
        salaryCents: p.contract.years[0].salaryCents,
      })),
    });
    const bySeason = computeCapSheet({
      season: SEASON,
      contracts: roster.map((p) => ({
        playerId: p.playerId,
        salaryCents: currentSeasonSalaryCents(p.contract, SEASON),
      })),
    });

    expect(byArrayPosition.committedSalaryCents).not.toBe(bySeason.committedSalaryCents);
  });
});
