"use client";

import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import { TEAM_IDENTITY_LABEL } from "@/lib/gm/teamIdentity";
import { TEAM_NEED_LABEL } from "@/lib/gm/teamNeeds";
import type { DraftTeamInfo, DraftTeamContextInfo } from "./types";

/** Every team's computed identity and positional needs, at a glance - the same data the CPU draft-AI already uses, just surfaced for the user. */
export function TeamNeedsOverview({
  teamsById,
  teamContextById,
  userTeamId,
}: {
  teamsById: Record<string, DraftTeamInfo>;
  teamContextById: Record<string, DraftTeamContextInfo>;
  userTeamId: string | null;
}) {
  const teamIds = Object.keys(teamsById).sort((a, b) =>
    teamsById[a].name.localeCompare(teamsById[b].name),
  );

  return (
    <div className="max-h-[40rem] space-y-1.5 overflow-y-auto pr-1">
      {teamIds.map((teamId) => {
        const team = teamsById[teamId];
        const context = teamContextById[teamId];
        const isUserTeam = teamId === userTeamId;
        return (
          <div
            key={teamId}
            className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${
              isUserTeam ? "border-accent bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <TeamBadge logoUrl={team.logoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {team.city} {team.name}
                {isUserTeam && <span className="ml-2 text-xs text-accent">YOU</span>}
              </p>
              {context && (
                <p className="truncate text-xs text-muted">
                  {TEAM_IDENTITY_LABEL[context.identity]}
                  {context.needs.length > 0 &&
                    ` · Needs: ${context.needs.map((n) => TEAM_NEED_LABEL[n]).join(", ")}`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
