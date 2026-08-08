"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resolveAllStarWeekendAction } from "@/lib/actions/allStarWeekend";

/**
 * The one action that unblocks simulateGamesAction again - also doubles as
 * the "efficient skip" option the user asked for, since every contest/game
 * result is already fully decided at generation time (nothing to step
 * through), so resolving is instant regardless of how much of the reveal
 * the user actually read.
 */
export function ResolveWeekendButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await resolveAllStarWeekendAction(leagueId);
          router.push(`/leagues/${leagueId}/standings`);
          router.refresh();
        })
      }
      className="rounded-[2px] bg-team-accent px-5 py-2.5 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {isPending ? "Continuing..." : "Continue Season"}
    </button>
  );
}
