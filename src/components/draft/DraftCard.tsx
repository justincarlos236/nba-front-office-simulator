import { resolveTeamAccent } from "@/lib/design/teamAccent";
import { Artifact } from "@/components/ui/Artifact";

/**
 * THE WIRE - Artifact. The pick as the card handed to the podium.
 *
 * A draft selection is announced from a physical card: team, round, pick
 * number, name. It is one of the most recognisable objects in the sport and
 * the product rendered it as a row of text.
 *
 * The drafting team's own colour bands the card, so a pick reads as belonging
 * to a franchise rather than to a table. Every field is real draft state.
 */
export function DraftCard({
  playerName,
  teamCity,
  teamName,
  primaryColor,
  secondaryColor,
  round,
  overallPickNumber,
  season,
  /** Where the pick came from, when it was acquired in a trade. */
  viaTeamLabel,
  className = "",
}: {
  playerName: string;
  teamCity: string;
  teamName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  round: number;
  overallPickNumber: number;
  season: number;
  viaTeamLabel?: string | null;
  className?: string;
}) {
  const accent = resolveTeamAccent(primaryColor, secondaryColor);

  return (
    <Artifact tone="paper" className={className}>
      {/* The franchise band. A draft card is the team's card. */}
      <div
        className="flex items-baseline justify-between gap-4 px-5 py-3"
        style={{ backgroundColor: accent.hex, color: accent.inkHex }}
      >
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase">
          {teamCity} {teamName}
        </p>
        <p className="font-mono text-[11px] tabular-nums" style={{ opacity: 0.8 }}>
          {season}
        </p>
      </div>

      <div className="px-5 py-5">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          Round {round} · Pick {overallPickNumber}
        </p>
        <p className="mt-3 text-[clamp(1.375rem,2.6vw,1.875rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
          {playerName}
        </p>
        {viaTeamLabel && (
          <p className="mt-2 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
            via {viaTeamLabel}
          </p>
        )}
      </div>

      {/* The tear-off strip along the foot, as on a real card stock. */}
      <div className="border-t border-dashed border-rule px-5 py-2">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-muted uppercase">
          Official selection
        </p>
      </div>
    </Artifact>
  );
}
