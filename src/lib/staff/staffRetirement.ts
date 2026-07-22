/**
 * Same pure-function shape as `src/lib/development/retirement.ts`'s
 * player-retirement logic, but with its own age curve - real coaching
 * careers trend meaningfully longer than playing careers before a forced
 * retirement.
 */
const RETIREMENT_RISK_START_AGE = 65;
const FORCED_RETIREMENT_AGE = 78;
const AGE_RISK_PER_YEAR = 0.06;
const MAX_PROBABILITY = 0.95;

export function staffRetirementProbability(age: number): number {
  if (age >= FORCED_RETIREMENT_AGE) return 1;
  if (age < RETIREMENT_RISK_START_AGE) return 0;
  return Math.min(MAX_PROBABILITY, (age - RETIREMENT_RISK_START_AGE) * AGE_RISK_PER_YEAR);
}

export function shouldStaffRetire(age: number, rng: () => number): boolean {
  return rng() < staffRetirementProbability(age);
}
