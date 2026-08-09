"use client";

import { useState } from "react";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import type { DraftPickInfo, DraftProspectInfo, DraftTeamInfo } from "./types";
import { teamLabel } from "./types";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - the draft board as a wall, not a log.
 *
 * This was a vertical list of identical rows, which is the shape of a
 * transaction feed rather than of a board. A real war room reads its board at a
 * glance: every pick in the round visible at once, your own selections
 * unmistakable, and the picks still to come showing as empty slots you can
 * count. A scrolling list of rows answers "what happened last" - a wall answers
 * "where does the round stand", which is the question actually being asked.
 *
 * So the round renders as a grid of numbered cards. Undecided picks are drawn
 * as empty slots rather than omitted, because the gaps are information: they
 * are how many names come off the board before you are up again.
 */

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

  // Undecided picks are kept, not filtered out: an empty slot on the wall is
  // the count of names still to come, which the old list could not show.
  const visible = picks.filter((p) => !myPicksOnly || p.leagueTeamId === userTeamId);

  const byRound = new Map<number, DraftPickInfo[]>();
  for (const pick of visible) {
    const list = byRound.get(pick.round) ?? [];
    list.push(pick);
    byRound.set(pick.round, list);
  }
  for (const list of byRound.values()) {
    list.sort((a, b) => (a.overallPickNumber ?? 0) - (b.overallPickNumber ?? 0));
  }

  const madeCount = visible.filter((p) => p.selectedProspectId).length;

  return (
    <section className="border border-rule bg-field p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-strong pb-3">
        <Label tone="ink">The board</Label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {madeCount} of {visible.length} in
          </span>
          {userTeamId && (
            <button
              type="button"
              onClick={() => setMyPicksOnly((v) => !v)}
              aria-pressed={myPicksOnly}
              className={`border px-2.5 py-1 text-[11px] font-semibold tracking-[0.09em] uppercase transition ${
                myPicksOnly
                  ? "border-team-accent text-team-accent"
                  : "border-rule text-ink-muted hover:text-ink"
              }`}
            >
              My picks
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 max-h-[38rem] space-y-6 overflow-y-auto pr-1">
        {visible.length === 0 && (
          <p className="text-[15px] text-ink-muted">No picks on the board.</p>
        )}
        {[...byRound.entries()].map(([round, roundPicks]) => (
          <div key={round}>
            <p className="mb-3 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
              {ROUND_LABELS[round] ?? `Round ${round}`}
            </p>
            {/* The wall. Dense enough that a full round is one glance. */}
            <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3 lg:grid-cols-4">
              {roundPicks.map((pick) => (
                <BoardSlot
                  key={pick.id}
                  pick={pick}
                  prospect={
                    pick.selectedProspectId ? prospectsById.get(pick.selectedProspectId) : undefined
                  }
                  teamsById={teamsById}
                  isUserPick={pick.leagueTeamId === userTeamId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * One card on the wall. A made pick carries the name; an unmade one is a slot
 * with its number, deliberately drawn rather than hidden.
 */
function BoardSlot({
  pick,
  prospect,
  teamsById,
  isUserPick,
}: {
  pick: DraftPickInfo;
  prospect: DraftProspectInfo | undefined;
  teamsById: Record<string, DraftTeamInfo>;
  isUserPick: boolean;
}) {
  return (
    <div
      className={`relative min-w-0 p-3 ${
        prospect ? "bg-raised" : "bg-field"
      } ${isUserPick ? "outline outline-team-accent -outline-offset-1" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[15px] tabular-nums ${
            isUserPick ? "text-team-accent" : "text-ink-muted"
          }`}
        >
          {pick.overallPickNumber ?? "—"}
        </span>
        <TeamBadge logoUrl={teamsById[pick.leagueTeamId]?.logoUrl ?? null} size="sm" />
      </div>

      <p className="mt-2 truncate text-[11px] tracking-[0.09em] text-ink-muted uppercase">
        {teamLabel(teamsById, pick.leagueTeamId)}
      </p>

      {prospect ? (
        <>
          <p className="mt-1 truncate text-[15px] font-semibold text-ink">{prospect.fullName}</p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-muted">
            {prospect.position} &middot; {prospect.overallRating}
          </p>
        </>
      ) : (
        /* An empty slot is information - it is how many names come off the
           board before this team is up. Drawn, never omitted.

           Deliberately not "On the clock": only one team ever is, and this
           component does not know which. Saying so on every unmade slot would
           be stating something false thirty times over. */
        <p className="mt-1 text-[15px] text-rule">&mdash;</p>
      )}
    </div>
  );
}
