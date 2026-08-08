import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { CAREER_TITLE_LABEL, type CareerTitle } from "@/lib/gm/careerRecord";
import { ButtonLink, Label, StatCell } from "@/components/ui/primitives";

/**
 * THE WIRE - Broadcast, and the deepest frame break in the product.
 *
 * Being fired should be the most memorable moment in a save; the audit found
 * it rendered as a card with a red border. This is the one surface where the
 * interface goes **achromatic**: the team accent that has coloured every page
 * for fifteen seasons is simply gone, because you no longer have a team. Its
 * absence is the design.
 *
 * Retiring is the same structure with the opposite valence - you left on your
 * own terms, so the accent stays.
 */

export interface CareerEndRecapProps {
  endReason: "FIRED" | "RETIRED";
  teamLabel: string;
  seasons: number;
  wins: number;
  losses: number;
  championships: number;
  playoffAppearances: number;
  bestPlayoffFinish: string;
  careerEarningsCents: bigint | number;
  notableTradeDescription: string | null;
  finalOwnerConfidence: number;
  reputationDelta: number;
  newReputation: number;
  title: CareerTitle;
}

export function CareerEndRecap(props: CareerEndRecapProps) {
  const fired = props.endReason === "FIRED";
  const games = props.wins + props.losses;
  const winPct = games > 0 ? props.wins / games : 0;
  const deltaText = `${props.reputationDelta >= 0 ? "+" : ""}${props.reputationDelta}`;

  return (
    <main
      className="flex-1 pb-24"
      // The colour drain. On a firing the accent resolves to the system's own
      // muted rule value rather than the franchise's, so every accented element
      // on this page - and nothing else in the product - loses its team colour.
      style={
        fired
          ? ({ "--team-accent": "#748799", "--team-accent-ink": "#0b0f14" } as React.CSSProperties)
          : undefined
      }
    >
      <div className="mx-auto max-w-180 px-6 sm:px-8">
        <header className="border-b border-rule-strong pt-24 pb-12 text-center">
          <Label tone="accent">{fired ? "The end of the road" : "A tenure concludes"}</Label>
          <h1 className="mt-6 text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] font-bold tracking-[-0.02em] text-ink">
            {fired ? "Your tenure is over" : "You walked away"}
          </h1>
          <p className="mx-auto mt-6 max-w-[50ch] text-[clamp(1rem,1.8vw,1.25rem)] leading-relaxed text-ink-muted">
            {fired
              ? `Ownership has run out of patience. Your run with the ${props.teamLabel} is over.`
              : `You left the ${props.teamLabel} on your own terms.`}
          </p>
        </header>

        <section className="mt-16">
          <Label>The record</Label>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3">
            <StatCell label="Seasons" value={String(props.seasons)} size="display" />
            <StatCell
              label="Record"
              value={`${props.wins}-${props.losses}`}
              note={`${(winPct * 100).toFixed(1)}% winning`}
              size="display"
            />
            <StatCell
              label="Championships"
              value={String(props.championships)}
              size="display"
              tone={props.championships > 0 ? "accent" : "ink"}
            />
            <StatCell label="Playoff trips" value={String(props.playoffAppearances)} />
            <StatCell label="Best finish" value={props.bestPlayoffFinish} />
            <StatCell
              label="Career payroll"
              value={formatFinanceCents(props.careerEarningsCents)}
            />
          </div>
        </section>

        {props.notableTradeDescription && (
          <section className="mt-16 border-t border-rule pt-6">
            <Label>The move they&apos;ll remember</Label>
            <p className="mt-4 text-[clamp(1.125rem,2vw,1.5rem)] leading-snug text-ink">
              {props.notableTradeDescription}
            </p>
          </section>
        )}

        <section className="mt-16 border-t border-rule pt-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Label>Your reputation now</Label>
              <p className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-[clamp(2rem,4vw,3rem)] leading-none font-medium tabular-nums text-ink">
                  {props.newReputation}
                </span>
                <span
                  className={`font-mono text-[15px] tabular-nums ${
                    props.reputationDelta >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {deltaText}
                </span>
              </p>
            </div>
            <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
              {CAREER_TITLE_LABEL[props.title]}
            </p>
          </div>
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            {props.reputationDelta >= 0
              ? "This follows you. The next owner who calls will know what you did here."
              : "This follows you. It will be a harder sell the next time a job opens up."}
          </p>
        </section>

        <div className="mt-20 flex flex-wrap justify-center gap-3">
          <ButtonLink variant="secondary" href="/career">
            View your GM career
          </ButtonLink>
          <ButtonLink href="/leagues/new">Take a new job</ButtonLink>
        </div>
      </div>
    </main>
  );
}
