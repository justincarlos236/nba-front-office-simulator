"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startArenaRenovationAction,
  startArenaNewBuildNegotiationAction,
} from "@/lib/actions/capitalProjects";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { capitalProjectCostCents, CAPITAL_PROJECT_LABEL } from "@/lib/finances/capitalProjects";
import type { CapitalProjectKind } from "@/generated/prisma/client";

export function ArenaCard({
  leagueId,
  arenaQualityIndex,
  arenaAgeSeasons,
  arenaLeaseExpiresSeason,
  currentSeason,
  inProgressProject,
  negotiationPending,
}: {
  leagueId: string;
  arenaQualityIndex: number;
  arenaAgeSeasons: number;
  arenaLeaseExpiresSeason: number;
  currentSeason: number;
  inProgressProject: { kind: CapitalProjectKind; completionSeason: number } | null;
  negotiationPending: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const disabled = isPending || !!inProgressProject || negotiationPending;

  function renovate() {
    startTransition(async () => {
      await startArenaRenovationAction(leagueId);
      router.refresh();
    });
  }

  function negotiate() {
    startTransition(async () => {
      await startArenaNewBuildNegotiationAction(leagueId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs tracking-wide text-muted uppercase">Arena</p>
      <div className="mt-2 grid grid-cols-3 gap-4">
        <div>
          <p className="text-lg font-bold text-foreground tabular-nums">{arenaQualityIndex}/100</p>
          <p className="text-xs text-muted">Quality</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground tabular-nums">{arenaAgeSeasons}</p>
          <p className="text-xs text-muted">Seasons old</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground tabular-nums">
            {arenaLeaseExpiresSeason > 0
              ? Math.max(0, arenaLeaseExpiresSeason - currentSeason)
              : "—"}
          </p>
          <p className="text-xs text-muted">Years left on lease</p>
        </div>
      </div>

      {inProgressProject && (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {CAPITAL_PROJECT_LABEL[inProgressProject.kind]} underway - complete in{" "}
          {inProgressProject.completionSeason}.
        </p>
      )}
      {negotiationPending && !inProgressProject && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Negotiating with the city over a new arena - check the Front Office Inbox.
        </p>
      )}

      {!inProgressProject && !negotiationPending && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={renovate}
            disabled={disabled}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Renovate ({formatFinanceCents(capitalProjectCostCents("ARENA_RENOVATION"))})
          </button>
          <button
            type="button"
            onClick={negotiate}
            disabled={disabled}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Negotiate a new arena with the city
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Renovating is a direct purchase; a new arena requires winning over the city first - see the
        Front Office Inbox once you start.
      </p>
    </div>
  );
}
