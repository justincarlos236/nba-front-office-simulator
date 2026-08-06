"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { ProspectBoard } from "./ProspectBoard";
import { ProspectProfileModal } from "./ProspectProfileModal";
import { ProspectCompareTray } from "./ProspectCompareTray";
import { ProspectCompareModal } from "./ProspectCompareModal";
import { BigBoardSection } from "./BigBoardSection";
import { MyBoardSection } from "./MyBoardSection";
import type { DraftProspectInfo, DraftTeamInfo } from "./types";
import {
  acceptScoutingRecommendationAction,
  runSweepAction,
} from "@/lib/actions/scoutingAssignments";
import { toggleDraftProspectBookmarkAction } from "@/lib/actions/draft";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { computeBigBoard } from "@/lib/draft/bigBoard";
import { PROSPECT_PATHWAY_LABEL, type ProspectPathway } from "@/lib/draft/prospectBio";
import {
  CLASS_CHARACTER_LABEL,
  CLASS_CHARACTER_DESCRIPTION,
  classCharacterModifiers,
} from "@/lib/draft/classCharacter";
import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";

const noopSubscribe = () => () => {};

/**
 * `useSyncExternalStore` rather than `useState` + `useEffect`, since
 * `localStorage` is a genuine external system and this project's
 * `react-hooks/set-state-in-effect` lint flags an effect that
 * synchronously sets state - the sanctioned escape here (see
 * DraftBroadcastHeader.tsx for the sibling case that isn't remountable).
 * `getServerSnapshot` returns `false` so SSR/hydration output matches;
 * the real value appears on the client's first paint after that.
 */
function useNotDismissed(key: string): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.localStorage.getItem(key) !== "1",
    () => false,
  );
}

const SWEEPABLE_PATHWAYS: ProspectPathway[] = [
  "POWER_CONFERENCE",
  "MID_MAJOR",
  "INTERNATIONAL_PROFESSIONAL",
  "DEVELOPMENT_PATHWAY",
];

/**
 * Scouting Pillar Redesign (Phase 2) - the pre-draft window's own view,
 * separate from `DraftExperience`. The lottery hasn't run yet here, so
 * there's no pick order, no "on the clock," no broadcast header - just the
 * class, the assignment budget, and the ability to spend it. Draft Night
 * itself is unchanged; this is everything that happens before it.
 */
export function PreDraftScoutingView({
  leagueId,
  teamsById,
  initialProspects,
  /** Already in Draft Board order (lowest boardRank first) - see the Draft page's `orderBy`. */
  initialBookmarkedProspectIds,
  scoutingCapacity,
  initialScoutingAssignmentsRemaining,
}: {
  leagueId: string;
  teamsById: Record<string, DraftTeamInfo>;
  initialProspects: DraftProspectInfo[];
  initialBookmarkedProspectIds: string[];
  scoutingCapacity: number;
  initialScoutingAssignmentsRemaining: number;
}) {
  const [prospects, setProspects] = useState<DraftProspectInfo[]>(initialProspects);
  // Scouting Pillar Redesign (Phase 5 follow-up) - a first-time user
  // landing here has no orientation before this point (the offseason page
  // only says "scouting the class... comes before advancing"); this is a
  // one-time explainer, dismissed permanently per league via localStorage
  // since it's a UI preference, not save state worth a DB column.
  const dismissKey = `scouting-intro-dismissed:${leagueId}`;
  const notDismissed = useNotDismissed(dismissKey);
  const [forceDismissed, setForceDismissed] = useState(false);
  const showIntro = notDismissed && !forceDismissed;
  function dismissIntro() {
    window.localStorage.setItem(dismissKey, "1");
    setForceDismissed(true);
  }
  // Scouting Pillar Redesign (Phase 3) - the ordered list IS the Draft
  // Board; a Set can't represent order, so this replaces what used to be
  // `bookmarkedIds: Set<string>`. Membership is still a cheap `.includes`
  // away for the handful of places that only need "is this bookmarked."
  const [boardOrder, setBoardOrder] = useState<string[]>(initialBookmarkedProspectIds);
  const bookmarkedIds = useMemo(() => new Set(boardOrder), [boardOrder]);
  const [compareSelectedIds, setCompareSelectedIds] = useState<Set<string>>(new Set());
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [profileModalProspectId, setProfileModalProspectId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialScoutingAssignmentsRemaining);
  const [isRecommending, startRecommend] = useTransition();
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [lastRecommendationResult, setLastRecommendationResult] = useState<string | null>(null);
  const [sweepPathway, setSweepPathway] = useState<ProspectPathway>("INTERNATIONAL_PROFESSIONAL");
  const [isSweeping, startSweep] = useTransition();
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [lastSweepResult, setLastSweepResult] = useState<string | null>(null);

  const profileProspect = prospects.find((p) => p.id === profileModalProspectId);
  const compareProspects = prospects.filter((p) => compareSelectedIds.has(p.id));
  const prospectById = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  // Scouting Pillar Redesign (Phase 4) - identical across every prospect in
  // the class (see schema.prisma's ClassCharacter comment), so any one of
  // them tells the whole class's character.
  const classCharacter = prospects[0]?.classCharacter ?? "BALANCED";
  const boardProspects = boardOrder
    .map((id) => prospectById.get(id))
    .filter((p): p is DraftProspectInfo => p !== undefined);
  const spent = scoutingCapacity - remaining;

  // Scouting Pillar Redesign (Phase 3, refinement confirmed 2026-08-06) -
  // the tournament-performance factor reveals once the player has spent
  // any scouting activity this window, tied to a real in-game action
  // rather than a calendar tick that doesn't exist. Recomputed whenever
  // `spent` first crosses 0, not on every render.
  const tournamentRevealed = spent > 0;
  const bigBoardNoiseMultiplier = classCharacterModifiers(classCharacter).bigBoardNoiseMultiplier;
  const bigBoard = useMemo(
    () => computeBigBoard(prospects, tournamentRevealed, bigBoardNoiseMultiplier),
    [prospects, tournamentRevealed, bigBoardNoiseMultiplier],
  );
  const rankByProspectId = useMemo(
    () => new Map(bigBoard.map((e) => [e.prospectId, e.publicRank])),
    [bigBoard],
  );

  function handleDepthChange(prospectId: string, newDepth: number, newRemaining: number) {
    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, scoutingDepth: newDepth } : p)),
    );
    setRemaining(newRemaining);
  }

  function handleResolvedHiddenTraitsChange(
    prospectId: string,
    resolvedHiddenTraits: string[],
    newRemaining: number,
  ) {
    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, resolvedHiddenTraits } : p)),
    );
    setRemaining(newRemaining);
  }

  function handleSweep() {
    setSweepError(null);
    setLastSweepResult(null);
    startSweep(async () => {
      try {
        const result = await runSweepAction(leagueId, sweepPathway);
        setProspects((prev) =>
          prev.map((p) =>
            result.newDepthByProspectId[p.id] != null
              ? { ...p, scoutingDepth: result.newDepthByProspectId[p.id] }
              : p,
          ),
        );
        setRemaining(result.remaining);
        setLastSweepResult(
          result.targetProspectIds.length > 0
            ? `Found ${result.targetProspectIds.length} name${result.targetProspectIds.length === 1 ? "" : "s"} worth a closer look.`
            : null,
        );
      } catch (err) {
        setSweepError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  async function handleToggleBookmark(prospectId: string) {
    const wasBookmarked = boardOrder.includes(prospectId);
    setBoardOrder((prev) =>
      wasBookmarked ? prev.filter((id) => id !== prospectId) : [...prev, prospectId],
    );
    try {
      await toggleDraftProspectBookmarkAction(leagueId, prospectId);
    } catch {
      // Revert - the optimistic update above was wrong.
      setBoardOrder((prev) =>
        wasBookmarked ? [...prev, prospectId] : prev.filter((id) => id !== prospectId),
      );
    }
  }

  function handleReorderBoard(newOrder: string[]) {
    setBoardOrder(newOrder);
  }

  function handleToggleCompare(prospectId: string) {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(prospectId)) next.delete(prospectId);
      else if (next.size < 4) next.add(prospectId);
      return next;
    });
  }

  function handleAcceptRecommendation() {
    setRecommendError(null);
    setLastRecommendationResult(null);
    startRecommend(async () => {
      try {
        const result = await acceptScoutingRecommendationAction(leagueId);
        if (result.updatedDepths.length === 0) {
          setRecommendError("No assignments left to recommend.");
          return;
        }
        const depthById = new Map(result.updatedDepths.map((d) => [d.prospectId, d.newDepth]));
        // Resolve names before prospects state updates underneath us -
        // this is the only place a user can see who "Get a recommendation"
        // actually touched, since Focused Look otherwise applies silently.
        const nameById = new Map(prospects.map((p) => [p.id, p.fullName]));
        const touched = result.updatedDepths.map(
          (d) =>
            `${nameById.get(d.prospectId) ?? "A prospect"} (${SCOUTING_DEPTH_LABEL[d.newDepth] ?? d.newDepth})`,
        );
        setProspects((prev) =>
          prev.map((p) =>
            depthById.has(p.id) ? { ...p, scoutingDepth: depthById.get(p.id)! } : p,
          ),
        );
        setRemaining(result.remaining);
        setLastRecommendationResult(`Focused Look spent on: ${touched.join(", ")}.`);
      } catch (err) {
        setRecommendError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="mt-8 space-y-4">
      {showIntro && (
        <div className="rounded-xl border border-accent bg-accent/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-semibold text-foreground">Welcome to Pre-Draft Scouting</p>
            <button
              type="button"
              onClick={dismissIntro}
              className="shrink-0 text-xs text-muted underline hover:text-foreground"
            >
              Got it, don&apos;t show this again
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            The draft class is out, but the lottery hasn&apos;t run yet - you&apos;re scouting blind
            on where you&apos;ll actually pick. You have a limited pool of{" "}
            <span className="text-foreground">scouting assignments</span> for this whole window (set
            by your Scouting department). Spend them to learn more about specific prospects before
            Draft Night:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
            <li>
              <span className="text-foreground">Focused Look</span> - open a prospect and spend 1
              assignment to sharpen your read on him specifically.
            </li>
            <li>
              <span className="text-foreground">Regional Sweep</span> - spend 1 assignment to find
              new names across a whole pathway (college tier, international, etc.) at once.
            </li>
            <li>
              <span className="text-foreground">Private Workout</span> - spend 2 assignments to
              resolve one specific uncertainty (work ethic or injury outlook) outright, once
              you&apos;ve scouted him enough.
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted">
            Don&apos;t want to manage it yourself?{" "}
            <span className="text-foreground">Get a recommendation</span> below spends your whole
            remaining budget for you, weighted to your team&apos;s needs. Once spent, assignments
            don&apos;t come back this window - what you learn (or don&apos;t) here is what you walk
            into the draft with.{" "}
            <HowDoesThisWork topic="scouting" className="underline hover:text-foreground" />
          </p>
        </div>
      )}

      {classCharacter !== "BALANCED" && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <p className="text-xs font-semibold tracking-wide text-accent uppercase">
            This Year&apos;s Class: {CLASS_CHARACTER_LABEL[classCharacter]}
          </p>
          <p className="mt-1 text-sm text-muted">
            {CLASS_CHARACTER_DESCRIPTION[classCharacter]}{" "}
            <HowDoesThisWork topic="class-character" className="underline hover:text-foreground" />
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide text-muted uppercase">Scouting Assignments</p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {remaining} of {scoutingCapacity} remaining
            </p>
          </div>
          <button
            type="button"
            disabled={isRecommending || remaining <= 0}
            onClick={handleAcceptRecommendation}
            className="rounded-lg border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRecommending ? "Scouting..." : "Get a recommendation"}
          </button>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-surface-2">
          <div
            className="h-1.5 rounded-full bg-accent transition-all"
            style={{ width: `${scoutingCapacity > 0 ? (spent / scoutingCapacity) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Open any prospect and use a Focused Look to spend an assignment yourself, or click{" "}
          <span className="text-foreground">Get a recommendation</span> to spend your{" "}
          <span className="text-foreground">entire remaining budget at once</span> - your staff will
          run Focused Looks weighted toward your team&apos;s positional needs.{" "}
          <HowDoesThisWork topic="scouting" className="underline hover:text-foreground" />
        </p>
        {recommendError && <p className="mt-2 text-xs text-red-400">{recommendError}</p>}
        {lastRecommendationResult && (
          <p className="mt-2 text-xs text-accent">{lastRecommendationResult}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs tracking-wide text-muted uppercase">Regional Sweep</p>
        <p className="mt-1 text-xs text-muted">
          1 assignment - shallow Depth on several Unknown prospects sharing a pathway. Finds names,
          doesn&apos;t confirm them.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={sweepPathway}
            onChange={(e) => setSweepPathway(e.target.value as ProspectPathway)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            {SWEEPABLE_PATHWAYS.map((pathway) => (
              <option key={pathway} value={pathway}>
                {PROSPECT_PATHWAY_LABEL[pathway]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isSweeping || remaining <= 0}
            onClick={handleSweep}
            className="rounded-lg border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSweeping ? "Sweeping..." : "Run Sweep (1 assignment)"}
          </button>
        </div>
        {lastSweepResult && <p className="mt-2 text-xs text-accent">{lastSweepResult}</p>}
        {sweepError && <p className="mt-2 text-xs text-red-400">{sweepError}</p>}
      </div>

      <BigBoardSection
        board={bigBoard}
        prospectsById={prospectById}
        tournamentRevealed={tournamentRevealed}
        onOpenProfile={setProfileModalProspectId}
      />

      <MyBoardSection
        leagueId={leagueId}
        boardProspects={boardProspects}
        onOpenProfile={setProfileModalProspectId}
        onReorder={handleReorderBoard}
      />

      <div className="rounded-xl border border-border bg-surface p-6">
        <ProspectBoard
          prospects={prospects}
          picks={[]}
          teamsById={teamsById}
          bookmarkedIds={bookmarkedIds}
          onToggleBookmark={handleToggleBookmark}
          compareSelectedIds={compareSelectedIds}
          onToggleCompare={handleToggleCompare}
          onOpenProfile={setProfileModalProspectId}
          canDraft={false}
        />
      </div>

      {profileProspect && (
        <ProspectProfileModal
          leagueId={leagueId}
          prospect={profileProspect}
          bigBoardRank={rankByProspectId.get(profileProspect.id) ?? null}
          classSize={prospects.length}
          remainingAssignments={remaining}
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
