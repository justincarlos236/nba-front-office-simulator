"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startBusinessExpansionProjectAction } from "@/lib/actions/capitalProjects";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import {
  capitalProjectCostCents,
  CAPITAL_PROJECT_LABEL,
  CAPITAL_PROJECT_DESCRIPTION,
  BUSINESS_EXPANSION_PROJECT_KINDS,
} from "@/lib/finances/capitalProjects";
import type { CapitalProjectKind } from "@/generated/prisma/client";

export function BusinessExpansionCard({
  leagueId,
  inProgressProject,
  completedKinds,
}: {
  leagueId: string;
  inProgressProject: { kind: CapitalProjectKind; completionSeason: number } | null;
  completedKinds: CapitalProjectKind[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const completedSet = new Set(completedKinds);

  function start(kind: CapitalProjectKind) {
    startTransition(async () => {
      await startBusinessExpansionProjectAction(leagueId, kind);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[2px] border border-rule bg-field p-5">
      <p className="text-xs tracking-wide text-ink-muted uppercase">Business Expansion</p>
      {inProgressProject && (
        <p className="mt-2 rounded-[2px] bg-team-accent/10 px-3 py-2 text-sm text-team-accent">
          {CAPITAL_PROJECT_LABEL[inProgressProject.kind]} underway - complete in{" "}
          {inProgressProject.completionSeason}.
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BUSINESS_EXPANSION_PROJECT_KINDS.map((kind) => {
          const built = completedSet.has(kind);
          const disabled = isPending || built || !!inProgressProject;
          return (
            <div key={kind} className="rounded-[2px] border border-rule bg-raised p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-ink">{CAPITAL_PROJECT_LABEL[kind]}</p>
                {built && <span className="text-xs text-positive">Built</span>}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{CAPITAL_PROJECT_DESCRIPTION[kind]}</p>
              {!built && (
                <button
                  type="button"
                  onClick={() => start(kind)}
                  disabled={disabled}
                  className="mt-2 rounded-[2px] border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-field disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Start ({formatFinanceCents(capitalProjectCostCents(kind))})
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        At most one expansion project at a time - each is a permanent, one-time unlock.
      </p>
    </div>
  );
}
