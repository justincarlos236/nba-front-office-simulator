import { DATASET_ROSTER_SEASON, seasonLabel } from "@/lib/data-sources/datasetSeasons";

/**
 * THE WIRE - the season as a spine, on the way in.
 *
 * The page had no answer to "what is a save actually like", and the product
 * already owns a shape for it: `SeasonRibbon` renders the same five phases as a
 * spine across the top of every league page. Borrowing that here means a
 * visitor meets the interface's own spatial idea before signing up, and
 * recognises it the moment they are inside.
 *
 * Deliberately static and unfilled. The ribbon in the product is a readout of
 * real progress; drawing a fake fill here would be inventing a save that does
 * not exist.
 *
 * Each phase carried a line of explanation and they came off: five paragraphs
 * under five labels turned the shape of a season into another block of prose,
 * and the shape was the point.
 *
 * The season is read from the shipped dataset rather than written down, so this
 * cannot drift the way four other labels on this site had already drifted.
 */

/** The five phases every save moves through, in order. */
const PHASES = ["Regular season", "Playoffs", "Pre-draft", "Draft", "Offseason"];

export function SeasonArc() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-tight text-ink">
          A season, end to end. Then the next one.
        </h2>
        <p className="mt-4 max-w-2xl text-ink-muted">
          Every save opens on the {seasonLabel(DATASET_ROSTER_SEASON)} league and moves away from it
          from the first decision. Nothing resets between seasons except the standings.
        </p>

        {/* The same five segments the league header carries, drawn unfilled -
            this is the shape of a season, not a readout of one.
            
            Stacks below `sm` rather than scrolling sideways. Five columns in
            390px clipped the last two phases at the edge, and a horizontal
            scroll with no affordance reads as broken layout rather than as
            something to swipe. Stacked, each phase keeps its own rule and the
            order still reads top to bottom. */}
        <ol className="mt-12 flex flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-px">
          {PHASES.map((phase) => (
            <li key={phase} className="min-w-0 sm:flex-1">
              <div className="h-2.5 bg-team-accent/25" />
              <p className="mt-3 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase">
                {phase}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
