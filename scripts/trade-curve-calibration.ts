/**
 * Calibrates the trade-value curve against the two places the real market
 * gives a checkable ratio.
 *
 * `scoreToCapFraction` saturates because *salaries* have a CBA maximum. Trade
 * value does not, and reusing that curve compresses the whole league into a
 * 6.2x range (docs/audits/TRADE_AUDIT.md, T-P0-3).
 *
 * A single exponential cannot serve both ends: fitted to the pick chart it
 * needs k=0.203, which then makes a 99 worth 360x a 70. The required steepness
 * is ~0.20 around score 75 and ~0.04 around score 90 - i.e. the rate must
 * FALL with score. That is a logistic; the original shape was right and the
 * ceiling was what broke it. So: keep the logistic, refit its steepness and
 * midpoint to these two anchors, and scale it against a value unit instead of
 * a fraction of the cap.
 *
 * Reads only. Run: npx tsx scripts/trade-curve-calibration.ts
 */
import {
  expectedRatingForPick,
  expectedPotentialForPick,
  OVERALL_AT_PICK_1,
  OVERALL_AT_PICK_60,
  POTENTIAL_AT_PICK_1,
  POTENTIAL_AT_PICK_60,
} from "../src/lib/draft/generateDraftClass";
import { UPSIDE_WEIGHT } from "../src/lib/gm/playerTradeValue";

/**
 * ANCHOR 1: #1 overall is worth ~8x the #30 pick. Published draft-pick
 *   surplus-value charts differ on absolute numbers but agree closely here.
 * ANCHOR 2: an MVP-tier player is worth ~3x the #1 overall pick. Read off real
 *   superstar trades - a superstar returns roughly five first-rounders of
 *   mixed slot, and a #1 overall is worth roughly 1.7 mid-firsts.
 */
const TARGET_PICK1_OVER_PICK30 = 8;
const TARGET_MVP_OVER_PICK1 = 3;

/** Talent score after T-P0-1: rating + discounted upside, no age term. */
function talentScore(overall: number, potential: number): number {
  return overall + Math.max(0, potential - overall) * UPSIDE_WEIGHT;
}
function pickScore(pick: number): number {
  return talentScore(
    expectedRatingForPick(pick, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60),
    expectedPotentialForPick(pick, POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60),
  );
}

const s1 = pickScore(1);
const s30 = pickScore(30);
const sMvp = talentScore(98, 98);
console.log(
  `Talent scores:  #1 pick ${s1.toFixed(2)}   #30 pick ${s30.toFixed(2)}   MVP ${sMvp.toFixed(2)}`,
);

const logistic = (s: number, k: number, m: number) => 1 / (1 + Math.exp(-k * (s - m)));

let best = { k: 0, m: 0, err: Infinity };
for (let k = 0.05; k <= 0.6; k += 0.001) {
  for (let m = 60; m <= 100; m += 0.1) {
    const rPick = logistic(s1, k, m) / logistic(s30, k, m);
    const rMvp = logistic(sMvp, k, m) / logistic(s1, k, m);
    const err =
      ((rPick - TARGET_PICK1_OVER_PICK30) / TARGET_PICK1_OVER_PICK30) ** 2 +
      ((rMvp - TARGET_MVP_OVER_PICK1) / TARGET_MVP_OVER_PICK1) ** 2;
    if (err < best.err) best = { k, m, err };
  }
}
console.log(
  `\nBEST FIT  STEEPNESS k = ${best.k.toFixed(3)}   MIDPOINT m = ${best.m.toFixed(1)}   (rel. sq. err ${best.err.toFixed(5)})`,
);
console.log(
  `  #1:#30 = ${(logistic(s1, best.k, best.m) / logistic(s30, best.k, best.m)).toFixed(2)} (target ${TARGET_PICK1_OVER_PICK30})` +
    `   MVP:#1 = ${(logistic(sMvp, best.k, best.m) / logistic(s1, best.k, best.m)).toFixed(2)} (target ${TARGET_MVP_OVER_PICK1})`,
);

console.log("\nResulting spread (multiple of a 70-rated player with no upside):");
console.log(`${"SCORE".padStart(7)}${"x a 70".padStart(10)}`);
const base = logistic(70, best.k, best.m);
for (const s of [60, 65, 70, 75, 80, 85, 90, 95, 99]) {
  console.log(
    `${String(s).padStart(7)}${(logistic(s, best.k, best.m) / base).toFixed(2).padStart(10)}`,
  );
}

// Absolute scale: hold the #1 overall pick near its current $45.2M so the pick
// market does not move wholesale - only its internal spread changes.
const TARGET_PICK1_CENTS = 45.2 * 100_000_000;
const unit = TARGET_PICK1_CENTS / logistic(s1, best.k, best.m);
console.log(`\nVALUE UNIT that holds #1 overall at $45.2M: $${(unit / 100_000_000).toFixed(1)}M`);
console.log("\nWhat players are then worth (age-neutral, unpaid):");
for (const s of [65, 70, 75, 80, 85, 90, 95, 99]) {
  console.log(
    `${String(s).padStart(7)}  $${((unit * logistic(s, best.k, best.m)) / 100_000_000).toFixed(1)}M`,
  );
}
