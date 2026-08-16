/**
 * The rookie salary scale — what a first-round pick earns, by slot.
 *
 * **Rookie contracts used to ignore where a player was drafted.**
 * `rookieScaleDiscount` keys off years of service alone, so every rookie took
 * the identical 0.35 multiplier and slot mattered only through the small rating
 * difference the draft curve produces. Measured, that put the first pick on
 * $6.5M — 4.0% of the cap against a real 8.1% — while the sixtieth was about
 * right. See docs/SALARY_SYSTEM_AUDIT.md P1-2.
 *
 * The real scale is steeply slot-dependent: the first pick earns roughly 4.6x
 * the thirtieth. Flattening it made the top of the draft cheaper than it should
 * be, which compounds with `docs/DRAFT_AUDIT.md`'s pick valuation — a high pick
 * was already the best asset in the game and this made it better.
 *
 * **First round only.** Real second-round picks have no scale at all; they
 * negotiate, and almost all land at or near the minimum. `rookieScaleFraction`
 * returns null for them so the caller falls back to ordinary pricing, which
 * already floors at the veteran minimum.
 *
 * Expressed as fractions of the salary cap rather than dollars, because the
 * scale is set as a percentage of the cap and therefore tracks it
 * automatically — the same reason `veteranMinimum.ts` is written that way.
 */

/**
 * Published 2025-26 first-year rookie-scale salaries, as fractions of that
 * season's $154.647M cap. Anchors only; slots between them interpolate.
 *
 * These are approximations of the published table, accurate to about a tenth of
 * a percentage point of the cap. The scale's *shape* is what matters here — a
 * steep drop through the lottery flattening out late — and the shape is exact.
 */
const ROOKIE_SCALE_ANCHORS: readonly (readonly [pick: number, fractionOfCap: number])[] = [
  [1, 0.0807],
  [2, 0.0722],
  [3, 0.065],
  [5, 0.0531],
  [8, 0.0423],
  [10, 0.0372],
  [14, 0.0302],
  [20, 0.023],
  [25, 0.0194],
  [30, 0.0174],
];

/** Picks beyond this have no scale - the real second round negotiates. */
export const LAST_ROOKIE_SCALE_PICK = 30;

/**
 * Real rookie deals run four years: two guaranteed plus two team options. The
 * options are not modelled, but the term is, because a four-year cheap contract
 * is the entire reason a high pick is a valuable asset.
 */
export const ROOKIE_CONTRACT_YEARS = 4;

/**
 * This pick's first-year salary as a fraction of the cap, or `null` for a
 * second-round pick who has no scale.
 *
 * Linear between anchors. A non-integer or out-of-range pick clamps into the
 * first round rather than throwing - a bad slot must not produce a free
 * contract or a crash on draft night.
 */
export function rookieScaleFraction(overallPickNumber: number): number | null {
  if (!Number.isFinite(overallPickNumber)) return null;
  const pick = Math.round(overallPickNumber);
  if (pick > LAST_ROOKIE_SCALE_PICK) return null;
  if (pick <= ROOKIE_SCALE_ANCHORS[0][0]) return ROOKIE_SCALE_ANCHORS[0][1];

  for (let i = 1; i < ROOKIE_SCALE_ANCHORS.length; i++) {
    const [hiPick, hiFraction] = ROOKIE_SCALE_ANCHORS[i];
    if (pick > hiPick) continue;
    const [loPick, loFraction] = ROOKIE_SCALE_ANCHORS[i - 1];
    const t = (pick - loPick) / (hiPick - loPick);
    return loFraction + t * (hiFraction - loFraction);
  }
  return ROOKIE_SCALE_ANCHORS[ROOKIE_SCALE_ANCHORS.length - 1][1];
}

/** This pick's first-year salary in cents, or `null` outside the first round. */
export function rookieScaleSalaryCents(
  overallPickNumber: number,
  salaryCapCents: bigint,
): bigint | null {
  const fraction = rookieScaleFraction(overallPickNumber);
  if (fraction === null) return null;
  return BigInt(Math.round(Number(salaryCapCents) * fraction));
}
