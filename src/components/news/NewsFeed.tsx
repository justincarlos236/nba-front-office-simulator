"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/primitives";
import { TRANSACTION_ICON } from "@/components/ui/icons";
import { Stamp } from "@/components/ui/Stamp";
import { rankNews, type RankableStory } from "@/lib/news/storyRank";
import { dayLabel, groupByDay, ROLLUP_LABEL, type NewsDay } from "@/lib/news/newsDay";
import { buildStoryCards, type StoryCard } from "@/lib/news/storyCards";
import { recordLabel, streakLabel, type LeaguePulse } from "@/lib/news/leaguePulse";

export type NewsItem = RankableStory;

const CATEGORIES = [
  "ALL",
  "TRADE",
  "SIGNING",
  "STAFF",
  "ALL_STAR",
  "ROTATION",
  "DRAFT",
  "RETIREMENT",
  "INJURY",
  "AWARD",
  "GAME_MILESTONE",
  "WIN_STREAK",
  "GAME_RESULT",
  "OWNERSHIP_MESSAGE",
  "MORALE",
  "FINANCES",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  ALL: "All",
  TRADE: "Trades",
  SIGNING: "Free Agency",
  STAFF: "Staff",
  ALL_STAR: "All-Star",
  ROTATION: "Rotation",
  DRAFT: "Draft",
  RETIREMENT: "Retirements",
  INJURY: "Injuries",
  AWARD: "Awards",
  GAME_MILESTONE: "Milestones",
  WIN_STREAK: "Streaks",
  GAME_RESULT: "Games",
  OWNERSHIP_MESSAGE: "Ownership",
  MORALE: "Morale",
  FINANCES: "Finances",
};

// Every other category maps 1:1 to a single TransactionType - STAFF and
// ALL_STAR are the exceptions, each grouping several related types under
// one filter pill rather than adding a pill per type for what's really one
// concept to a reader.
const CATEGORY_TYPES: Record<Category, string[] | null> = {
  ALL: null,
  TRADE: ["TRADE"],
  SIGNING: ["SIGNING"],
  STAFF: ["STAFF_HIRE", "STAFF_FIRE"],
  ALL_STAR: ["ALL_STAR_SELECTION", "ALL_STAR_SNUB", "ALL_STAR_RESULT"],
  ROTATION: ["ROTATION_CHANGE"],
  DRAFT: ["DRAFT_LOTTERY", "DRAFT_SELECTION"],
  RETIREMENT: ["RETIREMENT"],
  INJURY: ["INJURY"],
  AWARD: ["AWARD"],
  GAME_MILESTONE: ["GAME_MILESTONE"],
  WIN_STREAK: ["WIN_STREAK"],
  GAME_RESULT: ["GAME_RESULT"],
  OWNERSHIP_MESSAGE: ["OWNERSHIP_MESSAGE"],
  MORALE: ["PLAYER_MORALE"],
  FINANCES: ["FINANCIAL_REPORT", "FRANCHISE_MILESTONE"],
};

const TYPE_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  STAFF_HIRE: "Staff Hire",
  STAFF_FIRE: "Staff Fire",
  ALL_STAR_SELECTION: "All-Star",
  ALL_STAR_SNUB: "All-Star Snub",
  ALL_STAR_RESULT: "All-Star Weekend",
  ROTATION_CHANGE: "Rotation",
  DRAFT_LOTTERY: "Draft Lottery",
  DRAFT_SELECTION: "Draft",
  RETIREMENT: "Retirement",
  INJURY: "Injury",
  OWNERSHIP_MESSAGE: "Ownership",
  GAME_MILESTONE: "Milestone",
  WIN_STREAK: "Streak",
  GAME_RESULT: "Game",
  AWARD: "Award",
  PLAYER_MORALE: "Morale",
  FINANCIAL_REPORT: "Finances",
  FRANCHISE_MILESTONE: "Franchise Value",
};

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

function pillClass(active: boolean): string {
  return `rounded-[2px] border px-2.5 py-1 text-[11px] font-semibold tracking-[0.09em] uppercase transition-colors duration-120 ${
    active
      ? "border-team-accent bg-team-accent text-team-accent-ink"
      : "border-rule text-ink-muted hover:bg-raised hover:text-ink"
  }`;
}

function TypeTag({ type, strong = false }: { type: string; strong?: boolean }) {
  const Icon = TRANSACTION_ICON[type];
  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.09em] uppercase ${
        strong ? "text-ink" : "text-ink-muted"
      }`}
    >
      {Icon && <Icon className="shrink-0" />}
      <span className="truncate">{TYPE_LABEL[type] ?? type}</span>
    </span>
  );
}

function SeeTheDeal({ leagueId, tradeId }: { leagueId: string; tradeId: string }) {
  return (
    <Link
      href={`/leagues/${leagueId}/trades/${tradeId}`}
      className="text-[11px] font-semibold tracking-[0.09em] whitespace-nowrap text-team-accent uppercase underline decoration-rule underline-offset-4"
    >
      See the deal
    </Link>
  );
}

/** THE LEAD. One story at broadcast scale, and only when one has earned it. */
function LeadStory({
  item,
  leagueId,
  isMine,
}: {
  item: NewsItem;
  leagueId: string;
  isMine: boolean;
}) {
  const breaking = item.importance === "BREAKING";
  return (
    <article className="relative border-t-2 border-team-accent bg-field px-5 py-7 sm:px-8 sm:py-10">
      {breaking && (
        <Stamp tone="signal" className="absolute top-6 right-6 hidden sm:inline-flex">
          Breaking
        </Stamp>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label tone="accent">{breaking ? "Breaking" : "The lead"}</Label>
        <TypeTag type={item.type} />
        {isMine && (
          <span className="text-[11px] tracking-[0.09em] text-team-accent uppercase">
            Your franchise
          </span>
        )}
      </div>
      <p className="mt-4 max-w-[24ch] text-[clamp(1.75rem,4vw,3rem)] leading-[1.08] font-bold tracking-[-0.025em] text-ink">
        {item.description}
      </p>
      {item.tradeId && (
        <div className="mt-5">
          <SeeTheDeal leagueId={leagueId} tradeId={item.tradeId} />
        </div>
      )}
    </article>
  );
}

/** AROUND THE LEAGUE. Emitted only when the league actually produced one. */
function StoryCardTile({ card, leagueId }: { card: StoryCard; leagueId: string }) {
  return (
    <article
      className={`flex min-h-[7.5rem] flex-col border border-hairline bg-field px-4 py-4 ${
        card.isMine ? "border-t-2 border-t-team-accent" : "border-t-2 border-t-rule-strong"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-semibold tracking-[0.14em] uppercase ${
            card.isMine ? "text-team-accent" : "text-ink-muted"
          }`}
        >
          {card.kicker}
        </span>
        <TypeTag type={card.type} />
      </div>
      <p className="mt-2 flex-1 text-[15px] leading-snug font-medium text-ink">{card.headline}</p>
      {card.detail && (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-ink-muted">{card.detail}</p>
      )}
      {card.tradeId && (
        <div className="mt-2">
          <SeeTheDeal leagueId={leagueId} tradeId={card.tradeId} />
        </div>
      )}
    </article>
  );
}

/** One filed line on the wire. */
function WireRow({
  item,
  leagueId,
  isMine,
}: {
  item: NewsItem;
  leagueId: string;
  isMine: boolean;
}) {
  const major = item.importance === "MAJOR" || item.importance === "BREAKING";
  const minor = item.importance === "MINOR";
  return (
    <article
      className={`flex gap-x-4 border-b border-l-2 border-b-hairline py-2 pr-2 pl-3 transition-colors duration-120 hover:bg-raised ${
        isMine ? "border-l-team-accent" : "border-l-transparent"
      }`}
    >
      <span className="w-24 shrink-0 pt-0.5">
        <TypeTag type={item.type} strong={major} />
      </span>
      <p
        className={`min-w-0 flex-1 ${
          major
            ? "text-[16px] leading-snug font-medium text-ink"
            : minor
              ? "text-[15px] leading-snug text-ink-muted"
              : "text-[15px] leading-snug text-ink"
        }`}
      >
        {item.description}
        {item.tradeId && (
          <>
            {" "}
            <SeeTheDeal leagueId={leagueId} tradeId={item.tradeId} />
          </>
        )}
      </p>
    </article>
  );
}

/** A day's routine tail, held as one line until asked for. */
function Rollup({
  label,
  stories,
  userTeamId,
}: {
  label: string;
  stories: NewsItem[];
  userTeamId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const mine = userTeamId ? stories.filter((s) => s.teamIds.includes(userTeamId)).length : 0;
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 py-1.5 pr-2 pl-3 text-left transition-colors duration-120 hover:bg-raised"
      >
        <span className="flex-1 text-[13px] text-ink-muted">
          {label} <span className="font-mono tabular-nums">· {stories.length}</span>
          {mine > 0 && <span className="text-team-accent"> · {mine} of yours</span>}
        </span>
        <span className="shrink-0 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          {stories.map((s) => (
            <p
              key={s.id}
              className={`border-t border-hairline py-1.5 pr-2 pl-6 text-[14px] leading-snug ${
                userTeamId && s.teamIds.includes(userTeamId) ? "text-ink" : "text-ink-muted"
              }`}
            >
              {s.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** One day on the wire: what led it, then what merely happened. */
function DaySection({
  day,
  leagueId,
  userTeamId,
}: {
  day: NewsDay;
  leagueId: string;
  userTeamId: string | null;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 border-b border-rule-strong pt-5 pb-1.5">
        <h3 className="font-mono text-[13px] font-medium tracking-[0.06em] text-ink uppercase">
          {dayLabel(day.season, day.dayIndex)}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">{day.total}</span>
      </div>
      <div>
        {day.headlines.map((item) => (
          <WireRow
            key={item.id}
            item={item}
            leagueId={leagueId}
            isMine={Boolean(userTeamId && item.teamIds.includes(userTeamId))}
          />
        ))}
        {day.rollups.map((rollup) => (
          <Rollup
            key={rollup.key}
            label={ROLLUP_LABEL[rollup.key] ?? rollup.key}
            stories={rollup.stories}
            userTeamId={userTeamId}
          />
        ))}
      </div>
    </section>
  );
}

/** LEAGUE PULSE. Standings and roster state - not a second copy of the feed. */
function LeaguePulsePanel({
  pulse,
  userTeamId,
}: {
  pulse: LeaguePulse;
  userTeamId: string | null;
}) {
  const rows: { label: string; value: string; detail?: string; mine: boolean }[] = [];
  if (pulse.best) {
    rows.push({
      label: "Best record",
      value: pulse.best.label,
      detail: recordLabel(pulse.best),
      mine: pulse.best.leagueTeamId === userTeamId,
    });
  }
  if (pulse.hottest) {
    rows.push({
      label: "Hottest",
      value: pulse.hottest.label,
      detail: streakLabel(pulse.hottest.currentStreak),
      mine: pulse.hottest.leagueTeamId === userTeamId,
    });
  }
  if (pulse.coldest) {
    rows.push({
      label: "Coldest",
      value: pulse.coldest.label,
      detail: streakLabel(pulse.coldest.currentStreak),
      mine: pulse.coldest.leagueTeamId === userTeamId,
    });
  }
  if (pulse.keyInjury) {
    rows.push({
      label: "Out",
      value: pulse.keyInjury.playerName,
      detail:
        pulse.keyInjury.gamesRemaining !== null
          ? `${pulse.keyInjury.teamLabel} · ${pulse.keyInjury.gamesRemaining} ${
              pulse.keyInjury.gamesRemaining === 1 ? "game" : "games"
            }`
          : pulse.keyInjury.teamLabel,
      mine: pulse.keyInjury.leagueTeamId === userTeamId,
    });
  }

  return (
    <section className="border-t border-rule bg-field p-4">
      <div className="flex items-baseline justify-between gap-2">
        <Label>League pulse</Label>
        {pulse.injuredCount > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {pulse.injuredCount} hurt
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] leading-snug text-ink-muted">
          Too early to tell - play some games.
        </p>
      ) : (
        <dl className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`border-l-2 pl-2.5 ${row.mine ? "border-l-team-accent" : "border-l-hairline"}`}
            >
              <dt className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
                {row.label}
              </dt>
              <dd className="text-[14px] leading-snug font-medium text-ink">{row.value}</dd>
              {row.detail && (
                <dd className="font-mono text-[11px] tabular-nums text-ink-muted">{row.detail}</dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * THE WIRE - a league news homepage, not an event log.
 *
 * Three editorial levels, each earned from data rather than assigned by
 * category:
 *
 *   1. THE LEAD - the single biggest story, at broadcast scale. Empty on a
 *      quiet stretch, because a manufactured lead is a lie.
 *   2. AROUND THE LEAGUE - four to six cards, each emitted only when the
 *      league actually produced one. Event cards read the engine's own
 *      `importance` (already derived at write time from trade player tier,
 *      injury duration, points scored); Hot/Cold read standings state instead.
 *   3. THE WIRE - the complete record, filed day by day. Each day shows what
 *      led it and folds the rest into rollups: `Injuries · 4  [Show]`. A day
 *      costs a few lines whether it produced eight events or eighty, and
 *      nothing is discarded.
 *
 * Duplication is prevented structurally rather than by comparing strings: the
 * lead's id is excluded from the cards, cards never reuse a story, and the
 * sidebar reads *state* (streaks, records, who is currently hurt) rather than
 * events, so it cannot restate a headline.
 *
 * Searching or filtering drops all of it for one flat chronological list.
 * Someone looking up a player wants every hit in order, not an editor's view
 * of which matters.
 */
export function NewsFeed({
  transactions,
  userTeamId,
  leagueId,
  pulse,
}: {
  transactions: NewsItem[];
  userTeamId: string | null;
  leagueId: string;
  pulse: LeaguePulse;
}) {
  const [category, setCategory] = useState<Category>("ALL");
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const isFinding = category !== "ALL" || myTeamOnly || search.trim().length > 0;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "ALL" && !CATEGORY_TYPES[category]!.includes(t.type)) return false;
      if (myTeamOnly && (!userTeamId || !t.teamIds.includes(userTeamId))) return false;
      if (query && !t.description.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [transactions, category, myTeamOnly, search, userTeamId]);

  const ranked = useMemo(() => rankNews(transactions, { userTeamId }), [transactions, userTeamId]);

  const cards = useMemo(
    () =>
      buildStoryCards({
        stories: transactions,
        pulse,
        userTeamId,
        excludeIds: new Set(ranked.lead ? [ranked.lead.id] : []),
      }),
    [transactions, pulse, userTeamId, ranked.lead],
  );

  /** Their own recent news, minus anything already shown above. */
  const franchise = useMemo(() => {
    if (!userTeamId) return [];
    const shown = new Set([...(ranked.lead ? [ranked.lead.id] : []), ...cards.map((c) => c.key)]);
    return transactions
      .filter((t) => t.teamIds.includes(userTeamId) && !shown.has(t.id))
      .slice(0, 4);
  }, [transactions, userTeamId, ranked.lead, cards]);

  /**
   * Browsing, the wire skips whatever the lead and the cards already showed -
   * a front page does not restate its own lead three inches lower. Finding,
   * nothing is withheld: a search has to return every hit.
   */
  const wireDays = useMemo(() => {
    if (isFinding) return groupByDay(filtered);
    const shownAbove = new Set([
      ...(ranked.lead ? [ranked.lead.id] : []),
      ...cards.map((c) => c.key),
    ]);
    return groupByDay(transactions.filter((t) => !shownAbove.has(t.id)));
  }, [isFinding, filtered, transactions, ranked.lead, cards]);

  const bySeason = useMemo(() => {
    const groups = new Map<number, NewsDay[]>();
    for (const day of wireDays) {
      const list = groups.get(day.season) ?? [];
      list.push(day);
      groups.set(day.season, list);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [wireDays]);

  const isMine = (item: NewsItem) => Boolean(userTeamId && item.teamIds.includes(userTeamId));

  const filterPanel = (
    <section className="border-t border-rule bg-field p-4">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Find a story</Label>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase hover:text-ink"
          aria-expanded={showFilters}
        >
          {showFilters ? "Less" : "Filters"}
        </button>
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Any name or phrase"
        className="mt-2 w-full rounded-[2px] border border-rule bg-raised px-3 py-1.5 text-[15px] text-ink transition-colors duration-120 placeholder:text-ink-muted/60 focus:border-rule-strong"
      />

      {(showFilters || isFinding) && (
        <>
          {userTeamId && (
            <button
              type="button"
              onClick={() => setMyTeamOnly((v) => !v)}
              className={`mt-3 ${pillClass(myTeamOnly)}`}
            >
              My franchise
            </button>
          )}
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
        </>
      )}

      {isFinding && (
        <button
          type="button"
          onClick={() => {
            setCategory("ALL");
            setMyTeamOnly(false);
            setSearch("");
          }}
          className="mt-3 text-[11px] font-semibold tracking-[0.09em] text-team-accent uppercase underline decoration-rule underline-offset-4"
        >
          Back to the front page
        </button>
      )}
    </section>
  );

  const wire = (
    <div className="space-y-8">
      {bySeason.map(([season, days]) => (
        <div key={season}>
          <h2 className="border-b-2 border-rule-strong pb-1 font-mono text-[15px] font-medium tabular-nums text-ink">
            {seasonLabel(season)}
          </h2>
          {days.map((day) => (
            <DaySection
              key={`${day.season}-${day.dayIndex ?? "none"}`}
              day={day}
              leagueId={leagueId}
              userTeamId={userTeamId}
            />
          ))}
        </div>
      ))}
    </div>
  );

  /**
   * ONE tree for both modes, deliberately.
   *
   * These used to be two `return`s - a front page and a results page - which
   * meant typing the first character into the search box swapped the entire
   * subtree. React unmounted the input and mounted a different one, so focus
   * was lost after exactly one keystroke and the box had to be clicked again
   * for every letter.
   *
   * So the structure below never changes shape: the lead, the cards, the
   * pulse and the franchise strip render as `false` when finding rather than
   * disappearing from the children array, and the filter panel stays the last
   * child of the same `<aside>` in both modes. React reconciles it to the same
   * DOM node and the caret stays put.
   *
   * Anything conditional here must keep its slot for the same reason.
   */
  return (
    <div className="space-y-10">
      {!isFinding && ranked.lead && (
        <LeadStory item={ranked.lead} leagueId={leagueId} isMine={isMine(ranked.lead)} />
      )}

      {!isFinding && cards.length > 0 && (
        <section>
          <Label>Around the league</Label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <StoryCardTile key={card.key} card={card} leagueId={leagueId} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px] lg:items-start">
        <div className="min-w-0 lg:order-1">
          <div className="flex items-baseline justify-between gap-3">
            <Label>{isFinding ? "Results" : "The wire"}</Label>
            <span
              aria-live="polite"
              className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase"
            >
              {isFinding
                ? `${filtered.length} of ${transactions.length} filed`
                : `${transactions.length} filed`}
            </span>
          </div>
          {isFinding && filtered.length === 0 ? (
            <div className="mt-4 border-t border-rule bg-field p-8 text-center">
              <p className="text-[15px] text-ink-muted">No stories match these filters.</p>
            </div>
          ) : (
            <div className="mt-3">{wire}</div>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          {!isFinding && <LeaguePulsePanel pulse={pulse} userTeamId={userTeamId} />}
          {!isFinding && franchise.length > 0 && (
            <section className="border-t border-team-accent bg-field p-4">
              <div className="flex items-baseline justify-between gap-2">
                <Label tone="accent">Your franchise</Label>
                <button
                  type="button"
                  onClick={() => setMyTeamOnly(true)}
                  className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase hover:text-ink"
                >
                  All
                </button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {franchise.map((item) => (
                  <li key={item.id} className="text-[13px] leading-snug text-ink">
                    {item.description}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {filterPanel}
        </aside>
      </div>
    </div>
  );
}
