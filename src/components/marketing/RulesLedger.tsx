/**
 * THE WIRE - what the engine actually adjudicates.
 *
 * This replaces a 2x2 grid of same-size cards, each an icon-less heading over
 * three lines of prose. DESIGN.md names that shape directly in its Don'ts: "a
 * uniform card grid - that skeleton is the specific failure this world exists
 * to correct." The copy inside it was the matching failure, describing a
 * franchise simulator in words that would fit any franchise simulator.
 *
 * The product's own positioning says the rules *are* the product, so the page
 * shows the rules. Every clause below is one the trade validator returns by
 * name - SALARY_MATCHING, NO_AGGREGATION_AT_SECOND_APRON, NO_TRADE_CLAUSE,
 * STEPIEN_RULE, TRADE_DEADLINE_PASSED - and the exception tiers are the ones
 * `validateSigning` gates on apron position. Nothing here is a claim; it is a
 * list of what refuses a deal.
 *
 * Ruled rows rather than cards: a clause and its consequence, which is how a
 * cap sheet reads and the format this world is built from.
 */

interface Clause {
  /** The rule as the league names it. */
  label: string;
  /** What it refuses, in the user's terms. */
  effect: string;
}

const CLAUSES: Clause[] = [
  {
    label: "Salary matching",
    effect:
      "Over the cap, the salary coming back has to sit inside a band of the salary going out. Close is not close enough.",
  },
  {
    label: "Second apron",
    effect:
      "A club above it cannot combine two contracts to match one. Send a single salary that covers the return, or shed money first.",
  },
  {
    label: "No-trade clause",
    effect: "Some contracts do not move at all unless the player agrees to it.",
  },
  {
    label: "Stepien rule",
    effect:
      "You cannot leave the franchise without a first-round pick in consecutive years, however badly you want the player.",
  },
  {
    label: "Exception eligibility",
    effect:
      "Which mid-level exception you may sign with is decided by where you sit against the aprons, not by what you can afford.",
  },
  {
    label: "The deadline",
    effect: "Once it passes nothing moves until the season is over. Plan earlier next time.",
  },
];

export function RulesLedger() {
  return (
    <section className="border-b border-rule bg-field/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-tight text-ink">The rules are the product.</h2>
        <p className="mt-4 max-w-2xl text-ink-muted">
          Most trade tools stop at salary matching. This one keeps going, and it will tell you
          exactly which clause refused your deal.
        </p>

        {/* A ruled ledger, not cards. The clause sits in the label column the
            way it would on a cap sheet; the consequence reads as prose beside
            it. Stacks on narrow screens rather than squeezing two columns. */}
        <dl className="mt-12 border-t border-rule">
          {CLAUSES.map((clause) => (
            <div
              key={clause.label}
              className="grid grid-cols-1 gap-x-8 gap-y-1 border-b border-rule py-5 sm:grid-cols-[14rem_1fr]"
            >
              <dt className="text-[11px] font-semibold tracking-[0.09em] text-team-accent uppercase">
                {clause.label}
              </dt>
              <dd className="text-[15px] leading-relaxed text-ink-muted">{clause.effect}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-muted">
          The check that runs while you build the deal is the same one that runs again on the server
          before anything is written. A trade the builder calls legal cannot become illegal on its
          way to the database.
        </p>
      </div>
    </section>
  );
}
