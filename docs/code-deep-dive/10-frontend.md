# Deep Dive 10 — Frontend (Pages & Components)

Folders: `src/app/` (routes) + `src/components/` (~57 components). Next.js App Router,
React 19, Tailwind CSS 4. **Code blocks are real source.** The mental model: **pages are
server components that fetch data; only interactive pieces are client components.**

---

## Routing — the App Router

A folder is a route; `page.tsx` is the page, `layout.tsx` wraps its children, `[id]` is a
dynamic segment. The tree (abridged):

```
app/
  page.tsx                       landing (marketing components)
  sign-in/ sign-up/              auth pages
  leagues/page.tsx               "my leagues"
  leagues/new/page.tsx           the GM job market
  leagues/[id]/
    layout.tsx                   in-league chrome (nav) + the ended-league lock
    page.tsx                     team dashboard
    trades/new/ free-agents/ draft/ rotation/ finances/ standings/
    schedule/ playoffs/ staff/ fans/ leaders/ transactions/ all-star/ offseason/ history/
  career/page.tsx  players/[id]/page.tsx
```

## Server components are the default (data fetching)

A page is an `async` function that `await`s Prisma directly — no client data-fetching
layer. `leagues/[id]/layout.tsx` is a representative server component: it authenticates,
authorizes, applies the ended-league lock, and renders the nav.

```tsx
export default async function LeagueLayout({ children, params }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
  if (!league || league.ownerId !== session.user.id) notFound();   // authorize by ownership

  if (league.endedAt) {                                            // GM Career Mode: read-only lock
    const [record, owner] = await Promise.all([ prisma.careerRecord.findFirst({ where: { leagueId: league.id }, orderBy: { createdAt: "desc" } }), prisma.user.findUnique({...}) ]);
    if (record) return <CareerEndRecap ... />;                     // no playable sub-page reachable
  }

  const phase = await computeLeaguePhase(league.id, league.currentSeason);
  const { primary, secondary } = getSubNavSections(phase);         // nav adapts to the season phase
  return (<div>...<LeagueSubNav leagueId={league.id} primary={primary} secondary={secondary} />{children}</div>);
}
```

**Points to note:** the same auth+ownership check the actions do also guards the _page_;
a fired/retired league renders a `CareerEndRecap` **instead of** any children (a
data-model-driven read-only lock); and the nav is computed from the current _league phase_
(regular season vs. playoffs vs. offseason vs. draft), so the UI only shows what's
reachable now.

## Client components — two ways to call a server action

Anything interactive starts with `"use client"`. There are exactly two patterns for
triggering a write:

### Pattern A — a `<form action={serverAction}>`

Used where the browser can just POST form fields (e.g. `SignOfferForm`, `HireStaffForm`,
`DeleteLeagueButton`, and the job-market "take the job" buttons). The server action
receives `FormData`; no client JS state needed. Example shape:

```tsx
<form action={createLeagueAction}>
  <input type="hidden" name="teamId" value={team.id} />
  <button type="submit">Take the job →</button>
</form>
```

### Pattern B — imperative call inside `useTransition`

Used where the UI needs pending state / a result (e.g. `SimulateControls`):

```tsx
"use client";
import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateTarget } from "@/lib/actions/simulation";

export function SimulateControls({ leagueId, gamesRemaining }) {
  const [isPending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(gamesRemaining);

  function handleSimulate(target: SimulateTarget) {
    startTransition(async () => {
      const result = await simulateGamesAction(leagueId, target); // call the server action directly
      setRemaining((r) => Math.max(0, r - result.userGamesCompleted));
      // ...surface all-star break / season-complete messages...
    });
  }
  const disabled = isPending || remaining === 0;
  return (
    <button disabled={disabled} onClick={() => handleSimulate("NEXT_GAME")}>
      {isPending ? "Simulating..." : "Sim next game"}
    </button>
  );
}
```

`useTransition` gives a free `isPending` flag to disable buttons and show "Simulating…"
without a loading library. Note it also **mirrors a server-side guard** (`allStarWeekendPending`)
so the UI won't invite a click that would just no-op — the server is still authoritative,
this is just UX.

## State management — mostly the server

There is **no Redux/Zustand/global store**. The source of truth is the database; after a
write, the action's `revalidatePath(...)` makes Next re-render the server component with
fresh data. Client `useState` is only for _local, ephemeral_ UI — pending flags, an
optimistic counter, a modal's open/closed, a draggable list's in-progress order. This is
the intended App-Router model and keeps client state tiny.

## Drag-and-drop — the rotation board (`components/rotation/RotationBoard.tsx`)

The one genuinely stateful interactive surface, built on **dnd-kit**:

```tsx
"use client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { updateRotationAction } from "@/lib/actions/rotation";
```

The user drags players into a depth-chart order; `arrayMove` reorders the local list, and
saving calls `updateRotationAction`, which writes each player's `rotationSlot`/
`targetMinutesPerGame` — exactly the fields `resolveRotation` (doc 07) reads back to drive
the simulation. It also shows a live `MoraleIndicator` per player, since a role/minutes
change is precisely the event morale reacts to.

## Charts — Recharts

`RosterScatterChart`, `FanHappinessTrendChart`, `FinancesTrendChart`,
`NetIncomeHistoryChart` are `"use client"` Recharts components fed the per-season
**snapshot** rows (doc 09) — that's why the schema persists snapshots: a trend chart is a
cheap read, not a recompute. Team colors are passed as literal hex (the documented
convention, because Recharts can't read Tailwind classes).

## The notable "experience" components

Several features are richer client flows rather than a single form:

- **`TradeBuilder`** — the interactive trade UI; it runs the _same_ pure `validateTrade`
  (doc 01) client-side for a **live preview** before you submit, then `executeTradeAction`
  re-validates authoritatively on the server.
- **`DraftExperience` / `DraftBoard` / `ProspectBoard`** — the draft-night flow (board,
  prospect compare tray, pick reveal).
- **`DraftLotteryExperience` / `LotteryReveal`** — the animated lottery draw.
- **`LiveGameExperience` / `LiveGameScoreboard`** — the quarter-by-quarter playoff reveal
  fed by `simulateLiveGame` (doc 02).
- **`ActionCenter`** — the dashboard's "what should I do now" suggestions.
- **`NewsFeed`** — renders the `LeagueTransaction` stories with importance-based styling.
- **`marketing/*`** (`Hero`, `TeamLogoMarquee`, `GameplayShowcase`, `FinalCta`) — the
  landing page.

## Component families (the full `src/components/` map)

`auth/` · `career/` · `dashboard/` · `draft/` (+ `draft/lottery/`) · `fans/` ·
`finances/` · `freeagency/` · `layout/` (NavBar, LeagueSubNav) · `leagues/` ·
`marketing/` · `news/` · `players/` (PlayerAvatar, PlayerChip, profile) · `playoffs/` ·
`rotation/` · `schedule/` · `simulation/` · `staff/` · `teams/` · `allstar/` ·
`offseason/`.

---

## Interview one-liners

- "Pages are React Server Components that fetch their own data with Prisma, so there's no
  separate client data layer or REST API — the page _is_ the read endpoint, and a server
  action is the write endpoint."
- "There's no global state store: the database is the source of truth, and `revalidatePath`
  after a write re-renders the server component; client state is just pending flags and
  local UI, via `useTransition`/`useState`."
- "Writes are triggered either by a plain `<form action={serverAction}>` or by calling the
  action inside a `useTransition` when I need a pending state — and the same page-level
  auth+ownership check the actions use also guards the route."
- "The trade builder runs the exact same pure `validateTrade` in the browser for a live
  preview that the server re-runs authoritatively — one rule, two call sites."
