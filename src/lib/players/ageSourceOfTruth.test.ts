import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One source of truth for a player's age and experience.
 *
 * `estimateAge` and `estimateExperience` are *fallbacks*, meant to be reached
 * only from inside `resolvePlayerAge` / `resolvePlayerExperience` when the
 * better source is missing. They are not a caller's choice, and calling them
 * directly is always a bug - a silent one, because they return a plausible
 * number rather than throwing.
 *
 * **This is the shape of three separate defects found in one afternoon**, all
 * the same: a display path reading different data from the logic path beside
 * it.
 *
 *   - the retirement list printed `estimateAge(draftYear, ...)` while the
 *     retirement itself was decided on `resolvePlayerAge`. LeBron James was
 *     shown retiring at 45, four years past a forced-retirement age of 41, and
 *     Gary Payton II at 27, six years below where risk even begins - that one
 *     was `estimateAge`'s flat fallback of 27 for a missing draft year. 13 of
 *     16 retirees were displayed wrong.
 *   - the trade builder passed the same guess into `computePlayerTradeValue`,
 *     which curves value by age. That was not a label being wrong; it was
 *     every trade priced off an age the rest of the app disagreed with.
 *   - the dashboard and fans page averaged it into team age.
 *
 * A unit test of either function would have passed in all three cases, because
 * neither function was broken. What was wrong was which one got called, and
 * that is only visible from outside. Hence a source scan rather than a
 * behavioural test.
 *
 * If a caller genuinely has no `birthDate` in scope, the fix is to select it,
 * not to reach past the resolver.
 */

const ROOTS = ["src/app", "src/components"];
const BANNED = ["estimateAge", "estimateExperience"] as const;

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

const FILES = ROOTS.flatMap(sourceFilesUnder);

describe("age and experience have one source of truth", () => {
  it("finds files to scan, so a broken glob cannot pass vacuously", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(BANNED)("never calls %s directly from a page or component", (banned) => {
    const offenders = FILES.filter((file) =>
      new RegExp(`\\b${banned}\\s*\\(`).test(readFileSync(file, "utf8")),
    ).map((file) => path.relative(process.cwd(), file).replace(/\\/g, "/"));

    expect(
      offenders,
      `${banned} is a fallback inside resolvePlayerAge/resolvePlayerExperience, ` +
        `not something a page should call. Use the resolver so the value matches ` +
        `what the simulation logic uses. Offenders:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
