# 01 — Codebase Map

A real, annotated tour of where everything lives. You don't memorize this — you
learn the _shape_ so you can guess correctly where any given thing is.

## Top level

```
prisma/           # database schema, migrations, seed, data files
scripts/          # offline data-import scripts (run manually, not part of the app)
src/
  app/            # pages & routes (Next.js App Router)
  components/     # React components used by pages
  lib/            # ALL the logic: pure domains + server actions
  auth.ts         # Auth.js config
  generated/      # Prisma's generated client (do not edit)
docs/             # architecture notes, feature history, the handbooks
```

## `src/lib/` — where the brains live

This is the most important folder. It splits into **pure domains** and the
**actions shell**.

### The actions shell — `src/lib/actions/` (the app's "write API")

Each file is a set of `"use server"` functions for one domain. These are the only
files that touch `prisma` and `auth`.

```
actions/
  auth.ts              signUpAction / signInAction
  league.ts            createLeagueAction (bootstrap), deleteLeagueAction
  trade.ts             executeTradeAction  (traced in doc 02)
  freeAgency.ts        sign free agents
  draft.ts             run the draft; draftLottery.ts runs the lottery
  simulation.ts        simulateGamesAction (the chunked season loop)
  offseason.ts         advanceSeasonAction (the big end-of-season pass)
  rotation.ts          save the depth chart
  finances.ts          set business levers
  staff.ts             hire/fire; staffGeneration.ts generates the initial pool
  playoffs.ts          run playoff rounds
  allStarWeekend.ts    All-Star flow
  careerRecord.ts      compute a career snapshot; careerActions.ts (retire)
  leagueEvents.ts      injuries, milestones, morale events applied during sim
  competitiveness.ts   rank teams by strength (used by trade AI + news)
  leagueTeamStrength.ts compute every team's strength for a league
  players.ts           player-facing reads
  signingException.ts  cap-exception signing helpers
```

### The pure domains — `src/lib/<domain>/`

Each is a self-contained rules library with colocated tests. No DB.

```
cap/           the CBA/salary-cap engine (doc 03)
  constants.ts        SEASON_CAP_RULES table + getSeasonCapRules()
  capSheet.ts         computeCapSheet()
  apron.ts            ApronLevel enum + getApronLevel() + exception eligibility
  capStatusLabel.ts   human labels ("Over the first apron")
  multiYearProjection.ts   project a team's cap several seasons out
  financialFlexibilityGrade.ts   grade a team's future flexibility

trade/         trade rules (doc 03)
  validateTrade.ts    validateTrade() — the multi-team CBA validator
  salaryMatching.ts   maxIncomingSalaryCents(), canAggregateSalaries(), isUnderCapSpace()
  evaluateTradeOffer.ts   the CPU's "should I accept this?" logic

simulation/    game/season/playoff simulation (doc 04)
  simulateGame.ts     computeHomeWinProbability(), simulateGame()
  teamStrength.ts     computeTeamStrength()
  boxScore.ts         generateBoxScore()
  generateSchedule.ts round-robin schedule builder
  simulateSeries.ts   best-of-7; simulateLiveGame.ts quarter-by-quarter
  playoffSeeding.ts, playInTournament.ts
  leagueEvents.ts     injury/milestone rolls

valuation/     "how good / how valuable is a player" (doc 05)
  playerValue.ts      computePerformanceScore(), scoreToCapFraction(), evaluatePlayer()
  ageCurve.ts         ageValueMultiplier()
  playerValueTier.ts  bucket a rating into a tier label

contracts/     contract generation (doc 05)
  generateContract.ts generateContract()
  seededRandom.ts     createSeededRandom() — the injected PRNG

data-sources/  the real-NBA-data pipeline (handbook doc 05)
  canonical.ts, providers/, seedRating.ts, buildDataset.ts,
  validateDataset.ts, rosterConstruction.ts, teamCrosswalk.ts

gm/            GM career, AI, expectations (doc on features)
  jobSecurity.ts, seasonEvaluation.ts, expectationLevel.ts, payrollTier.ts,
  jobMarket.ts, careerRecord.ts, gmPersonality.ts, teamNeeds.ts,
  teamIdentity.ts, playerTradeValue.ts, reSigningDecision.ts, ...

finances/      team business model
  finances.ts, ownershipFinance.ts, franchiseIcon.ts, financeNews.ts,
  businessDecisions.ts (Finances-as-a-Pillar card catalog - see
  docs/FINANCES_PILLAR_DESIGN.md), sponsorship.ts (Phase 2 - CPU baseline +
  void-penalty math), ...

fans/          fanHappiness.ts, sentimentEvents.ts
morale/        generatePersonality.ts, moraleEvents.ts
draft/         generateDraftClass.ts, draftLottery.ts, scoutingProfile.ts, ...
league/        planLeaguePlayer.ts, ratingFromStats.ts, constants.ts
players/       age.ts (estimateAge, ageFromBirthDate), profileData.ts
staff/         coachModifiers.ts, staff generation helpers
transactions/  describeTransaction.ts, describeGameEvents.ts, newsImportance.ts
prisma.ts      the shared PrismaClient instance
```

## `src/app/` — the pages

Next.js App Router: a folder is a route, `page.tsx` is the page, `layout.tsx`
wraps its children. `[id]` is a dynamic segment (the league id).

```
app/
  page.tsx                     landing page
  sign-in/, sign-up/           auth pages
  leagues/page.tsx             "my leagues" list
  leagues/new/page.tsx         the GM job market (start a league)
  leagues/[id]/
    page.tsx                   the team dashboard (roster, cap, job security)
    layout.tsx                 in-league nav; locks the league if ended
    trades/new/page.tsx        trade builder
    free-agents/, draft/, rotation/, finances/, standings/,
    schedule/, playoffs/, staff/, fans/, leaders/, transactions/,
    all-star/, offseason/, history/
  career/page.tsx              cross-league GM career page
  players/[id]/page.tsx        a player profile
```

**Server vs client components:** pages are **server components** by default (they
`await prisma...` directly at the top). Files that need interactivity say
`"use client"` at the top (e.g. the trade builder, the drag-and-drop rotation
board, chart components).

## File-naming & convention cheat sheet

| You see…                                | It means…                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `foo.ts` + `foo.test.ts` side by side   | Every pure module has colocated Vitest tests — read the test for worked examples. |
| `"use server"` at top                   | A server action (does I/O).                                                       |
| `"use client"` at top                   | A React component that runs in the browser (interactive).                         |
| A function named `computeX` / `deriveX` | Pure calculation, returns a value.                                                |
| A function named `xAction`              | A server action (the shell).                                                      |
| A function named `describeX`            | Turns data into human-readable news/label text.                                   |
| A name ending in `Cents`                | `BigInt`, integer cents.                                                          |
| A param `rng: () => number`             | Injected randomness (testable).                                                   |
| A param `seed: string`                  | Feeds `createSeededRandom` for reproducible output.                               |
| `getSeasonCapRules(season)`             | The single entry point to CBA dollar figures.                                     |

## How the layers import each other (dependency direction)

```
app/ (pages)  ──imports──►  actions/  ──imports──►  pure domains (cap, sim, …)
                              │                          ▲
                              └────────also imports──────┘
pure domains import each other but NEVER import actions/, app/, or prisma.
```

The arrow never points backward: pure code doesn't know the database or the UI
exist. That one-way dependency rule is what keeps the core testable and reusable.
