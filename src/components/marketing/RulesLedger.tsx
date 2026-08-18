/**
 * THE WIRE - what refuses your deal, said briefly.
 *
 * This was six clauses each with two lines of prose beneath it, which read as a
 * wall of text on a page whose job is to make someone want to play. The names
 * are the interesting part - "Stepien rule", "second apron" - because a visitor
 * who knows them recognises that this is the real thing, and one who does not
 * can see there is something to learn. The explanations belong in the guide,
 * which exists and is linked from the nav.
 *
 * Every label is a rejection the trade validator returns by name, so this is a
 * list of what the engine enforces rather than a claim about depth.
 */

const CLAUSES = [
  "Salary matching",
  "Second apron",
  "No-trade clause",
  "Stepien rule",
  "Exception eligibility",
  "Trade deadline",
];

export function RulesLedger() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Six ways a trade gets refused.
        </h2>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Most trade tools stop at salary matching. This one names the clause that killed your deal,
          then re-checks it on the server before anything is written.
        </p>

        <ul className="mt-10 flex flex-wrap gap-px border border-rule bg-rule">
          {CLAUSES.map((clause) => (
            <li
              key={clause}
              className="flex-1 bg-ground px-5 py-6 text-[11px] font-semibold tracking-[0.09em] whitespace-nowrap text-team-accent uppercase"
            >
              {clause}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
