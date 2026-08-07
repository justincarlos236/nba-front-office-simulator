import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import type { DraftResolutionSummary } from "@/lib/draft/draftResolution";

const AXIS_LABEL: Record<"WORK_ETHIC" | "INJURY_OUTLOOK", string> = {
  WORK_ETHIC: "Work ethic",
  INJURY_OUTLOOK: "Injury outlook",
};

/**
 * Post-Draft Resolution (Scouting Pillar Redesign, Phase 5 -
 * docs/SCOUTING_PILLAR_DESIGN.md Part 3.5). Shown once, right when the
 * user's own pick resolves in `PickRevealStage`. Deliberately a receipt
 * for what you knew, never a grade on whether the pick was right -
 * potentialRating and any bust/steal verdict are absent by design. Whether
 * this pick pans out is for player development to answer, over real
 * seasons, the same way it does for every other player.
 */
export function DraftResolutionCard({ summary }: { summary: DraftResolutionSummary }) {
  return (
    <div className="animate-lottery-banner-in mt-3 w-full max-w-sm rounded-lg border border-border bg-surface-2 p-4 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          What You Knew Going In
        </p>
        <HowDoesThisWork
          topic="draft-resolution"
          className="text-xs text-muted underline hover:text-foreground"
        />
      </div>
      <div className="mt-2 space-y-1.5 text-xs text-foreground">
        <p>
          <span className="text-muted">Scouted to:</span> {summary.depthLabel}
        </p>
        {summary.myBoardRank != null ? (
          <p>
            <span className="text-muted">Your board had him:</span> #{summary.myBoardRank}
            {summary.rankGapFromBigBoard != null && summary.rankGapFromBigBoard !== 0 && (
              <span className="text-muted">
                {" "}
                ({summary.rankGapFromBigBoard > 0 ? "higher" : "lower"} than the Big Board&apos;s #
                {summary.bigBoardRank})
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted">You never added him to your own board.</p>
        )}
        {summary.resolvedAxes.length > 0 && (
          <p>
            <span className="text-muted">Resolved:</span>{" "}
            {summary.resolvedAxes.map((axis) => AXIS_LABEL[axis]).join(", ")}
          </p>
        )}
        {summary.unresolvedAxes.length > 0 && (
          <p className="text-muted">
            Never got a read on: {summary.unresolvedAxes.map((axis) => AXIS_LABEL[axis]).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
