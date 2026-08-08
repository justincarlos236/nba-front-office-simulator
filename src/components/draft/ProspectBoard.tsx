"use client";

import { useMemo, useState } from "react";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { DraftPickInfo, DraftProspectInfo, DraftTeamInfo } from "./types";
import { teamLabel } from "./types";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type SortKey = "overall" | "potential" | "age" | "name";

const MAX_COMPARE = 4;

function pillClass(active: boolean): string {
  return `rounded-full border px-2.5 py-1 text-xs font-medium transition ${
    active
      ? "border-team-accent bg-team-accent/10 text-team-accent"
      : "border-rule text-ink-muted hover:text-ink"
  }`;
}

export function ProspectBoard({
  prospects,
  picks,
  teamsById,
  bookmarkedIds,
  onToggleBookmark,
  compareSelectedIds,
  onToggleCompare,
  onOpenProfile,
  canDraft,
  onDraft,
  isBusy,
}: {
  /** The full class - drafted and undrafted alike. */
  prospects: DraftProspectInfo[];
  picks: DraftPickInfo[];
  teamsById: Record<string, DraftTeamInfo>;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (id: string) => void;
  compareSelectedIds: Set<string>;
  onToggleCompare: (id: string) => void;
  onOpenProfile: (id: string) => void;
  canDraft: boolean;
  onDraft?: (id: string, fullName: string) => void;
  isBusy?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [myBoardOnly, setMyBoardOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("overall");

  const pickByProspectId = useMemo(() => {
    const map = new Map<string, DraftPickInfo>();
    for (const pick of picks) {
      if (pick.selectedProspectId) map.set(pick.selectedProspectId, pick);
    }
    return map;
  }, [picks]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects
      .filter((p) => positionFilter === "ALL" || p.position === positionFilter)
      .filter((p) => !myBoardOnly || bookmarkedIds.has(p.id))
      .filter((p) => !query || p.fullName.toLowerCase().includes(query))
      .sort((a, b) => {
        switch (sortKey) {
          case "potential":
            return b.potentialRating - a.potentialRating;
          case "age":
            return a.age - b.age;
          case "name":
            return a.fullName.localeCompare(b.fullName);
          default:
            return b.overallRating - a.overallRating;
        }
      });
  }, [prospects, positionFilter, myBoardOnly, search, sortKey, bookmarkedIds]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospects..."
          className="w-full max-w-xs rounded-[2px] border border-rule bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-team-accent focus:outline-none"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-[2px] border border-rule bg-field px-2 py-2 text-xs text-ink focus:border-team-accent focus:outline-none"
        >
          <option value="overall">Sort: Overall</option>
          <option value="potential">Sort: Potential</option>
          <option value="age">Sort: Age</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(["ALL", ...POSITIONS] as const).map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => setPositionFilter(pos)}
            className={pillClass(positionFilter === pos)}
          >
            {pos}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMyBoardOnly((v) => !v)}
          className={pillClass(myBoardOnly)}
        >
          My Board
        </button>
      </div>

      <div className="mt-3 max-h-[40rem] space-y-2 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const pick = pickByProspectId.get(p.id);
          const isDrafted = Boolean(pick);
          const isComparing = compareSelectedIds.has(p.id);
          const compareDisabled = !isComparing && compareSelectedIds.size >= MAX_COMPARE;
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-[2px] border border-rule bg-raised p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={isComparing}
                disabled={compareDisabled}
                onChange={() => onToggleCompare(p.id)}
                aria-label={`Compare ${p.fullName}`}
                className="shrink-0 accent-orange-500"
              />
              <button
                type="button"
                onClick={() => onOpenProfile(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <PlayerAvatar photoUrl={null} fullName={p.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink hover:text-team-accent">
                    {p.fullName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {p.position} &middot; Age {p.age} &middot; OVR {p.overallRating} &middot; POT{" "}
                    {p.potentialRating}
                    {pick
                      ? ` · Drafted by ${teamLabel(teamsById, pick.leagueTeamId)} (Pick ${pick.overallPickNumber})`
                      : ""}
                  </p>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleBookmark(p.id)}
                aria-label={bookmarkedIds.has(p.id) ? "Remove bookmark" : "Bookmark prospect"}
                className={`shrink-0 text-lg transition ${
                  bookmarkedIds.has(p.id) ? "text-team-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {bookmarkedIds.has(p.id) ? "★" : "☆"}
              </button>
              {canDraft && !isDrafted && onDraft && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onDraft(p.id, p.fullName)}
                  className="shrink-0 rounded-[2px] bg-team-accent px-3 py-1.5 text-xs font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Draft
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-ink-muted">No prospects match this filter.</p>
        )}
      </div>
    </div>
  );
}
