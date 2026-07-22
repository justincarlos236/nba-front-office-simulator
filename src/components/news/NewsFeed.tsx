"use client";

import { useMemo, useState } from "react";

export interface NewsItem {
  id: string;
  type: string;
  description: string;
  importance: string;
  season: number;
  teamIds: string[];
}

const CATEGORIES = [
  "ALL",
  "TRADE",
  "SIGNING",
  "STAFF",
  "RETIREMENT",
  "INJURY",
  "AWARD",
  "GAME_MILESTONE",
  "WIN_STREAK",
  "GAME_RESULT",
  "OWNERSHIP_MESSAGE",
] as const;

const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  ALL: "All",
  TRADE: "Trades",
  SIGNING: "Free Agency",
  STAFF: "Staff",
  RETIREMENT: "Retirements",
  INJURY: "Injuries",
  AWARD: "Awards",
  GAME_MILESTONE: "Milestones",
  WIN_STREAK: "Streaks",
  GAME_RESULT: "Games",
  OWNERSHIP_MESSAGE: "Ownership",
};

// Every other category maps 1:1 to a single TransactionType - STAFF is the
// one exception, grouping both STAFF_HIRE and STAFF_FIRE under one filter
// pill rather than adding two more pills for what's really one "staff
// moves" concept to a reader.
const CATEGORY_TYPES: Record<(typeof CATEGORIES)[number], string[] | null> = {
  ALL: null,
  TRADE: ["TRADE"],
  SIGNING: ["SIGNING"],
  STAFF: ["STAFF_HIRE", "STAFF_FIRE"],
  RETIREMENT: ["RETIREMENT"],
  INJURY: ["INJURY"],
  AWARD: ["AWARD"],
  GAME_MILESTONE: ["GAME_MILESTONE"],
  WIN_STREAK: ["WIN_STREAK"],
  GAME_RESULT: ["GAME_RESULT"],
  OWNERSHIP_MESSAGE: ["OWNERSHIP_MESSAGE"],
};

const TYPE_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  STAFF_HIRE: "Staff Hire",
  STAFF_FIRE: "Staff Fire",
  RETIREMENT: "Retirement",
  INJURY: "Injury",
  OWNERSHIP_MESSAGE: "Ownership",
  GAME_MILESTONE: "Milestone",
  WIN_STREAK: "Streak",
  GAME_RESULT: "Game",
  AWARD: "Award",
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  TRADE: "bg-accent/15 text-accent",
  SIGNING: "bg-emerald-500/15 text-emerald-400",
  STAFF_HIRE: "bg-emerald-500/15 text-emerald-400",
  STAFF_FIRE: "bg-red-500/15 text-red-400",
  RETIREMENT: "bg-muted/20 text-muted",
  INJURY: "bg-red-500/15 text-red-400",
  OWNERSHIP_MESSAGE: "bg-purple-500/15 text-purple-400",
  GAME_MILESTONE: "bg-sky-500/15 text-sky-400",
  WIN_STREAK: "bg-orange-500/15 text-orange-400",
  GAME_RESULT: "bg-yellow-500/15 text-yellow-400",
  AWARD: "bg-pink-500/15 text-pink-400",
};

// Only BREAKING/MAJOR get a visual callout - MINOR/STANDARD read as the
// plain, routine feed this always was, so the important stuff actually
// stands out instead of everything competing for attention.
const IMPORTANCE_BORDER_CLASS: Record<string, string> = {
  BREAKING: "border-l-4 border-l-red-500",
  MAJOR: "border-l-4 border-l-orange-400",
};

function pillClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-medium transition ${
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-muted hover:text-foreground"
  }`;
}

/**
 * All filtering happens client-side over an already-fetched (capped at
 * 200) list - same "filter a preloaded list" convention as DraftExperience,
 * not a server round-trip per click, since the underlying dataset is
 * already small and bounded.
 */
export function NewsFeed({
  transactions,
  userTeamId,
}: {
  transactions: NewsItem[];
  userTeamId: string | null;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("ALL");
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "ALL" && !CATEGORY_TYPES[category]!.includes(t.type)) return false;
      if (myTeamOnly && (!userTeamId || !t.teamIds.includes(userTeamId))) return false;
      if (query && !t.description.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [transactions, category, myTeamOnly, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search news..."
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {userTeamId && (
          <button
            type="button"
            onClick={() => setMyTeamOnly((v) => !v)}
            className={pillClass(myTeamOnly)}
          >
            My Team
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={pillClass(category === c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">No stories match these filters.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((txn) => (
            <div
              key={txn.id}
              className={`flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 ${IMPORTANCE_BORDER_CLASS[txn.importance] ?? ""}`}
            >
              <p className="text-sm text-foreground">
                {txn.importance === "BREAKING" && (
                  <span className="mr-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold tracking-wide text-red-400 uppercase">
                    Breaking
                  </span>
                )}
                {txn.description}
              </p>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${TYPE_BADGE_CLASS[txn.type] ?? "bg-muted/20 text-muted"}`}
                >
                  {TYPE_LABEL[txn.type] ?? txn.type}
                </span>
                <span className="text-xs text-muted">
                  {txn.season}-{(txn.season + 1).toString().slice(-2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
