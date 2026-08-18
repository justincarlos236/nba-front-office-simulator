"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderDraftBoardAction } from "@/lib/actions/draft";
import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";
import type { DraftPickInfo, DraftProspectInfo } from "./types";

/**
 * "My Board" - the player's own ranked list (Scouting Pillar Redesign,
 * Phase 3 - docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.4), built from
 * bookmarked prospects in bookmark order. Distinct from the Big Board
 * (that's public consensus; this is the player's own call) and from the
 * pre-existing "Draft Board" component (`DraftBoard.tsx`, the live
 * results board of who's been drafted) - named "My Board" everywhere
 * user-facing specifically to avoid colliding with that established name.
 * This is what leads Draft Night once the lottery has run, instead of a
 * flat list of 60 strangers.
 */
function SortableRow({
  prospect,
  rank,
  isDrafted,
  canDraft,
  onOpenProfile,
  onDraft,
  isBusy,
}: {
  prospect: DraftProspectInfo;
  rank: number;
  isDrafted: boolean;
  canDraft: boolean;
  onOpenProfile: (id: string) => void;
  onDraft?: (id: string, fullName: string) => void;
  isBusy?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prospect.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-[2px] border border-rule bg-field px-3 py-2 ${
        isDragging ? "opacity-50" : ""
      } ${isDrafted ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none px-1 text-ink-muted hover:text-ink active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-muted">{rank}</span>
      <button
        type="button"
        onClick={() => onOpenProfile(prospect.id)}
        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-team-accent"
      >
        {prospect.fullName}
      </button>
      <span className="w-8 shrink-0 text-xs text-ink-muted">{prospect.position}</span>
      <span className="w-20 shrink-0 text-right text-xs text-ink-muted">
        {SCOUTING_DEPTH_LABEL[prospect.scoutingDepth] ?? "Unknown"}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-team-accent">
        {prospect.overallRating}
      </span>
      {isDrafted ? (
        <span className="shrink-0 text-xs text-ink-muted">Drafted</span>
      ) : (
        canDraft &&
        onDraft && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDraft(prospect.id, prospect.fullName)}
            className="shrink-0 rounded-[2px] bg-team-accent px-3 py-1 text-xs font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Draft
          </button>
        )
      )}
    </div>
  );
}

export function MyBoardSection({
  leagueId,
  boardProspects,
  picks,
  onOpenProfile,
  onReorder,
  canDraft,
  onDraft,
  isBusy,
}: {
  leagueId: string;
  /** In the player's own rank order - lowest index is the top target. */
  boardProspects: DraftProspectInfo[];
  /** Optional - Draft Night only, to grey out prospects another team has already taken. */
  picks?: DraftPickInfo[];
  onOpenProfile: (id: string) => void;
  /** Lets the parent keep its own copy in sync after a successful reorder. */
  onReorder: (newOrderedIds: string[]) => void;
  canDraft?: boolean;
  onDraft?: (id: string, fullName: string) => void;
  isBusy?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draftedProspectIds = new Set(
    (picks ?? []).filter((p) => p.selectedProspectId).map((p) => p.selectedProspectId!),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = boardProspects.map((p) => p.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    const nextOrder = arrayMove(currentIds, oldIndex, newIndex);

    onReorder(nextOrder);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await reorderDraftBoardAction(leagueId, nextOrder);
      } catch (err) {
        onReorder(currentIds);
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (boardProspects.length === 0) {
    return (
      <div className="rounded-[2px] border border-dashed border-rule bg-field p-6 text-center">
        <p className="text-sm text-ink">My Board is empty</p>
        <p className="mt-1 text-xs text-ink-muted">
          Bookmark prospects from the board below to start building your own ranking - the order you
          set here is what leads Draft Night.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <h2 className="font-semibold text-ink">My Board</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Drag to reorder. This is your call, not the Big Board&apos;s - it&apos;s what you&apos;ll
        see first once you&apos;re on the clock.
      </p>
      {errorMessage && <p className="mt-2 text-xs text-negative">{errorMessage}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={boardProspects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={`mt-4 space-y-1.5 ${isPending ? "opacity-70" : ""}`}>
            {boardProspects.map((prospect, i) => (
              <SortableRow
                key={prospect.id}
                prospect={prospect}
                rank={i + 1}
                isDrafted={draftedProspectIds.has(prospect.id)}
                canDraft={Boolean(canDraft)}
                onOpenProfile={onOpenProfile}
                onDraft={onDraft}
                isBusy={isBusy}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
