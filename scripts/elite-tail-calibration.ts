/**
 * D-P2-1, the 85+ half - a joint sweep against four targets at once.
 *
 * `docs/audits/DEVELOPMENT_AUDIT.md` left one tier thin: 85+ stock measures 34.8
 * against a real 44, while 80+ and 90+ both sit where they should. That shape
 * is the constraint. A fix has to add mass in 85-89 **without** disturbing the
 * two tiers either side of it, and without breaking D-P1-2's pick-one bust
 * rate, which was itself fitted to 63.8% and is driven by the same machinery.
 *
 * Four targets, therefore, and a candidate has to satisfy all of them:
 *
 *   - realized 80+ per class ~ 9.1   (82 held / ~9.2 season careers)
 *   - realized 85+ per class ~ 5.5   (44 held / ~8.0 season careers)
 *   - realized 90+ per class ~ 2.0   (14 held / ~6.9 season careers)
 *   - pick one reaches 80+ ~ 63.8%   (D-P1-2, real 60-65%)
 *
 * The two knobs are the calibration seams `developPlayerRating` already
 * exposes, so this sweep exercises the real function rather than a copy of it.
 *
 * `reliabilityExponent` is the shaped one. Realization runs off
 * `reportQuality ^ k` with `reportQuality` in [0,1], so lowering `k` lifts the
 * middle of the potential range while leaving `reportQuality = 1` - the very
 * top - untouched. That is the exact shape 85-89 needs. `scoutingMissRate` is
 * then available to pull the pick-one rate back down if the exponent pushes it.
 *
 * Averaged over seeds, because single-seed class yields swing by more than the
 * gaps between candidates. Reads only, no database.
 * Run: npx tsx scripts/elite-tail-calibration.ts
 */
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";

/** Shipped values, so the sweep can report the status quo in its own terms. */
const CURRENT_EXPONENT = 2.25;
const CURRENT_MISS_RATE = 0.35;

const TARGET_80 = 9.1;
const TARGET_85 = 5.5;
const TARGET_90 = 2.0;
const TARGET_PICK_ONE = 0.638;

/** How far each target may drift before a candidate is disqualified. */
const TOL_80 = 0.9;
const TOL_85 = 0.7;
const TOL_90 = 0.5;
const TOL_PICK_ONE = 0.05;

const CLASSES_PER_SEED = 120;
const SEEDS = [4242, 20260818, 991];
const DEVELOP_TO_AGE = 28;

const line = (n = 96) => console.log("=".repeat(n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Measured {
  at80: number;
  at85: number;
  at90: number;
  pickOne80: number;
}

function measure(reliabilityExponent: number, scoutingMissRate: number): Measured {
  const at80: number[] = [];
  const at85: number[] = [];
  const at90: number[] = [];
  let pickOneHits = 0;
  let pickOneTotal = 0;

  for (const seed of SEEDS) {
    const rng = makeRng(seed);
    for (let t = 0; t < CLASSES_PER_SEED; t++) {
      const cls = generateDraftClass(rng);
      let c80 = 0;
      let c85 = 0;
      let c90 = 0;
      for (let i = 0; i < cls.prospects.length; i++) {
        const p = cls.prospects[i];
        const trait = developmentTraitFromId(`cal:${seed}:${t}:${i}`);
        let overall = p.overallRating;
        for (let age = p.age; age <= DEVELOP_TO_AGE; age++) {
          overall = developPlayerRating({
            overallRating: overall,
            potentialRating: p.potentialRating,
            age,
            rng,
            developmentTrait: trait,
            scoutingMissRate,
            reliabilityExponent,
          });
        }
        if (overall >= 80) c80 += 1;
        if (overall >= 85) c85 += 1;
        if (overall >= 90) c90 += 1;
        if (i === 0) {
          pickOneTotal += 1;
          if (overall >= 80) pickOneHits += 1;
        }
      }
      at80.push(c80);
      at85.push(c85);
      at90.push(c90);
    }
  }

  return {
    at80: mean(at80),
    at85: mean(at85),
    at90: mean(at90),
    pickOne80: pickOneHits / pickOneTotal,
  };
}

/** Normalised distance from every target, so no one target dominates. */
function score(m: Measured): number {
  return (
    Math.abs(m.at80 - TARGET_80) / TOL_80 +
    Math.abs(m.at85 - TARGET_85) / TOL_85 +
    Math.abs(m.at90 - TARGET_90) / TOL_90 +
    Math.abs(m.pickOne80 - TARGET_PICK_ONE) / TOL_PICK_ONE
  );
}

const fits = (m: Measured) =>
  Math.abs(m.at80 - TARGET_80) <= TOL_80 &&
  Math.abs(m.at85 - TARGET_85) <= TOL_85 &&
  Math.abs(m.at90 - TARGET_90) <= TOL_90 &&
  Math.abs(m.pickOne80 - TARGET_PICK_ONE) <= TOL_PICK_ONE;

line();
console.log("ELITE TAIL - JOINT SWEEP, FOUR TARGETS");
line();
console.log(
  `  targets: 80+ ${TARGET_80} (+-${TOL_80}), 85+ ${TARGET_85} (+-${TOL_85}), ` +
    `90+ ${TARGET_90} (+-${TOL_90}), pick1 ${(TARGET_PICK_ONE * 100).toFixed(1)}% (+-${TOL_PICK_ONE * 100}pp)`,
);
console.log(`  ${CLASSES_PER_SEED} classes x ${SEEDS.length} seeds per grid point.\n`);

const baseline = measure(CURRENT_EXPONENT, CURRENT_MISS_RATE);
console.log(
  `  shipped (exp ${CURRENT_EXPONENT}, miss ${CURRENT_MISS_RATE}): ` +
    `80+ ${baseline.at80.toFixed(2)}, 85+ ${baseline.at85.toFixed(2)}, ` +
    `90+ ${baseline.at90.toFixed(2)}, pick1 ${(baseline.pickOne80 * 100).toFixed(1)}%  ` +
    `score ${score(baseline).toFixed(2)}${fits(baseline) ? "  FITS" : ""}\n`,
);

const EXPONENTS = [1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
const MISS_RATES = [0.3, 0.35, 0.4, 0.45, 0.5];

console.log(
  `${"EXP".padStart(6)}${"MISS".padStart(7)}${"80+".padStart(8)}${"85+".padStart(8)}` +
    `${"90+".padStart(8)}${"PICK1".padStart(9)}${"SCORE".padStart(9)}${"".padStart(7)}`,
);

let best: { exp: number; miss: number; m: Measured; s: number } | null = null;
const fitting: { exp: number; miss: number; m: Measured; s: number }[] = [];

for (const exp of EXPONENTS) {
  for (const miss of MISS_RATES) {
    const m = measure(exp, miss);
    const s = score(m);
    const ok = fits(m);
    if (ok) fitting.push({ exp, miss, m, s });
    if (!best || s < best.s) best = { exp, miss, m, s };
    console.log(
      `${exp.toFixed(2).padStart(6)}${miss.toFixed(2).padStart(7)}` +
        `${m.at80.toFixed(2).padStart(8)}${m.at85.toFixed(2).padStart(8)}` +
        `${m.at90.toFixed(2).padStart(8)}${`${(m.pickOne80 * 100).toFixed(1)}%`.padStart(9)}` +
        `${s.toFixed(2).padStart(9)}${(ok ? "  FITS" : "").padStart(7)}`,
    );
  }
}

line();
console.log(`  candidates satisfying ALL FOUR targets: ${fitting.length}`);
if (fitting.length === 0) {
  console.log(`\n  NO FIT. The four targets are not simultaneously reachable with these two`);
  console.log(`  knobs over this grid, which means the shape is wrong rather than the`);
  console.log(`  constants - do not ship a compromise that misses a target.`);
} else {
  for (const f of [...fitting].sort((a, b) => a.s - b.s)) {
    console.log(`    exp ${f.exp.toFixed(2)}  miss ${f.miss.toFixed(2)}  score ${f.s.toFixed(2)}`);
  }
}
if (best) {
  const onEdge =
    best.exp === EXPONENTS[0] ||
    best.exp === EXPONENTS[EXPONENTS.length - 1] ||
    best.miss === MISS_RATES[0] ||
    best.miss === MISS_RATES[MISS_RATES.length - 1];
  console.log(
    `\n  best by score: exp ${best.exp.toFixed(2)}, miss ${best.miss.toFixed(2)}` +
      `${onEdge ? "  <- ON THE GRID BOUNDARY, that is not a fit" : ""}`,
  );
}
line();
