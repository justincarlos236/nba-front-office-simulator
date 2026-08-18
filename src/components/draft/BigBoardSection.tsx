"use client";

import type { BigBoardEntry } from "@/lib/draft/bigBoard";
import type { DraftProspectInfo } from "./types";
import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";

const DISPLAY_LIMIT = 20;

/**
 * Scouting Pillar Redesign (Phase 3) - the public consensus, ranked by
 * `publicEvaluation`, never by true rating (docs/SCOUTING_PILLAR_DESIGN.md
 * Part 3.1). Shown next to each prospect's own overallRating so the
 * disagreement is visible at a glance - "everyone else has him ranked too
 * low" only lands if the player can actually see the gap.
 */
export function BigBoardSection({
  board,
  prospectsById,
  tournamentRevealed,
  onOpenProfile,
}: {
  board: BigBoardEntry[];
  prospectsById: Map<string, DraftProspectInfo>;
  tournamentRevealed: boolean;
  onOpenProfile: (prospectId: string) => void;
}) {
  const top = board.slice(0, DISPLAY_LIMIT);
  const trueRankByProspectId = new Map(
    [...prospectsById.values()]
      .sort((a, b) => b.overallRating - a.overallRating)
      .map((p, i) => [p.id, i + 1]),
  );

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-semibold text-ink">The Big Board</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Public consensus - age, physical profile, competition level, and production. Never your
            own scouting, and never the truth.{" "}
            <HowDoesThisWork topic="big-board" className="underline hover:text-ink" />
          </p>
        </div>
        {tournamentRevealed && (
          <span className="shrink-0 rounded-full bg-team-accent/10 px-2.5 py-1 text-xs font-semibold text-team-accent">
            Tournament results are in
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {top.map((entry) => {
          const prospect = prospectsById.get(entry.prospectId);
          if (!prospect) return null;
          // Positive = the public board has him lower than his (always-
          // visible) overallRating would rank him - i.e. the class thinks
          // less of him than the raw number suggests; negative = the
          // opposite. Both sides of this comparison are things the player
          // can already see (the board, and his own rating) - this just
          // does the arithmetic, it never reveals anything Depth-gated.
          const trueRank = trueRankByProspectId.get(prospect.id) ?? entry.publicRank;
          const gap = entry.publicRank - trueRank;
          return (
            <button
              key={entry.prospectId}
              type="button"
              onClick={() => onOpenProfile(entry.prospectId)}
              className="flex w-full items-center gap-3 rounded-[2px] px-2 py-2 text-left text-sm transition hover:bg-raised"
            >
              <span className="w-6 shrink-0 text-right font-mono text-ink-muted">
                {entry.publicRank}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{prospect.fullName}</span>
              <span className="shrink-0 text-xs text-ink-muted">{prospect.position}</span>
              <span className="w-20 shrink-0 text-right text-xs text-ink-muted">
                {SCOUTING_DEPTH_LABEL[prospect.scoutingDepth] ?? "Unknown"}
              </span>
              {/* Always rendered, empty when there is no verdict. Hiding the
                  span let the columns either side slide right to fill on rows
                  without one, so a prospect with no gap sat visibly out of
                  line with every prospect that had one. */}
              <span
                className={`w-32 shrink-0 text-right text-xs font-semibold ${
                  gap > 0 ? "text-positive" : "text-negative"
                }`}
                title={
                  Math.abs(gap) >= 5
                    ? `Rating ${prospect.overallRating} would rank him #${trueRank}`
                    : undefined
                }
              >
                {Math.abs(gap) >= 5
                  ? gap > 0
                    ? `Rating says #${trueRank}`
                    : `Board favors him`
                  : null}
              </span>
            </button>
          );
        })}
      </div>
      {board.length > DISPLAY_LIMIT && (
        <p className="mt-3 text-center text-xs text-ink-muted">
          Showing the top {DISPLAY_LIMIT} of {board.length} - use the board below to browse the full
          class.
        </p>
      )}
    </div>
  );
}
