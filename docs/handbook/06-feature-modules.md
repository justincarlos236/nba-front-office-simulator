# 06 — Feature Modules & the "API"

The deep modules have their own docs (cap 03, simulation 04, data 05). This doc
covers the remaining gameplay systems at the level an interviewer cares about:
**what problem each solves and the one key decision behind it.** It also explains
how the app's "API" works, since there isn't a traditional REST API.

## The "API": server actions, not REST endpoints

There is **no separate REST/GraphQL API**. The write operations are **Next.js
server actions** in `src/lib/actions/*.ts` — server-only functions the front end
calls directly (usually from a `<form action={...}>`). Reads happen inside
**server components** (the page fetches its own data on the server).

**Every server action follows the same lifecycle** (this is worth memorizing as
"the shape of a request"):

1. `auth()` — is anyone signed in? If not, redirect.
2. **Authorize** — load the league and confirm the signed-in user owns it.
3. **Validate** input (Zod for free text; type/range checks otherwise).
4. **Load** the needed rows (Prisma).
5. **Compute** with the pure core.
6. **Write** — a `$transaction` if multiple rows must change together.
7. `revalidatePath()` / `redirect()` — refresh the UI.

**Why server actions instead of REST:** for a single-frontend app, REST would mean
building and securing a second surface (routes, request/response schemas, CORS)
that only this app calls. Server actions give type-safe, directly-callable server
functions with auth built into the same request — less code, fewer seams.

Think of each action file as a "controller" for one domain:

| Action file                           | Domain / responsibility                             |
| ------------------------------------- | --------------------------------------------------- |
| `auth.ts`                             | Sign up / sign in (see doc 07).                     |
| `league.ts`                           | Create a league (bootstrap), delete a league.       |
| `trade.ts`                            | Propose / validate / execute trades.                |
| `freeAgency.ts`                       | Sign free agents (cap-checked).                     |
| `draft.ts`, `draftLottery.ts`         | Run the lottery and the draft.                      |
| `simulation.ts`                       | Simulate games (chunked).                           |
| `offseason.ts`                        | Advance the season (the big end-of-year pass).      |
| `rotation.ts`                         | Save the user's depth chart / minutes.              |
| `finances.ts`                         | Set the business levers (ticket price, investment). |
| `staff.ts`, `staffGeneration.ts`      | Hire/fire coaches & medical staff.                  |
| `playoffs.ts`, `allStarWeekend.ts`    | Postseason & All-Star flow.                         |
| `careerRecord.ts`, `careerActions.ts` | GM career (retire, record).                         |

## Trades (`trade.ts`)

- **Problem:** let users swap players and picks, but only _cap-legal_ deals.
- **Key decision:** the action is the imperative shell around the pure cap engine
  (doc 03). It validates salary matching + apron rules, and executes the asset
  moves in a **transaction** so a trade can never be half-applied. Losing a genuine
  "franchise icon" also triggers a fan/valuation hit and a news story — trades have
  consequences beyond the cap sheet.

## Free agency (`freeAgency.ts`)

- **Problem:** sign unsigned players without breaking the cap.
- **Key decision:** reuses the same cap functions as trades — an offer is only
  valid if the resulting cap sheet is legal (using cap space or the right
  exception). CPU teams also make offers, so there's competition for players.

## Draft (`draft.ts`, `draftLottery.ts`, `src/lib/draft/`)

- **Problem:** an annual influx of new talent, with the worst teams getting the
  best odds.
- **Key decisions:** (1) a **weighted lottery** — worse record = more ping-pong
  balls = better odds, implemented as a weighted random draw (a real, testable
  probability algorithm). (2) **Future picks are tradeable** because pick rows
  exist years ahead of time (see doc 02). (3) Prospects are currently _generated_
  fictional players — a documented simplification; replacing them with real
  scouted prospects is a planned future phase.

## Team finances (`src/lib/finances/`)

- **Problem:** make the _business_ of running a franchise matter — revenue,
  expenses, cash, franchise value — without turning into an accounting game.
- **Key decision:** finances **consume existing signals** (attendance from fan
  happiness, market size, playoff runs, payroll) rather than inventing parallel
  systems. Two simple levers (ticket pricing, facility/medical investment) give the
  user real trade-offs. Crucially, **money never buys cap space** — the cap stays
  authoritative; finances create _pressure_ (owner patience, mandates), not
  rule-breaking.

### Finances as a Gameplay Pillar (Phase 1 — the Front Office Inbox)

- **Problem:** the finance system above is a good _simulation_ but a weak
  _game_ — a few dropdowns set once a season, consequences deferred to a
  batch computed at the season boundary, no counterparty, nothing
  irreversible. See `docs/FINANCES_PILLAR_DESIGN.md` for the full
  seven-system design and its architecture-overlap review.
- **Phase 1 ships the spine:** a `BusinessDecision` model (headline, body, 2+
  options each with real cash/fan-happiness/owner-confidence costs, a
  deadline, a deliberately-suboptimal default) generated during regular-
  season simulation (`applyBusinessDecisionEvents`,
  `src/lib/actions/leagueEvents.ts`) from a small, growable card catalog
  (`src/lib/finances/businessDecisions.ts`) — 8 cards at launch (sponsor
  pullouts, arena crises, ticketing scandals, preseason exhibitions,
  documentary deals, and more), each gated on real save state.
- **Key decision — no option is free or dominant.** Every card is checked
  (and unit-tested as a property across the whole catalog) so a rational
  player can't pick a card's option without giving something up.
- **Key decision — simulation can be interrupted.** A `BREAKING`-severity
  decision halts `simulateGamesAction` mid-batch, the same "must resolve
  before continuing" shape the All-Star-weekend gate already established —
  this is what makes the inbox feel alive rather than a menu you have to
  remember to check.
- **Key decision — consequences land immediately, not just at season end.**
  A new `BusinessLedgerEntry` table accrues each resolved decision's
  cash effect in-season; `advanceSeasonAction` sums it into the P&L
  alongside every other revenue/expense bucket, closing the "batch-only P&L"
  gap.
- CPU teams never roll business decisions in Phase 1 (a deliberate Tier-2
  abstraction — see the design doc's CPU-depth section); later phases add
  Tier-1 CPU events for franchise-defining moments only.

### Phase 2 — Sponsorship & Commercial Deals

- **Problem:** give money a real counterparty and a real commitment. Phase
  1's cards are one-shot; nothing in the pillar yet asks the user to sign
  something that outlives the moment.
- **Key decision — recurring, not instant.** A signed `SponsorshipDeal`
  pays out every season it's `ACTIVE` (applied in `advanceSeasonAction`
  alongside every other revenue bucket), not as a lump sum at signing. Four
  cards: a term-length trade-off ("bet on yourself"), a "star clause" deal
  contingent on a named player staying rostered, a brand-reputation
  trade-off, and an equity-swap that trades cash for a franchise-value
  premium.
- **Key decision — CPU never signs a deal.** The 29 CPU teams get a
  formula-computed sponsorship baseline (`computeCpuSponsorshipRevenueCents`,
  `src/lib/finances/sponsorship.ts`) instead — deliberately below what a
  user can negotiate, since CPU never shops for the best offer. Same Tier-2
  abstraction precedent as Phase 1.
- **Key decision — clauses warn, never block.** Trading away a star-clause
  deal's condition player voids the deal and charges a real buyout penalty
  (`computeSponsorshipVoidPenaltyCents`), but the trade itself is always
  legal if the cap allows it — the trade builder shows a non-blocking
  warning, consistent with "cap/CBA rules stay authoritative" everywhere
  else in the simulator.

## GM career mode (`src/lib/gm/`)

- **Problem:** give the whole game long-term stakes beyond one season.
- **Key decisions:**
  - **Job security** (`ownerConfidence`, 0–100): each season the owner evaluates
    you against a **`SeasonExpectation`** set at the start (based on roster
    strength + payroll). Meet it → confidence up; miss it → down; hit zero →
    **fired** and the league becomes a permanent read-only record.
  - **Reputation** (on `User`, persists across leagues) gates a **job market**: a
    title contender only hires a proven GM; a rebuild will hire anyone. Where you
    take a job also sets your starting "leash" (a contender = short leash).
  - **Why on `User`:** reputation is about _you_, so it must outlive any single
    save — that's what makes a "career" span leagues.

## Fans & morale (`src/lib/fans/`, `src/lib/morale/`)

- **Problem:** make winning/losing and roster moves _felt_.
- **Key decision:** `fanHappiness` drives attendance (→ revenue) and reacts to
  results, star power, and moves; player **personality profiles** drive morale,
  which reacts to role, winning, and being traded. Both are per-save state with
  per-season **snapshots** so trends are chart-able cheaply.

## Staff (`src/lib/staff/`)

- **Problem:** coaches/medical staff should matter.
- **Key decision:** staff quality feeds **existing** systems — the head coach adds
  a small win nudge, the development coach speeds player growth, medical staff
  lowers injury frequency. It's another lever, not a separate game.

## Rotation (`src/lib/actions/rotation.ts`, `src/components/rotation/`)

- **Problem:** let the user control who plays and how many minutes.
- **Key decision:** a **drag-and-drop** depth-chart editor (dnd-kit) that writes a
  minutes distribution the simulation and box-score generator read. It validates
  that assigned minutes are internally consistent so you can't build an impossible
  rotation.

## Elevator explanation (30s, for "tell me about the features")

> On top of the cap engine and simulation, there's a full GM loop: cap-legal
> trades and free agency, a weighted-lottery draft with tradeable future picks,
> and long-term systems — player development and decline, injuries, team finances,
> fan happiness, staff, and a GM career mode where your reputation carries across
> save files and can get you hired by contenders or fired by impatient owners. The
> design rule throughout is that new systems _reuse_ existing signals instead of
> duplicating them, and money never overrides the salary cap.
