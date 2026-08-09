"use client";

import { useMemo, useState } from "react";
import {
  advanceDraftAction,
  makeDraftPickAction,
  toggleDraftProspectBookmarkAction,
  type ResolvedPick,
} from "@/lib/actions/draft";
import { DraftBroadcastHeader } from "./DraftBroadcastHeader";
import { DraftOrderRail } from "./DraftOrderRail";
import { PickRevealStage } from "./PickRevealStage";
import { DraftBoard } from "./DraftBoard";
import { MyBoardSection } from "./MyBoardSection";
import { ProspectBoard } from "./ProspectBoard";
import { ProspectProfileModal } from "./ProspectProfileModal";
import { ProspectCompareTray } from "./ProspectCompareTray";
import { ProspectCompareModal } from "./ProspectCompareModal";
import { TeamNeedsOverview } from "./TeamNeedsOverview";
import type {
  DraftPickInfo,
  DraftProspectInfo,
  DraftTeamInfo,
  DraftTeamContextInfo,
} from "./types";
import { teamLabel } from "./types";
import { computeBigBoard } from "@/lib/draft/bigBoard";
import { classCharacterModifiers } from "@/lib/draft/classCharacter";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

const MAX_NIGHT_EVENTS = 20;

interface PendingReveal {
  resolvedPicks: ResolvedPick[];
  done: boolean;
}

export function DraftExperience({
  leagueId,
  season,
  userTeamId,
  teamsById,
  teamContextById,
  initialPicks,
  initialProspects,
  initialBookmarkedProspectIds,
  initialScoutingAssignmentsRemaining,
}: {
  leagueId: string;
  /** Draft year, printed on the user's own draft card. */
  season: number;
  userTeamId: string | null;
  teamsById: Record<string, DraftTeamInfo>;
  teamContextById: Record<string, DraftTeamContextInfo>;
  initialPicks: DraftPickInfo[];
  initialProspects: DraftProspectInfo[];
  initialBookmarkedProspectIds: string[];
  /** Scouting Pillar Redesign (Phase 2) - assignments left in the whole pre-draft window's budget. */
  initialScoutingAssignmentsRemaining: number;
}) {
  const [picks, setPicks] = useState<DraftPickInfo[]>(initialPicks);
  const [prospects, setProspects] = useState<DraftProspectInfo[]>(initialProspects);
  const [scoutingAssignmentsRemaining, setScoutingAssignmentsRemaining] = useState(
    initialScoutingAssignmentsRemaining,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Scouting Pillar Redesign (Phase 3) - the ordered list IS "My Board";
  // see the same conversion in PreDraftScoutingView.tsx.
  const [boardOrder, setBoardOrder] = useState<string[]>(initialBookmarkedProspectIds);
  const bookmarkedIds = useMemo(() => new Set(boardOrder), [boardOrder]);
  const [nightEvents, setNightEvents] = useState<string[]>([]);
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
  const [sideTab, setSideTab] = useState<"myBoard" | "prospects" | "teamNeeds">("myBoard");
  const [profileModalProspectId, setProfileModalProspectId] = useState<string | null>(null);
  /**
   * A draft pick is permanent and the board is a dense list of similar-looking
   * rows, so a mis-click costs a first-rounder with no undo. The pick is
   * confirmed by name before it lands - the one place in the draft where a
   * second of friction is worth more than the speed it costs.
   */
  const [pendingDraftPick, setPendingDraftPick] = useState<{
    id: string;
    fullName: string;
  } | null>(null);
  const [compareSelectedIds, setCompareSelectedIds] = useState<Set<string>>(new Set());
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  function describeResolvedPick(p: ResolvedPick): string[] {
    const lines: string[] = [];
    if (p.tradedFromTeamId) {
      lines.push(
        `${teamLabel(teamsById, p.tradedFromTeamId)} traded pick ${p.overallPickNumber} to ${teamLabel(teamsById, p.leagueTeamId)}`,
      );
    }
    if (p.narrative === "REACH") {
      lines.push(
        `${teamLabel(teamsById, p.leagueTeamId)} reach for ${p.fullName} at pick ${p.overallPickNumber}`,
      );
    } else if (p.narrative === "STEAL") {
      lines.push(
        `${p.fullName} slides to pick ${p.overallPickNumber} - a steal for ${teamLabel(teamsById, p.leagueTeamId)}`,
      );
    }
    return lines;
  }

  function handleReveal(p: ResolvedPick) {
    setPicks((prev) =>
      prev.map((pick) =>
        pick.id === p.pickId
          ? { ...pick, selectedProspectId: p.prospectId, leagueTeamId: p.leagueTeamId }
          : pick,
      ),
    );
    const events = describeResolvedPick(p);
    if (events.length > 0) {
      setNightEvents((prev) => [...events.reverse(), ...prev].slice(0, MAX_NIGHT_EVENTS));
    }
  }

  function handleRevealComplete() {
    if (!pendingReveal) return;
    const { resolvedPicks, done } = pendingReveal;
    setMessage(
      resolvedPicks.length === 0 && done
        ? "The draft is complete."
        : resolvedPicks.length === 1 && resolvedPicks[0].leagueTeamId === userTeamId
          ? `You selected ${resolvedPicks[0].fullName}.`
          : `Resolved ${resolvedPicks.length} pick${resolvedPicks.length === 1 ? "" : "s"}.`,
    );
    setPendingReveal(null);
  }

  async function handleToggleBookmark(prospectId: string) {
    const wasBookmarked = boardOrder.includes(prospectId);
    setBoardOrder((prev) =>
      wasBookmarked ? prev.filter((id) => id !== prospectId) : [...prev, prospectId],
    );
    try {
      await toggleDraftProspectBookmarkAction(leagueId, prospectId);
    } catch {
      // Revert on failure - the optimistic toggle above was wrong.
      setBoardOrder((prev) =>
        wasBookmarked ? [...prev, prospectId] : prev.filter((id) => id !== prospectId),
      );
    }
  }

  function handleReorderBoard(newOrder: string[]) {
    setBoardOrder(newOrder);
  }

  function handleDepthChange(prospectId: string, newDepth: number, newRemaining: number) {
    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, scoutingDepth: newDepth } : p)),
    );
    setScoutingAssignmentsRemaining(newRemaining);
  }

  function handleResolvedHiddenTraitsChange(
    prospectId: string,
    resolvedHiddenTraits: string[],
    newRemaining: number,
  ) {
    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, resolvedHiddenTraits } : p)),
    );
    setScoutingAssignmentsRemaining(newRemaining);
  }

  function handleToggleCompare(prospectId: string) {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(prospectId)) {
        next.delete(prospectId);
      } else if (next.size < 4) {
        next.add(prospectId);
      }
      return next;
    });
  }

  const prospectsById = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  // Scouting Pillar Redesign (Phase 4) - identical across every prospect in
  // the class.
  const classCharacter = prospects[0]?.classCharacter ?? "BALANCED";
  const bigBoardNoiseMultiplier = classCharacterModifiers(classCharacter).bigBoardNoiseMultiplier;
  // Scouting Pillar Redesign (Phase 3) - by Draft Night the pre-draft
  // window has closed, so the tournament factor is always folded in here
  // (unlike PreDraftScoutingView, where it's gated on scouting activity).
  const bigBoard = useMemo(
    () => computeBigBoard(prospects, true, bigBoardNoiseMultiplier),
    [prospects, bigBoardNoiseMultiplier],
  );
  const bigBoardRankByProspectId = useMemo(
    () => new Map(bigBoard.map((e) => [e.prospectId, e.publicRank])),
    [bigBoard],
  );
  const boardProspects = boardOrder
    .map((id) => prospectsById.get(id))
    .filter((p): p is DraftProspectInfo => p !== undefined);

  const nextPick = picks.find((p) => !p.selectedProspectId) ?? null;
  const draftStarted = picks.length > 0;
  const draftComplete = draftStarted && !nextPick;
  const isUserTurn = Boolean(nextPick && userTeamId && nextPick.leagueTeamId === userTeamId);

  async function handleAdvance() {
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const result = await advanceDraftAction(leagueId);
      setPendingReveal({ resolvedPicks: result.resolvedPicks, done: result.done });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  function handleDraft(prospectId: string, fullName: string) {
    setErrorMessage(null);
    setPendingDraftPick({ id: prospectId, fullName });
  }

  async function confirmDraftPick() {
    if (!pendingDraftPick) return;
    const prospectId = pendingDraftPick.id;
    setPendingDraftPick(null);
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const result = await makeDraftPickAction(leagueId, prospectId);
      setPendingReveal({ resolvedPicks: [result.resolvedPick], done: false });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  const profileProspect = profileModalProspectId
    ? prospectsById.get(profileModalProspectId)
    : undefined;
  const compareProspects = prospects.filter((p) => compareSelectedIds.has(p.id));

  return (
    <div className="mt-8 space-y-6 pb-24">
      {pendingReveal ? (
        <PickRevealStage
          resolvedPicks={pendingReveal.resolvedPicks}
          teamsById={teamsById}
          userTeamId={userTeamId}
          season={season}
          onReveal={handleReveal}
          onComplete={handleRevealComplete}
        />
      ) : (
        <DraftBroadcastHeader
          leagueId={leagueId}
          pick={nextPick}
          teamsById={teamsById}
          teamContextById={teamContextById}
          isUserTurn={isUserTurn}
          draftComplete={draftComplete}
        />
      )}

      {pendingDraftPick && (
        <div className="rounded-[2px] border border-team-accent bg-team-accent/10 p-5">
          <p className="text-sm font-semibold text-ink">
            Draft {pendingDraftPick.fullName} with the {nextPick?.overallPickNumber
              ? `No. ${nextPick.overallPickNumber} pick`
              : "next pick"}
            ?
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            This is your selection. Once the card is in, it cannot be taken back.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={confirmDraftPick}
              className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? "Making the pick..." : "Make the pick"}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setPendingDraftPick(null)}
              className="rounded-[2px] border border-rule px-4 py-2 text-sm font-semibold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Keep looking
            </button>
          </div>
        </div>
      )}

      <DraftOrderRail
        picks={picks}
        prospectsById={prospectsById}
        teamsById={teamsById}
        userTeamId={userTeamId}
        currentPickId={pendingReveal ? null : (nextPick?.id ?? null)}
      />

      {!pendingReveal && draftStarted && !draftComplete && !isUserTurn && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleAdvance}
            className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBusy ? "Simulating..." : "Simulate to your next pick"}
          </button>
        </div>
      )}

      {/* Immediate feedback on what just happened stays at the top - it is a
          response to an action the player just took. The running night log is
          a feed, so it sits below the board rather than above it. */}
      {(message || errorMessage) && (
        <div className="border-t border-rule bg-field p-4">
          {message && <p className="text-[15px] text-team-accent">{message}</p>}
          {errorMessage && <ErrorNotice error={errorMessage} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        <DraftBoard
          picks={picks}
          prospectsById={prospectsById}
          teamsById={teamsById}
          userTeamId={userTeamId}
        />

        <div className="rounded-[2px] border border-rule bg-field p-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSideTab("myBoard")}
              className={`rounded-[2px] px-3 py-1.5 text-xs font-semibold transition ${
                sideTab === "myBoard" ? "bg-team-accent text-team-accent-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              My Board
            </button>
            <button
              type="button"
              onClick={() => setSideTab("prospects")}
              className={`rounded-[2px] px-3 py-1.5 text-xs font-semibold transition ${
                sideTab === "prospects"
                  ? "bg-team-accent text-team-accent-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Prospects
            </button>
            <button
              type="button"
              onClick={() => setSideTab("teamNeeds")}
              className={`rounded-[2px] px-3 py-1.5 text-xs font-semibold transition ${
                sideTab === "teamNeeds"
                  ? "bg-team-accent text-team-accent-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Team Needs
            </button>
          </div>

          <div className="mt-4">
            {sideTab === "myBoard" ? (
              <MyBoardSection
                leagueId={leagueId}
                boardProspects={boardProspects}
                picks={picks}
                onOpenProfile={setProfileModalProspectId}
                onReorder={handleReorderBoard}
                canDraft={!pendingReveal && isUserTurn}
                onDraft={handleDraft}
                isBusy={isBusy}
              />
            ) : sideTab === "prospects" ? (
              <ProspectBoard
                prospects={prospects}
                picks={picks}
                teamsById={teamsById}
                bookmarkedIds={bookmarkedIds}
                onToggleBookmark={handleToggleBookmark}
                compareSelectedIds={compareSelectedIds}
                onToggleCompare={handleToggleCompare}
                onOpenProfile={setProfileModalProspectId}
                canDraft={!pendingReveal && isUserTurn}
                onDraft={handleDraft}
                isBusy={isBusy}
              />
            ) : (
              <TeamNeedsOverview
                teamsById={teamsById}
                teamContextById={teamContextById}
                userTeamId={userTeamId}
              />
            )}
          </div>
        </div>
      </div>

      {/* The night log. A feed of what the rest of the league has been doing -
          worth reading, never worth putting above the board you are drafting
          from. Newest first, as a wire. */}
      {nightEvents.length > 0 && (
        <section className="border-t border-rule bg-field p-5">
          <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
            Draft night
          </p>
          <div className="mt-3">
            {nightEvents.map((event, i) => (
              <p
                key={i}
                className="border-b border-hairline py-2 text-[15px] text-ink last:border-b-0"
              >
                {event}
              </p>
            ))}
          </div>
        </section>
      )}

      {profileProspect && (
        <ProspectProfileModal
          leagueId={leagueId}
          prospect={profileProspect}
          bigBoardRank={bigBoardRankByProspectId.get(profileProspect.id) ?? null}
          classSize={prospects.length}
          remainingAssignments={scoutingAssignmentsRemaining}
          onClose={() => setProfileModalProspectId(null)}
          onDepthChange={handleDepthChange}
          onResolvedHiddenTraitsChange={handleResolvedHiddenTraitsChange}
        />
      )}
      {compareModalOpen && compareProspects.length >= 2 && (
        <ProspectCompareModal
          prospects={compareProspects}
          onClose={() => setCompareModalOpen(false)}
        />
      )}
      <ProspectCompareTray
        selectedProspects={compareProspects}
        onRemove={handleToggleCompare}
        onClear={() => setCompareSelectedIds(new Set())}
        onCompare={() => setCompareModalOpen(true)}
      />
    </div>
  );
}
