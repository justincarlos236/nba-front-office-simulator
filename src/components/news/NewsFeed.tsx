"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/primitives";
import { TRANSACTION_ICON } from "@/components/ui/icons";
import { Stamp } from "@/components/ui/Stamp";
import { condenseWire, rankNews, type RankableStory, type WireEntry } from "@/lib/news/storyRank";

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

/** Plural phrasing for a collapsed run, so the digest line reads as a sentence. */
const DIGEST_LABEL: Record<string, (n: number) => string> = {
  PLAYER_MORALE: (n) => `${n} morale notes from around the league`,
  ROTATION_CHANGE: (n) => `${n} rotation changes`,
  GAME_RESULT: (n) => `${n} more results from around the league`,
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

/**
 * THE LEAD. One story, at broadcast scale, and only when the ranking model
 * says something has genuinely earned it - a quiet week shows no lead at all
 * rather than promoting the least boring thing that happened.
 */
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
    <article className="relative border-t-2 border-team-accent bg-field px-5 py-6 sm:px-7 sm:py-8">
      {breaking && (
        <Stamp tone="signal" className="absolute top-5 right-5 hidden sm:inline-flex">
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
      <p className="mt-4 max-w-[34ch] text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] font-bold tracking-[-0.02em] text-ink sm:max-w-[28ch]">
        {item.description}
      </p>
      {item.tradeId && (
        <div className="mt-4">
          <SeeTheDeal leagueId={leagueId} tradeId={item.tradeId} />
        </div>
      )}
    </article>
  );
}

/** A promoted runner-up. Bigger than a wire row, quieter than the lead. */
function TopStory({
  item,
  leagueId,
  isMine,
}: {
  item: NewsItem;
  leagueId: string;
  isMine: boolean;
}) {
  return (
    <article
      className={`border-t bg-field px-4 py-4 ${isMine ? "border-t-team-accent" : "border-t-rule-strong"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TypeTag type={item.type} strong />
        {item.importance === "MAJOR" && <Label tone="accent">Major</Label>}
      </div>
      <p className="mt-2 text-[17px] leading-snug font-medium text-ink">{item.description}</p>
      {item.tradeId && (
        <div className="mt-2">
          <SeeTheDeal leagueId={leagueId} tradeId={item.tradeId} />
        </div>
      )}
    </article>
  );
}

/** One filed line on the chronological wire. */
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
      className={`flex gap-x-4 border-b border-l-2 border-b-hairline py-2.5 pr-2 pl-3 transition-colors duration-120 hover:bg-raised ${
        isMine ? "border-l-team-accent" : "border-l-transparent"
      }`}
    >
      <span className="w-28 shrink-0 pt-0.5">
        <TypeTag type={item.type} strong={major} />
      </span>
      <p
        className={`min-w-0 flex-1 ${
          major
            ? "text-[17px] leading-snug font-medium text-ink"
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

/**
 * A collapsed run of routine rows. Nothing is thrown away - the digest holds
 * its rows and opens on click. Closed, it costs one line instead of twelve.
 */
function WireDigest({
  entry,
  userTeamId,
}: {
  entry: Extract<WireEntry, { kind: "digest" }>;
  userTeamId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const describe =
    DIGEST_LABEL[entry.type] ??
    ((n: number) => `${n} more ${TYPE_LABEL[entry.type] ?? entry.type} notes`);
  const mineCount = userTeamId
    ? entry.stories.filter((s) => s.teamIds.includes(userTeamId)).length
    : 0;

  return (
    <div className="border-b border-l-2 border-b-hairline border-l-transparent">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full gap-x-4 py-2 pr-2 pl-3 text-left transition-colors duration-120 hover:bg-raised"
      >
        <span className="w-28 shrink-0 pt-0.5">
          <TypeTag type={entry.type} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink-muted">
          {describe(entry.stories.length)}
          {mineCount > 0 && (
            <span className="text-team-accent"> · {mineCount} involving your franchise</span>
          )}
        </span>
        <span className="shrink-0 self-center text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="pb-1 pl-3">
          {entry.stories.map((s) => (
            <p
              key={s.id}
              className={`border-t border-hairline py-1.5 pl-28 text-[15px] leading-snug ${
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

/** A compact side module: latest few rows of one kind, as scannable lines. */
function SideModule({
  title,
  items,
  userTeamId,
  empty,
}: {
  title: string;
  items: NewsItem[];
  userTeamId: string | null;
  empty: string;
}) {
  return (
    <section className="border-t border-rule bg-field p-4">
      <Label>{title}</Label>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] leading-snug text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className={`border-l-2 pl-2 text-[13px] leading-snug ${
                userTeamId && item.teamIds.includes(userTeamId)
                  ? "border-l-team-accent text-ink"
                  : "border-l-hairline text-ink-muted"
              }`}
            >
              {item.description}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * THE WIRE - a front page, not a database feed.
 *
 * The audit finding this rebuild answers: every story used to arrive as a
 * sibling of every other, one chronological list where a franchise-altering
 * trade and a bench player's mood sat a pixel apart. Importance existed in
 * the data and changed a row's *typography*, but never its *placement*, so
 * the top of the page belonged to whatever filed last - usually morale.
 *
 * Now placement is earned. `rankNews` decides what leads from importance,
 * type and recency; `condenseWire` collapses repetitive runs so routine
 * traffic costs a line instead of a screen. Both are pure and tested, so the
 * hierarchy is a thing we assert rather than a thing that emerges from CSS.
 *
 * Two modes on purpose:
 *   - **Browsing** (no filters): the full hierarchy, lead down to side modules.
 *   - **Finding** (any filter or search): one flat, complete, chronological
 *     list. Someone searching a player's name wants every hit in order, not
 *     an editor's opinion about which of them matters most.
 *
 * `createdAt` is deliberately never shown: simulation runs in bursts, so
 * hundreds of rows share a real-world second and a clock time would be fake
 * precision. Season is the only honest time unit.
 */
export function NewsFeed({
  transactions,
  userTeamId,
  leagueId,
}: {
  transactions: NewsItem[];
  userTeamId: string | null;
  leagueId: string;
}) {
  const [category, setCategory] = useState<Category>("ALL");
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [search, setSearch] = useState("");

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

  /** Filed under the season it happened in - the wire's own structure. */
  const bySeason = useMemo(() => {
    const groups = new Map<number, NewsItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.season) ?? [];
      list.push(item);
      groups.set(item.season, list);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const latest = (types: string[], n: number) =>
    transactions.filter((t) => types.includes(t.type)).slice(0, n);

  const isMine = (item: NewsItem) => Boolean(userTeamId && item.teamIds.includes(userTeamId));

  const filters = (
    <div className="border-t border-rule bg-field p-4">
      <Label>Search</Label>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Any name or phrase"
        className="mt-2 w-full rounded-[2px] border border-rule bg-raised px-3 py-1.5 text-[15px] text-ink transition-colors duration-120 placeholder:text-ink-muted/60 focus:border-rule-strong"
      />

      {userTeamId && (
        <div className="mt-4">
          <Label>Scope</Label>
          <button
            type="button"
            onClick={() => setMyTeamOnly((v) => !v)}
            className={`mt-2 ${pillClass(myTeamOnly)}`}
          >
            My franchise
          </button>
        </div>
      )}

      <div className="mt-4">
        <Label>Category</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>

      {isFinding && (
        <button
          type="button"
          onClick={() => {
            setCategory("ALL");
            setMyTeamOnly(false);
            setSearch("");
          }}
          className="mt-4 text-[11px] font-semibold tracking-[0.09em] text-team-accent uppercase underline decoration-rule underline-offset-4"
        >
          Back to the front page
        </button>
      )}
    </div>
  );

  const seasonSections = (
    <div className="space-y-10">
      {bySeason.map(([season, items]) => {
        const entries = condenseWire(items);
        return (
          <section key={season}>
            <div className="flex items-baseline justify-between gap-3 border-b border-rule-strong pb-2">
              <h2 className="font-mono text-[15px] font-medium tabular-nums text-ink">
                {seasonLabel(season)}
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {items.length}
              </span>
            </div>
            <div className="mt-1">
              {entries.map((entry) =>
                entry.kind === "digest" ? (
                  <WireDigest
                    key={`digest-${entry.stories[0].id}`}
                    entry={entry}
                    userTeamId={userTeamId}
                  />
                ) : (
                  <WireRow
                    key={entry.story.id}
                    item={entry.story}
                    leagueId={leagueId}
                    isMine={isMine(entry.story)}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );

  // FINDING. One flat, complete list - no editorial hierarchy in the way.
  if (isFinding) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px] lg:items-start">
        <div className="min-w-0 lg:order-1">
          <p
            aria-live="polite"
            className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase"
          >
            {filtered.length} of {transactions.length} filed
          </p>
          {filtered.length === 0 ? (
            <div className="mt-4 border-t border-rule bg-field p-8 text-center">
              <p className="text-[15px] text-ink-muted">No stories match these filters.</p>
            </div>
          ) : (
            <div className="mt-4">{seasonSections}</div>
          )}
        </div>
        <aside className="lg:sticky lg:top-6 lg:order-2">{filters}</aside>
      </div>
    );
  }

  // BROWSING. The front page.
  return (
    <div className="space-y-10">
      {ranked.lead && (
        <LeadStory item={ranked.lead} leagueId={leagueId} isMine={isMine(ranked.lead)} />
      )}

      {ranked.topStories.length > 0 && (
        <section>
          <Label>Top stories</Label>
          <div className="mt-3 grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2">
            {ranked.topStories.map((item) => (
              <TopStory key={item.id} item={item} leagueId={leagueId} isMine={isMine(item)} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px] lg:items-start">
        <div className="min-w-0 lg:order-1">
          {ranked.franchise.length > 0 && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between gap-3 border-b border-team-accent pb-2">
                <Label tone="accent">Your franchise</Label>
                <button
                  type="button"
                  onClick={() => setMyTeamOnly(true)}
                  className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase underline decoration-rule underline-offset-4 hover:text-ink"
                >
                  See all
                </button>
              </div>
              <div className="mt-1">
                {ranked.franchise.map((item) => (
                  <WireRow key={item.id} item={item} leagueId={leagueId} isMine />
                ))}
              </div>
            </section>
          )}

          <div className="flex items-baseline justify-between gap-3">
            <Label>The wire</Label>
            <span
              aria-live="polite"
              className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase"
            >
              {transactions.length} filed
            </span>
          </div>
          <div className="mt-4">{seasonSections}</div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          {filters}
          <SideModule
            title="Injury report"
            items={latest(["INJURY"], 6)}
            userTeamId={userTeamId}
            empty="Nobody is hurt right now."
          />
          <SideModule
            title="Latest deals"
            items={latest(["TRADE", "SIGNING"], 5)}
            userTeamId={userTeamId}
            empty="No trades or signings yet."
          />
          <SideModule
            title="Streaks & milestones"
            items={latest(["WIN_STREAK", "GAME_MILESTONE"], 5)}
            userTeamId={userTeamId}
            empty="Nothing notable on the floor yet."
          />
        </aside>
      </div>
    </div>
  );
}
