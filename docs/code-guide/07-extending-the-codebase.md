# 07 — Extending the Codebase (the mental model, applied)

The best proof you understand a codebase is knowing _where you'd make a change_.
Here are concrete "if I wanted to add X" recipes. Each reinforces the layering.

## The general recipe for a new gameplay feature

1. **Model the data** — add tables/columns to `prisma/schema.prisma`, then
   `npm run db:migrate` (creates + applies a migration and regenerates the client).
2. **Write the pure logic** — a new `src/lib/<domain>/*.ts` with the rules as pure
   functions + a colocated `*.test.ts`. No DB here.
3. **Write the server action** — a `src/lib/actions/<domain>.ts` that authenticates,
   authorizes (ownership), loads rows, calls your pure logic, writes results
   (`$transaction` if multi-row), and `revalidatePath`.
4. **Wire the bootstrap** — if new leagues need initial state, set it in
   `createLeagueAction`; if _existing_ leagues need it, add a `scripts/backfill-*.ts`.
5. **Build the UI** — a page/component under `src/app/leagues/[id]/<feature>/` that
   reads data (server component) and calls your action from a form.
6. **Verify** — `npm run typecheck`, `npm run lint`, `npm test`, then click through it.

That mirrors exactly how finances, GM career, and the data pipeline were built.

## Recipe A — Add a new data source (e.g. a second stats provider)

**This is the payoff of the adapter architecture — it's a small, local change.**

1. Create `src/lib/data-sources/providers/myProvider.ts` implementing the existing
   interfaces (`BioProvider`/`StatsProvider` from `providers/adapter.ts`) — i.e.
   write functions that return `CanonicalPlayerBio[]` / `ProviderSeasonStatLine[]`.
2. If its team codes differ, add them to `teamCrosswalk.ts`.
3. Use it in the import script (`scripts/import-hoopr-dataset.ts`) or a new script —
   pass its output to the _unchanged_ `mergeCanonicalPlayers` + `validateDataset`.
4. **Nothing else changes** — merge, rating, validation, seeding all program to the
   interface. That's the whole point of the canonical schema.

## Recipe B — Add a new trade rule (e.g. "can't trade a player signed <60 days ago")

1. Add a new violation code to `TradeViolation.rule` in `trade/validateTrade.ts`.
2. Add the check inside `validateTrade` (pure — it already receives all it needs as
   plain data; if it needs a new fact like "signed date," add it to the
   `TradeAssetInput`/`TradeTeamCapState` shape).
3. Populate that new fact in the action (`executeTradeAction`) when it builds the
   `assets`/`teamCapStates` from DB rows, and in the UI preview's builder.
4. Add a case to `validateTrade.test.ts`.

- **You do not touch** the execution/DB code — legality lives entirely in the pure
  validator, and both the server and the live preview get the new rule for free.

## Recipe C — Use a new stat in the rating (e.g. add "usage rate")

1. The column already exists (`PlayerSeasonStat.usagePct` is nullable) — if not, add
   it to the schema + migrate.
2. Make sure the pipeline fills it: the provider adapter maps it into
   `CanonicalSeasonStat` (leave `null` if the source lacks it — never fabricate).
3. Add its weighted term to `computePerformanceScore` (valuation) and/or
   `seedProductionScore` (data-sources/seedRating), guarding for `null`.
4. Re-run `npm run import:dataset` (regenerate the dataset) and `npm run db:seed`.
5. Recalibrate against the anchor players in the tests until the distribution looks
   right (this is exactly how the seed model was tuned).

## Recipe D — Add a new page/screen

1. Create `src/app/leagues/[id]/<name>/page.tsx` — a server component. `await` its
   data straight from Prisma at the top.
2. Add it to the in-league nav (there's a `subNavSections` list — the test enforces
   the count, so update both).
3. Any interactivity goes in a `"use client"` component under `src/components/`.

## The commands you'll actually run

```bash
npm run dev            # start the app locally (http://localhost:3000)
npm run db:migrate     # create + apply a migration after editing schema.prisma, regenerates client
npm run db:seed        # load teams + the current NBA dataset into the DB
npm run import:dataset  # regenerate prisma/data/nbaDataset.json from the source
npm run typecheck      # tsc --noEmit (types must pass)
npm run lint           # eslint
npm test               # vitest run (the ~780 unit tests)
npm run db:studio      # a GUI to browse the database
```

Two gotchas worth remembering (both bit during development):

- After `db:migrate`, a **long-running `next dev` must be restarted** to pick up the
  regenerated Prisma client, or you'll get "unknown column" errors against the new
  schema.
- The dev shell's working directory can drift — always run these **from the project
  root** (`nba-front-office-simulator/`).

## The self-test: can you answer these about _any_ feature?

If you can answer all five for a feature you didn't write, you understand the
codebase:

1. Which **page** shows it, and is it a server or client component?
2. Which **action** writes it, and what does its `Promise.all` load?
3. Which **pure module(s)** hold its rules, and what are their inputs/outputs?
4. Which **tables** store it, and what are the key relationships?
5. What's the one **design decision** behind it (and its trade-off)?

Doc 08 of the _handbook_ (`docs/handbook/`) has the interview-facing version of
these answers; this code-guide gives you the implementation to back them up.
