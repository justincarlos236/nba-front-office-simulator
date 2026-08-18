/**
 * How a contract's salary moves across its years.
 *
 * **CPU deals were flat and user deals were a hardcoded 5%.** Every contract
 * written by `advanceSeasonAction` — CPU re-signings and CPU free-agent
 * signings alike — paid the identical figure every season, while
 * `generateContract` and `signFreeAgentAction` applied a flat 5% regardless of
 * which mechanism was used. See docs/audits/CONTRACT_AUDIT.md C-P2-3.
 *
 * That matters beyond cosmetics: a club's payroll in year three of a deal is
 * what decides whether it is over the apron, which decides which exceptions it
 * may use and whether it can absorb salary in a trade. Flat CPU contracts made
 * every CPU team's future cap position quietly too healthy.
 *
 * **The raise is a percentage of the FIRST year, not compounding.** That is the
 * actual CBA rule and it is what the existing `1 + 0.05 * i` shape already
 * expressed correctly — only the rate and its reach were wrong.
 *
 * > A correction to C-P2-3 as filed: it records "5% (Bird) / 8% (non-Bird)".
 * > The real rule is the other way round — 8% is the reward for re-signing with
 * > your own team's Bird rights, 5% is the ceiling for everyone else. This
 * > implements the real rule, not the finding as written.
 */
import type { ExceptionUsed } from "@/generated/prisma/client";

/** Re-signing with your own team's Bird rights earns the higher ceiling. */
export const BIRD_RIGHTS_MAX_RAISE = 0.08;

/** Cap space, mid-level exceptions and minimum deals all cap out here. */
export const STANDARD_MAX_RAISE = 0.05;

/**
 * The raise ceiling for a deal signed with this mechanism.
 *
 * Unknown mechanisms take the conservative 5%: mistakenly granting 8% would
 * inflate payrolls league-wide, while mistakenly granting 5% only understates
 * one deal.
 */
export function maxRaiseFor(signedUsing: ExceptionUsed | null | undefined): number {
  return signedUsing === "BIRD_RIGHTS" ? BIRD_RIGHTS_MAX_RAISE : STANDARD_MAX_RAISE;
}

/**
 * The salary for each year of a deal.
 *
 * Deals are written at the full raise rather than sampled somewhere below it.
 * Real contracts do vary, and declining deals are legal, but a distribution
 * over raise rates would be a number invented to look varied - and the raise a
 * team agrees to is a negotiating outcome this model does not simulate. The
 * maximum is at least the rule, and it is what an agent asks for.
 */
export function contractYearSalaries(
  firstYearSalaryCents: bigint,
  years: number,
  signedUsing: ExceptionUsed | null | undefined,
): bigint[] {
  const raise = maxRaiseFor(signedUsing);
  const first = Number(firstYearSalaryCents);
  return Array.from({ length: Math.max(1, Math.round(years)) }, (_, i) =>
    BigInt(Math.round(first * (1 + raise * i))),
  );
}

/**
 * A deal's average annual value.
 *
 * What a club is actually committing to, and therefore what its GM should be
 * judging. `evaluateReSigningDecision` scores value per dollar and has no
 * notion of term, so handing it a first-year figure understates an escalating
 * deal by 4% over two years and 16% over five - the club would be agreeing to
 * one number and paying another.
 */
export function averageAnnualValueCents(
  firstYearSalaryCents: bigint,
  years: number,
  signedUsing: ExceptionUsed | null | undefined,
): bigint {
  const schedule = contractYearSalaries(firstYearSalaryCents, years, signedUsing);
  const total = schedule.reduce((sum, salary) => sum + salary, 0n);
  return total / BigInt(schedule.length);
}
