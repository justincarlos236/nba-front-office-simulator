"use client";

import { useEffect, useRef } from "react";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import type { DraftPickInfo, DraftProspectInfo, DraftTeamInfo } from "./types";

const ROUND_LABEL: Record<number, string> = { 1: "Round 1", 2: "Round 2" };

export function DraftOrderRail({
  picks,
  prospectsById,
  teamsById,
  userTeamId,
  currentPickId,
}: {
  picks: DraftPickInfo[];
  prospectsById: Map<string, DraftProspectInfo>;
  teamsById: Record<string, DraftTeamInfo>;
  userTeamId: string | null;
  currentPickId: string | null;
}) {
  const currentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentPickId]);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 pb-2">
        {picks.map((pick) => {
          const team = teamsById[pick.leagueTeamId];
          const prospect = pick.selectedProspectId
            ? prospectsById.get(pick.selectedProspectId)
            : undefined;
          const isCurrent = pick.id === currentPickId;
          const isUserPick = pick.leagueTeamId === userTeamId;
          const isDecided = Boolean(pick.selectedProspectId);
          return (
            <div
              key={pick.id}
              ref={isCurrent ? currentRef : undefined}
              className={`flex w-28 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                isCurrent
                  ? "border-accent bg-accent/10"
                  : isUserPick
                    ? "border-accent/50 bg-accent/5"
                    : "border-border bg-surface"
              } ${isDecided && !isCurrent ? "opacity-70" : ""}`}
            >
              <span className="font-mono text-[10px] text-muted">
                {ROUND_LABEL[pick.round]} &middot; #{pick.overallPickNumber}
              </span>
              <TeamBadge
                logoUrl={team?.logoUrl ?? null}
                size="sm"
                faded={isDecided && !isCurrent}
              />
              <span className="w-full truncate text-[11px] text-foreground">
                {team ? team.name : "Unknown"}
              </span>
              {prospect && (
                <span className="w-full truncate text-[10px] text-accent-2">
                  {prospect.fullName}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
