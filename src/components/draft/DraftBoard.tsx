"use client";

import { useState } from "react";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { DraftPickInfo, DraftProspectInfo, DraftTeamInfo } from "./types";
import { teamLabel } from "./types";

const ROUND_LABELS: Record<number, string> = { 1: "Round 1", 2: "Round 2" };

export function DraftBoard({
  picks,
  prospectsById,
  teamsById,
  userTeamId,
}: {
  picks: DraftPickInfo[];
  prospectsById: Map<string, DraftProspectInfo>;
  teamsById: Record<string, DraftTeamInfo>;
  userTeamId: string | null;
}) {
  const [myPicksOnly, setMyPicksOnly] = useState(false);

  const decidedPicks = picks
    .filter((p) => p.selectedProspectId)
    .filter((p) => !myPicksOnly || p.leagueTeamId === userTeamId);

  const byRound = new Map<number, DraftPickInfo[]>();
  for (const pick of decidedPicks) {
    const list = byRound.get(pick.round) ?? [];
    list.push(pick);
    byRound.set(pick.round, list);
  }

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Draft Board</h2>
        {userTeamId && (
          <button
            type="button"
            onClick={() => setMyPicksOnly((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              myPicksOnly
                ? "border-team-accent bg-team-accent/10 text-team-accent"
                : "border-rule text-ink-muted hover:text-ink"
            }`}
          >
            My Picks
          </button>
        )}
      </div>
      <div className="mt-3 max-h-[36rem] space-y-4 overflow-y-auto pr-1">
        {decidedPicks.length === 0 && <p className="text-xs text-ink-muted">No picks made yet.</p>}
        {[...byRound.entries()].map(([round, roundPicks]) => (
          <div key={round}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {ROUND_LABELS[round] ?? `Round ${round}`}
            </p>
            <div className="space-y-2">
              {roundPicks.map((pick) => {
                const prospect = pick.selectedProspectId
                  ? prospectsById.get(pick.selectedProspectId)
                  : undefined;
                const isUserPick = pick.leagueTeamId === userTeamId;
                return (
                  <div
                    key={pick.id}
                    className={`flex items-center justify-between rounded-[2px] border p-3 text-sm transition ${
                      isUserPick ? "border-team-accent bg-team-accent/5" : "border-rule bg-raised"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TeamBadge
                        logoUrl={teamsById[pick.leagueTeamId]?.logoUrl ?? null}
                        size="sm"
                      />
                      <PlayerAvatar photoUrl={null} fullName={prospect?.fullName ?? ""} size="sm" />
                      <div>
                        <p className="text-xs tracking-wide text-ink-muted uppercase">
                          Pick {pick.overallPickNumber} &middot;{" "}
                          {teamLabel(teamsById, pick.leagueTeamId)}
                        </p>
                        <p className="font-medium text-ink">{prospect?.fullName}</p>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-ink-muted">
                      {prospect?.position} &middot; OVR {prospect?.overallRating}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
