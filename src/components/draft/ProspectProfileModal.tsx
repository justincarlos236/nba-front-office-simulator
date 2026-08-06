"use client";

import { useState, useTransition } from "react";
import { ProspectProfile } from "./ProspectProfile";
import type { DraftProspectInfo } from "./types";
import {
  assignFocusedLookAction,
  runPrivateWorkoutAction,
} from "@/lib/actions/scoutingAssignments";
import {
  MAX_SCOUTING_DEPTH,
  PRIVATE_WORKOUT_COST,
  checkFocusedLook,
  checkPrivateWorkout,
} from "@/lib/draft/scoutingAssignments";
import type { ResolvableHiddenAxis } from "@/lib/draft/scoutingProfile";

const WORKOUT_AXIS_LABEL: Record<ResolvableHiddenAxis, string> = {
  WORK_ETHIC: "Work ethic",
  INJURY_OUTLOOK: "Injury outlook",
};

export function ProspectProfileModal({
  leagueId,
  prospect,
  bigBoardRank,
  classSize,
  remainingAssignments,
  onClose,
  onDepthChange,
  onResolvedHiddenTraitsChange,
}: {
  leagueId: string;
  prospect: DraftProspectInfo;
  /** Scouting Pillar Redesign (Phase 3) - this prospect's rank on the public Big Board. Null if the caller doesn't compute one (e.g. Draft Night, where the board has already served its purpose). */
  bigBoardRank: number | null;
  classSize: number;
  /** Scouting Pillar Redesign (Phase 2) - assignments left in the whole pre-draft window's budget. */
  remainingAssignments: number;
  onClose: () => void;
  /** Lets the parent update its own local prospect list/remaining counter after a successful Focused Look. */
  onDepthChange: (prospectId: string, newDepth: number, newRemaining: number) => void;
  /** Scouting Pillar Redesign (Phase 4) - lets the parent sync a Private Workout's resolution and the new remaining budget. */
  onResolvedHiddenTraitsChange: (
    prospectId: string,
    resolvedHiddenTraits: string[],
    newRemaining: number,
  ) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorkoutPending, startWorkoutTransition] = useTransition();
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const check = checkFocusedLook(prospect.scoutingDepth, remainingAssignments);
  const resolvableAxes = (["WORK_ETHIC", "INJURY_OUTLOOK"] as const).filter(
    (axis) => !prospect.resolvedHiddenTraits.includes(axis),
  );
  const workoutCheck = checkPrivateWorkout(
    prospect.scoutingDepth,
    prospect.resolvedHiddenTraits.length,
    remainingAssignments,
  );

  function handleFocusedLook() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await assignFocusedLookAction(leagueId, prospect.id);
        onDepthChange(prospect.id, result.newDepth, result.remaining);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleWorkout(axis: ResolvableHiddenAxis) {
    setWorkoutError(null);
    startWorkoutTransition(async () => {
      try {
        const result = await runPrivateWorkoutAction(leagueId, prospect.id, axis);
        onResolvedHiddenTraitsChange(prospect.id, result.resolvedHiddenTraits, result.remaining);
      } catch (err) {
        setWorkoutError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <ProspectProfile prospect={prospect} bigBoardRank={bigBoardRank} classSize={classSize} />

        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            disabled={!check.allowed || isPending}
            onClick={handleFocusedLook}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending
              ? "Scouting..."
              : prospect.scoutingDepth >= MAX_SCOUTING_DEPTH
                ? "Fully scouted"
                : "Focused Look (1 assignment)"}
          </button>
          <p className="mt-1.5 text-center text-xs text-muted">
            {check.allowed
              ? `${remainingAssignments} assignment${remainingAssignments === 1 ? "" : "s"} remaining this window.`
              : check.reason}
          </p>
          {errorMessage && <p className="mt-2 text-center text-xs text-red-400">{errorMessage}</p>}
        </div>

        {resolvableAxes.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs tracking-wide text-muted uppercase">Private Workout</p>
            <p className="mt-1 text-xs text-muted">
              Resolve a hidden trait outright, no uncertainty - {PRIVATE_WORKOUT_COST} assignments
              per trait.
            </p>
            <div className="mt-2 flex gap-2">
              {resolvableAxes.map((axis) => (
                <button
                  key={axis}
                  type="button"
                  disabled={!workoutCheck.allowed || isWorkoutPending}
                  onClick={() => handleWorkout(axis)}
                  className="flex-1 rounded-lg border border-accent/40 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isWorkoutPending ? "Working out..." : `Resolve ${WORKOUT_AXIS_LABEL[axis]}`}
                </button>
              ))}
            </div>
            {!workoutCheck.allowed && (
              <p className="mt-1.5 text-center text-xs text-muted">{workoutCheck.reason}</p>
            )}
            {workoutError && (
              <p className="mt-2 text-center text-xs text-red-400">{workoutError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
