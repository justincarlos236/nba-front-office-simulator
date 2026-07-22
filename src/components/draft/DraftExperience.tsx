"use client";

import { useMemo, useState } from "react";
import { advanceDraftAction, makeDraftPickAction, startDraftAction } from "@/lib/actions/draft";
import { deriveScoutingProfile } from "@/lib/draft/scoutingProfile";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";

interface Pick {
  id: string;
  round: number;
  overallPickNumber: number;
  leagueTeamId: string;
  selectedProspectId: string | null;
}

interface Prospect {
  id: string;
  fullName: string;
  position: string;
  age: number;
  overallRating: number;
  potentialRating: number;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const ROUND_LABELS: Record<number, string> = { 1: "Round 1", 2: "Round 2" };
const REVEAL_DELAY_MS = 260;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ScoutingReport({ prospect }: { prospect: Prospect }) {
  const profile = deriveScoutingProfile(prospect);
  const attributes: [string, number][] = [
    ["Scoring", profile.scoring],
    ["Playmaking", profile.playmaking],
    ["Defense", profile.defense],
    ["Rebounding", profile.rebounding],
    ["Athleticism", profile.athleticism],
  ];
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="space-y-1.5">
        {attributes.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted">{label}</span>
            <div className="h-1.5 flex-1 rounded-full bg-surface-2">
              <div className="h-1.5 rounded-full bg-accent" style={{ width: `${value}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-muted">{value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="text-foreground">Strengths:</span> {profile.strengths.join(", ")}
        <br />
        <span className="text-foreground">Weaknesses:</span> {profile.weaknesses.join(", ")}
      </p>
    </div>
  );
}

export function DraftExperience({
  leagueId,
  userTeamId,
  teamsById,
  initialPicks,
  initialProspects,
}: {
  leagueId: string;
  userTeamId: string | null;
  teamsById: Record<string, { city: string; name: string }>;
  initialPicks: Pick[];
  initialProspects: Prospect[];
}) {
  const [picks, setPicks] = useState<Pick[]>(initialPicks);
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickerPositionFilter, setPickerPositionFilter] = useState<string>("ALL");
  const [scoutPositionFilter, setScoutPositionFilter] = useState<string>("ALL");
  const [expandedPickerId, setExpandedPickerId] = useState<string | null>(null);
  const [expandedScoutId, setExpandedScoutId] = useState<string | null>(null);

  const prospectsById = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  const draftedProspectIds = useMemo(
    () =>
      new Set(picks.filter((p) => p.selectedProspectId).map((p) => p.selectedProspectId as string)),
    [picks],
  );

  const nextPick = picks.find((p) => !p.selectedProspectId) ?? null;
  const draftStarted = picks.length > 0;
  const draftComplete = draftStarted && !nextPick;
  const isUserTurn = Boolean(nextPick && userTeamId && nextPick.leagueTeamId === userTeamId);

  function teamName(id: string): string {
    const t = teamsById[id];
    return t ? `${t.city} ${t.name}` : "Unknown team";
  }

  async function handleStart() {
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const result = await startDraftAction(leagueId);
      setPicks(
        [...result.picks]
          .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
          .map((p) => ({ ...p, selectedProspectId: null })),
      );
      setProspects(result.prospects);
      setMessage("The lottery is in and the draft class is set.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAdvance() {
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const result = await advanceDraftAction(leagueId);
      for (const resolved of result.resolvedPicks) {
        setPicks((prev) =>
          prev.map((p) =>
            p.id === resolved.pickId ? { ...p, selectedProspectId: resolved.prospectId } : p,
          ),
        );
        await sleep(REVEAL_DELAY_MS);
      }
      setMessage(
        result.resolvedPicks.length === 0 && result.done
          ? "The draft is complete."
          : `Resolved ${result.resolvedPicks.length} pick${result.resolvedPicks.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDraft(prospectId: string, fullName: string) {
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const result = await makeDraftPickAction(leagueId, prospectId);
      setPicks((prev) =>
        prev.map((p) =>
          p.id === result.resolvedPick.pickId
            ? { ...p, selectedProspectId: result.resolvedPick.prospectId }
            : p,
        ),
      );
      setMessage(`You selected ${fullName}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  const availableForPick = prospects
    .filter((p) => !draftedProspectIds.has(p.id))
    .filter((p) => pickerPositionFilter === "ALL" || p.position === pickerPositionFilter)
    .sort((a, b) => b.overallRating - a.overallRating);

  const scoutingList = prospects
    .filter((p) => scoutPositionFilter === "ALL" || p.position === scoutPositionFilter)
    .sort((a, b) => b.overallRating - a.overallRating);

  const decidedPicks = picks.filter((p) => p.selectedProspectId);

  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: controls + on-the-clock picker */}
        <div className="rounded-xl border border-border bg-surface p-6">
          {!draftStarted && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleStart}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? "Running the lottery..." : "Start the draft"}
            </button>
          )}

          {draftStarted && !draftComplete && !isUserTurn && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleAdvance}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? "Simulating..." : "Simulate to your next pick"}
            </button>
          )}

          {draftStarted && !draftComplete && isUserTurn && (
            <div>
              <p className="text-sm font-semibold text-foreground">
                You&apos;re on the clock - pick {nextPick?.overallPickNumber}.
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["ALL", ...POSITIONS] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPickerPositionFilter(pos)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      pickerPositionFilter === pos
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {availableForPick.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-border bg-surface-2 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedPickerId(expandedPickerId === p.id ? null : p.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        <PlayerAvatar photoUrl={null} fullName={p.fullName} size="sm" />
                        <span>
                          <p className="font-medium text-foreground hover:text-accent">
                            {p.fullName}
                          </p>
                          <p className="text-xs text-muted">
                            {p.position} &middot; Age {p.age} &middot; Rating {p.overallRating}{" "}
                            &middot; Potential {p.potentialRating}
                          </p>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDraft(p.id, p.fullName)}
                        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Draft
                      </button>
                    </div>
                    {expandedPickerId === p.id && <ScoutingReport prospect={p} />}
                  </div>
                ))}
                {availableForPick.length === 0 && (
                  <p className="text-xs text-muted">No prospects match this filter.</p>
                )}
              </div>
            </div>
          )}

          {draftComplete && (
            <p className="text-sm text-muted">The draft is complete for this season.</p>
          )}

          {message && <p className="mt-3 text-sm text-accent">{message}</p>}
          {errorMessage && <p className="mt-3 text-sm text-red-400">{errorMessage}</p>}
        </div>

        {/* Right column: live draft board */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Draft Board</h2>
          <div className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {decidedPicks.length === 0 && <p className="text-xs text-muted">No picks made yet.</p>}
            {decidedPicks.map((pick) => {
              const prospect = pick.selectedProspectId
                ? prospectsById.get(pick.selectedProspectId)
                : undefined;
              const isUserPick = pick.leagueTeamId === userTeamId;
              return (
                <div
                  key={pick.id}
                  className={`flex items-center justify-between rounded-lg border p-3 text-sm transition ${
                    isUserPick ? "border-accent bg-accent/5" : "border-border bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar photoUrl={null} fullName={prospect?.fullName ?? ""} size="sm" />
                    <div>
                      <p className="text-xs tracking-wide text-muted uppercase">
                        Pick {pick.overallPickNumber} &middot; {ROUND_LABELS[pick.round]} &middot;{" "}
                        {teamName(pick.leagueTeamId)}
                      </p>
                      <p className="font-medium text-foreground">{prospect?.fullName}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted">
                    {prospect?.position} &middot; OVR {prospect?.overallRating}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scouting board: browse the whole class */}
      {prospects.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Scouting Board</h2>
          <p className="mt-1 text-sm text-muted">
            Every prospect in this year&apos;s class. Click a name for a full scouting report.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["ALL", ...POSITIONS] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setScoutPositionFilter(pos)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  scoutPositionFilter === pos
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scoutingList.map((p) => {
              const pick = picks.find((pk) => pk.selectedProspectId === p.id);
              return (
                <div key={p.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedScoutId(expandedScoutId === p.id ? null : p.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <PlayerAvatar photoUrl={null} fullName={p.fullName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between">
                        <p className="font-medium text-foreground hover:text-accent">
                          {p.fullName}
                        </p>
                        <span className="font-mono text-xs text-muted">OVR {p.overallRating}</span>
                      </span>
                      <p className="text-xs text-muted">
                        {p.position} &middot; Age {p.age} &middot; Potential {p.potentialRating}
                        {pick
                          ? ` · Drafted by ${teamName(pick.leagueTeamId)} (Pick ${pick.overallPickNumber})`
                          : " · Available"}
                      </p>
                    </span>
                  </button>
                  {expandedScoutId === p.id && <ScoutingReport prospect={p} />}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
