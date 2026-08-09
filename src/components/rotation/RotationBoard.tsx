"use client";

import { useMemo, useState, useTransition } from "react";
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
import { PlayerChip } from "@/components/players/PlayerChip";
import { updateRotationAction } from "@/lib/actions/rotation";
import {
  MAX_ROTATION_SIZE,
  suggestedMinutesForRank,
  buildAutoRotation,
} from "@/lib/rotation/autoRotation";
import { rotationRoleLabel } from "@/lib/rotation/roleLabel";
import { getMoraleLevel, MORALE_LEVEL_LABEL, type MoraleLevel } from "@/lib/morale/moraleLevel";
import type { Position, InjuryStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/primitives";
import { ConfirmAction } from "@/components/ui/ConfirmAction";

export interface RotationPlayer {
  leaguePlayerId: string;
  fullName: string;
  photoUrl: string | null;
  position: Position;
  overallRating: number;
  injuryStatus: InjuryStatus;
  /** Server-resolved depth position at load time, null if not currently in the rotation. */
  rank: number | null;
  targetMinutesPerGame: number | null;
  /** Player Morale & Personality System - a role/minutes change here is the exact event this reacts to. */
  morale: number;
  tradeRequestActive: boolean;
  /**
   * Contract and ceiling. The Roster page is the canonical team view, so a
   * player's terms belong beside his role rather than a page away.
   *
   * Optional because the pre-game rotation setter inside a live playoff game
   * reuses this board, and what a player earns is irrelevant when you are
   * choosing who starts tonight - fetching it there would be wasted work.
   */
  potentialRating?: number;
  salary?: string | null;
  contractEndSeason?: number | null;
}

const MORALE_DOT_CLASS: Record<MoraleLevel, string> = {
  THRILLED: "bg-positive",
  CONTENT: "bg-positive/70",
  NEUTRAL: "bg-ink-muted",
  UNHAPPY: "bg-caution",
  DISGRUNTLED: "bg-negative",
};

function MoraleIndicator({
  morale,
  tradeRequestActive,
}: {
  morale: number;
  tradeRequestActive: boolean;
}) {
  const level = getMoraleLevel(morale);
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={tradeRequestActive ? "Has requested a trade" : MORALE_LEVEL_LABEL[level]}
    >
      <span className={`h-2 w-2 rounded-full ${MORALE_DOT_CLASS[level]}`} />
      {tradeRequestActive && (
        <span className="text-xs font-semibold text-negative">Trade Request</span>
      )}
    </span>
  );
}

const TEAM_MINUTES = 240;
const MIN_TOTAL_FOR_WARNING = 220;
const MAX_TOTAL_FOR_WARNING = 260;

/**
 * The real recommended order - best player per position starts, backfilled
 * by rating (same buildAutoRotation every CPU team already uses), not a
 * plain rating sort. Players beyond the 12-man rotation cap are appended
 * afterward in rating order so nobody just disappears from the list.
 */
function recommendedOrder(players: RotationPlayer[]): string[] {
  const simPlayers = players.map((p) => ({
    leaguePlayerId: p.leaguePlayerId,
    fullName: p.fullName,
    overallRating: p.overallRating,
    position: p.position,
    realStat: null,
  }));
  const inRotation = buildAutoRotation(simPlayers).map((e) => e.player.leaguePlayerId);
  const inRotationSet = new Set(inRotation);
  const overflow = [...players]
    .filter((p) => !inRotationSet.has(p.leaguePlayerId))
    .sort((a, b) => b.overallRating - a.overallRating)
    .map((p) => p.leaguePlayerId);
  return [...inRotation, ...overflow];
}

function initialOrder(players: RotationPlayer[]): string[] {
  const ranked = players
    .filter((p) => p.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
    .map((p) => p.leaguePlayerId);
  const unranked = players.filter((p) => p.rank === null).map((p) => p.leaguePlayerId);
  return [...ranked, ...unranked];
}

function SortableRow({
  player,
  rank,
  minutes,
  onMinutesChange,
  leagueId,
  teamPrimaryColor,
}: {
  player: RotationPlayer;
  rank: number;
  minutes: number;
  onMinutesChange: (value: number) => void;
  leagueId: string;
  teamPrimaryColor: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.leaguePlayerId,
  });
  const inRotation = rank < MAX_ROTATION_SIZE;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-[2px] border border-rule bg-field px-3 py-2 ${
        isDragging ? "opacity-50" : ""
      }`}
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
      <span className="w-6 text-right font-mono text-xs text-ink-muted">
        {inRotation ? rank + 1 : "-"}
      </span>
      <div className="min-w-0 flex-1">
        <PlayerChip
          identity={{ kind: "league", leagueId, leaguePlayerId: player.leaguePlayerId }}
          fullName={player.fullName}
          photoUrl={player.photoUrl}
          teamPrimaryColor={teamPrimaryColor}
          size="sm"
        />
      </div>
      <span className="w-10 shrink-0 text-xs text-ink-muted">{player.position}</span>
      {/* Rating and ceiling: the gap between them is what makes a young player
          worth minutes he has not earned yet. */}
      {player.potentialRating !== undefined && (
        <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-ink-muted">
          <span className="text-team-accent">{player.overallRating}</span>
          <span className="text-rule">/{player.potentialRating}</span>
        </span>
      )}
      <MoraleIndicator morale={player.morale} tradeRequestActive={player.tradeRequestActive} />
      {player.injuryStatus !== "HEALTHY" && (
        <span className="shrink-0 rounded-full bg-negative/15 px-2 py-0.5 text-xs font-semibold text-negative">
          Out
        </span>
      )}
      {/* What he costs and how long you have him - inseparable from whether
          his role is worth defending. */}
      {player.salary !== undefined && (
        <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-ink-muted">
          {player.salary ?? "-"}
          {player.contractEndSeason != null && (
            <span className="block text-[10px] text-rule">thru {player.contractEndSeason}</span>
          )}
        </span>
      )}
      <span className="w-28 shrink-0 text-right text-xs text-ink-muted">
        {inRotation ? rotationRoleLabel(rank) : "Out of Rotation"}
      </span>
      {inRotation ? (
        <label className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
          <input
            type="number"
            min={0}
            max={40}
            value={minutes}
            onChange={(e) =>
              onMinutesChange(Math.max(0, Math.min(40, Number(e.target.value) || 0)))
            }
            className="w-14 rounded border border-rule bg-raised px-1.5 py-1 text-right text-ink"
          />
          min
        </label>
      ) : (
        <span className="w-22 shrink-0" />
      )}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="pt-3 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
      {label}
    </div>
  );
}

export function RotationBoard({
  leagueId,
  teamPrimaryColor,
  players,
}: {
  leagueId: string;
  teamPrimaryColor: string | null;
  players: RotationPlayer[];
}) {
  const playerById = useMemo(() => new Map(players.map((p) => [p.leaguePlayerId, p])), [players]);
  const [order, setOrder] = useState<string[]>(() => initialOrder(players));
  const [minutes, setMinutes] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    order.forEach((id, i) => {
      if (i >= MAX_ROTATION_SIZE) return;
      const player = playerById.get(id);
      map[id] = player?.targetMinutesPerGame ?? suggestedMinutesForRank(i);
    });
    return map;
  });
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const total = order.slice(0, MAX_ROTATION_SIZE).reduce((sum, id) => sum + (minutes[id] ?? 0), 0);
  const totalIsUnbalanced = total < MIN_TOTAL_FOR_WARNING || total > MAX_TOTAL_FOR_WARNING;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      const next = arrayMove(current, oldIndex, newIndex);
      // A player dragged into/out of the top 12 needs a fresh minutes
      // default at their new position - explicit overrides elsewhere are
      // left alone.
      setMinutes((prevMinutes) => {
        const updated = { ...prevMinutes };
        next.forEach((id, i) => {
          if (i < MAX_ROTATION_SIZE && updated[id] === undefined) {
            updated[id] = suggestedMinutesForRank(i);
          }
          if (i >= MAX_ROTATION_SIZE) delete updated[id];
        });
        return updated;
      });
      return next;
    });
  }

  function fillOpenSlots() {
    setMinutes((prev) => {
      const updated = { ...prev };
      order.slice(0, MAX_ROTATION_SIZE).forEach((id, i) => {
        if (updated[id] === undefined) updated[id] = suggestedMinutesForRank(i);
      });
      return updated;
    });
  }

  /** Confirmation is owned by the ConfirmAction wrapping the button. */
  function resetToRecommended() {
    const recommended = recommendedOrder(players);
    setOrder(recommended);
    const updated: Record<string, number> = {};
    recommended.slice(0, MAX_ROTATION_SIZE).forEach((id, i) => {
      updated[id] = suggestedMinutesForRank(i);
    });
    setMinutes(updated);
  }

  function autoBalanceMinutes() {
    const inRotationIds = order.slice(0, MAX_ROTATION_SIZE);
    const currentSum = inRotationIds.reduce((sum, id) => sum + (minutes[id] ?? 0), 0);
    if (currentSum <= 0) return;
    const scaled = inRotationIds.map((id) =>
      Math.round(((minutes[id] ?? 0) / currentSum) * TEAM_MINUTES),
    );
    // Close the rounding gap on the highest-minute player, same convention allocateMinutes itself uses.
    const residual = TEAM_MINUTES - scaled.reduce((sum, m) => sum + m, 0);
    const highestIndex = scaled.indexOf(Math.max(...scaled));
    scaled[highestIndex] = Math.max(0, Math.min(40, scaled[highestIndex] + residual));

    const updated = { ...minutes };
    inRotationIds.forEach((id, i) => {
      updated[id] = Math.max(0, Math.min(40, scaled[i]));
    });
    setMinutes(updated);
  }

  function handleSave() {
    startTransition(async () => {
      const submission = order.slice(0, MAX_ROTATION_SIZE).map((leaguePlayerId) => ({
        leaguePlayerId,
        targetMinutesPerGame: minutes[leaguePlayerId] ?? null,
      }));
      await updateRotationAction(leagueId, submission);
      setLastResult("Rotation saved - it takes effect starting your next simulated games.");
    });
  }

  return (
    <div className="space-y-4">
      {/* THE WIRE - Workbench. The minute total is the verdict this surface
          builds toward, so it sits with the controls rather than below them. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-field p-4">
        <Button variant="secondary" onClick={fillOpenSlots}>
          Fill open slots
        </Button>
        {/* Was a native window.confirm() - the one pattern DeleteLeagueButton's
            own comment rejects as "jarringly inconsistent", and the only
            confirmation in the product on an action that is trivially undoable. */}
        <ConfirmAction
          variant="primary"
          label="Reset to recommended"
          confirmLabel="Reset the rotation"
          question="Reset the entire rotation to the recommended depth chart?"
          consequence="This overwrites your current starting five, bench order, and every minute target. Nothing is saved until you save, so you can still walk away."
          onConfirm={resetToRecommended}
        />
        <Button variant="secondary" onClick={autoBalanceMinutes}>
          Auto-balance minutes
        </Button>
        <div className="ml-auto text-right">
          <p
            className={`font-mono text-[15px] tabular-nums ${totalIsUnbalanced ? "text-caution" : "text-ink"}`}
          >
            {total} / 240 minutes assigned
          </p>
          {totalIsUnbalanced && (
            <p className="max-w-xs text-xs text-caution">
              Each player&apos;s target will be proportionally scaled to fit 240 team-minutes during
              games, so actual minutes may differ from what you entered - use Auto-balance to make
              this exact.
            </p>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {order.flatMap((id, i) => {
              const player = playerById.get(id);
              if (!player) return [];

              const divider =
                i === 0 ? (
                  <SectionDivider key={`divider-${i}`} label="Starting Five" />
                ) : i === 5 ? (
                  <SectionDivider key={`divider-${i}`} label="Bench Rotation" />
                ) : i === MAX_ROTATION_SIZE ? (
                  <SectionDivider key={`divider-${i}`} label="Out of Rotation" />
                ) : null;

              return [
                divider,
                <SortableRow
                  key={id}
                  player={player}
                  rank={i}
                  minutes={minutes[id] ?? suggestedMinutesForRank(i)}
                  onMinutesChange={(value) => setMinutes((prev) => ({ ...prev, [id]: value }))}
                  leagueId={leagueId}
                  teamPrimaryColor={teamPrimaryColor}
                />,
              ];
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="rounded-[2px] bg-team-accent px-5 py-2.5 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save Rotation"}
        </button>
        {lastResult && <p className="text-sm text-team-accent">{lastResult}</p>}
      </div>
    </div>
  );
}
