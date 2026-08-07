# Deep Dive 08 — Server Actions & How It All Runs

Folder: `src/lib/actions/`. This is the **imperative shell** — the only code that
touches `prisma` and `auth`. Every pure engine in docs 01–05 exists to be _called_ from
here. This doc is the "walk me through what happens when a user does X" answer for the
four flows an interviewer is most likely to ask about. **Code blocks are real source.**

The universal shape (every action): **authenticate → authorize (ownership) → validate →
load (parallel) → compute (pure) → write (transaction) → revalidate.**

---

## Flow 1 — Sign in / sign up (`actions/auth.ts`)

The only actions that don't operate on a league. `signUpAction` validates with Zod,
checks the email isn't taken, **bcrypt-hashes** the password, creates the `User`, and
signs them in:

```ts
const passwordHash = await bcrypt.hash(parsed.data.password, 10);
await prisma.user.create({
  data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
});
await signIn("credentials", {
  email: parsed.data.email,
  password: parsed.data.password,
  redirectTo: "/leagues/new",
});
```

`signInAction` just validates + `signIn(...)`; Auth.js's `authorize` callback (doc 07's
security notes) does the `bcrypt.compare`.

---

## Flow 2 — Execute a trade (`actions/trade.ts`)

Covered block-by-block in **code-guide doc 02**; the essence: it loads both teams' real
rows in one `Promise.all`, re-checks the players are actually on the right teams (the
`where` clause _is_ the authorization), normalizes everything into `TradeAssetInput[]`,
runs the **pure** `validateTrade` (server-authoritative — the browser preview isn't
trusted), then runs `evaluateTradeOffer` to see if the CPU accepts, and only then writes
the moved assets with side effects (fan/morale/icon deltas + a news row). The pattern to
remember: **the client sends ids; the server re-loads and re-validates everything.**

---

## Flow 3 — Simulate games (`actions/simulation.ts`)

The chunked loop that avoids serverless timeouts (doc 04 has the pure model):

```ts
const CHUNK_SIZE = 50;
const TARGET_USER_GAMES = { NEXT_GAME: 1, NEXT_10_GAMES: 10 };
```

Conceptually: compute every team's strength once, then repeatedly pull the next ≤50
unplayed games **in chronological order**, `simulateGame` + `generateBoxScore` each,
apply `applyLeagueEvents` (injuries/CPU trades) + `applyPlayerMoraleEvents`, write the
chunk, and stop once the user's team has played its target number — every other team's
games in that window resolve too, so the league stays in sync.

**Finances as a Gameplay Pillar (Phase 1)** adds a second checkpoint alongside the
existing All-Star-break one: each chunk also calls `applyBusinessDecisionEvents`
(rolls/expires the Front Office Inbox), and if a `BREAKING` decision now sits `PENDING`
the loop `break`s early and returns `businessDecisionPending: true` — the client
(`SimulateControls`/`ScheduleExperience`) disables the sim buttons and links to
`/finances`, the same "must resolve before continuing" shape the All-Star gate
established. The function also refuses to simulate at all (mirroring the existing
weekend `PENDING` check) if a `BREAKING` decision was already sitting unresolved from a
prior call.

---

## Flow 4 — Advance a season (`actions/offseason.ts` → `advanceSeasonAction`) — the big one

This is the ~1,600-line **grand orchestrator** and the best single answer to "how does
the whole simulation fit together." Its import list alone pulls in _every_ pure system —
development, retirement, awards, finances, ownership, career, fans, morale, staff,
expectations, draft picks. It is the imperative shell at its purest: **it computes almost
nothing itself; it loads data, calls ~30 pure functions in order, and writes the
results.**

### Step 0 — guard everything before mutating anything

```ts
export async function advanceSeasonAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);      // auth + ownership in one helper
  const season = league.currentSeason;
  const newSeason = season + 1;

  if (league.endedAt) throw new Error("This franchise has ended - it can no longer be advanced.");

  const finals = await prisma.playoffSeries.findFirst({ where: { leagueId, season, round: 4 } });
  if (!finals?.winnerTeamId) throw new Error("Crown a champion in the playoffs before advancing...");

  const [totalDraftPicks, pendingDraftPicks] = await Promise.all([...]);
  if (totalDraftPicks === 0 || pendingDraftPicks > 0) throw new Error("Finish the draft before advancing...");

  const alreadyAdvanced = await prisma.game.count({ where: { leagueId, season: newSeason } });
  if (alreadyAdvanced > 0) throw new Error("This season has already been advanced.");
```

**Why this matters (a great interview point):** a season transition is destructive and
irreversible, so the action refuses to run unless the world is in a valid state — playoffs
finished, draft finished, not already advanced. Guard clauses first, mutations later.

### Step 0.5 — load the world (and note the ordering caveat)

It loads every active `LeaguePlayer` (with contract + personality), all staff, and builds
`Map`s for O(1) lookups. It **captures the outgoing season's expectation and payroll now**,
before the contract-expiry cleanup deletes the `ContractYear` rows a payroll snapshot
depends on:

```ts
const [priorExpectation, oldSeasonContractYears] = userLeagueTeamId
  ? await Promise.all([
      prisma.seasonExpectation.findUnique({ where: { leagueId_season: { leagueId, season } } }),
      prisma.contractYear.findMany({ where: { season, contract: { leagueTeamId: userLeagueTeamId } }, select: {...} }),
    ])
  : [null, []];
```

That "capture before you delete" ordering is a subtle real-world correctness detail worth
being able to point to.

### The ordered pipeline (what it does, in sequence)

Each of these is the shell reading data → calling a pure function → writing. The real
section markers from the file:

1. **Player development/decline** — for each player, `developPlayerRating(...)` moves them
   toward or away from potential (fed by dev-coach quality + facilities investment), and
   `shouldRetire(...)` retires the old ones.
2. **Season awards** — `computeMVP`, `computeRookieOfTheYear`, `computeDefensivePlayerOfTheYear`,
   `computeSixthManOfTheYear`, `computeMostImprovedPlayer`, plus `computeCoachOfTheYear` —
   all pure over the season's box-score aggregates → `SeasonAward` rows + news.
3. **CPU re-signing / roster churn** — CPU teams decide which expiring free agents to keep
   (`evaluateReSigningDecision`, using the same identity/need weighting as the trade AI,
   plus `financialSpendingResistance` for cash-strapped teams) → new `Contract`s.
4. **Staff progression** — staff age, some retire (`shouldStaffRetire`), salaries recompute.
5. **Owner evaluation & job security (the user's team)** —
   `computeActualOutcome(PlayoffSeries)` → `evaluateSeason(expectation, outcome)` →
   `computeConfidenceDelta(verdict, payrollTier, fans, finances)` → update `ownerConfidence`.
   If it hits 0 → **fired**: snapshot a `CareerRecord`, apply `computeReputationDelta` to
   `User.gmReputation`, set `League.endedAt`.
6. **Franchise finances (all 30 teams)** — `computeSeasonRevenue`/`computeSeasonExpenses`/
   `computeNetIncome`/`computeFinancialHealth`/`computeFranchiseValue` → `FinancialSnapshot`
   rows + cash update + `FINANCIAL_REPORT` news; ownership financial standing
   (`computeFinancialStanding`) can issue/resolve a profitability mandate.
7. **Fan happiness (all 30 teams)** — `computeFanHappinessDelta` (reusing the season
   verdict) → `fanHappiness` update + `FanHappinessSnapshot`.
8. **Set up the next season** — `generateRoundRobinSchedule(...)` → `Game` rows for
   `newSeason`; `buildFuturePickRows(...)` extends the rolling draft-pick window;
   `computeExpectationLevel(payrollTier, teamStrength)` → the new `SeasonExpectation`.
9. **Finalize** — `prisma.league.update({ currentSeason: newSeason, ... })`, then
   `revalidatePath(...)`.

**The one-sentence version to say out loud:** _"Advancing a season is a single big
server action that guards the world is valid, then runs every pure subsystem in order —
develop players, hand out awards, run CPU roster moves, evaluate my job against
ownership's expectation, close the books financially, update the fanbase, and set up next
year's schedule/picks/expectation — writing each result as it goes."_

---

## Flow 5 — Create a league (`actions/league.ts` → `createLeagueAction`)

The bootstrap (covered in the data-pipeline work): reputation-gate the chosen team, then
**bulk-create** the whole save — `LeagueTeam`s (with the id-remap `Map` pattern),
`LeaguePlayer`s from the current dataset (seed ratings, top-15-per-team trim, surplus →
free agents), generated `Contract`s/`ContractYear`s, the schedule, future picks, personality
profiles, staff, and the season-1 expectation — in a handful of `createManyAndReturn`
calls.

---

## Why the shell/pure split pays off here (the takeaway)

`advanceSeasonAction` is 1,600 lines of **orchestration and I/O** — loads, `Map`s, writes,
ordering. But every actual _decision_ in it (does this player improve? did I meet
expectations? is this team profitable? what's the new schedule?) lives in a small, pure,
unit-tested function elsewhere. That's the whole architecture in one file: **the messy,
effectful, hard-to-test glue is concentrated in the shell; the rules stay pure and
tested.** If you can explain that about this one action, you've explained the codebase.

## Interview one-liners

- "Every write goes through a server action with the same skeleton — authenticate,
  authorize by ownership, validate, load in parallel, compute with a pure function, write
  in a transaction, revalidate."
- "Advancing a season is one big orchestrator that guards preconditions, then calls ~30
  pure subsystems in order and persists each — it computes almost nothing itself, which is
  the pure-core/imperative-shell split made concrete."
- "The client only ever sends ids; the server re-loads and re-validates everything, so the
  browser is never the authority."
