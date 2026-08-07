# 01 — Overview, Stack & Architecture

## 1. What the application is

You play the **General Manager** of one NBA team inside a self-contained
"league" (a save file). You:

- build a roster under the real salary cap,
- trade players and draft picks (deals must be cap-legal),
- sign free agents,
- run the draft (with a weighted lottery),
- set your rotation,
- simulate games → get standings, playoffs, awards,
- manage the business side (finances, fans, staff),
- and live with long-term consequences (player development/decline, injuries,
  your job security, your GM reputation across leagues).

Everything the other 29 teams do is handled by simple AI.

## 2. The tech stack — and _why_ each piece

Interviewers often ask "why did you pick X?" Here's a defensible answer for each.

### Next.js 16 (with the App Router) — the web framework

- **What it is:** a React framework that renders pages on the **server** by
  default (React Server Components / "RSC"), with a built-in router, and
  "server actions" (server functions you can call directly from a form).
- **Why:** the app is very **data-heavy and read-mostly** (dashboards, rosters,
  standings). Server rendering means each page fetches exactly the data it needs
  from the database on the server and sends finished HTML — no giant client-side
  data-fetching layer, no separate REST API to build and secure. It also gives
  one codebase for front end and back end in one language.
- **Alternative considered:** a plain React SPA + a separate Express/Nest API.
  Rejected because it doubles the surface area (two apps, an API contract to
  maintain, CORS, its own auth plumbing) for no benefit in a project where the
  same person owns both sides.

### TypeScript — the language

- **Why:** the domain has lots of structured data (contracts, cap sheets,
  ratings) where a wrong field name or unit is a real bug. Static types catch
  those at compile time. It also makes the code self-documenting, which matters
  for a large solo project.

### PostgreSQL — the database

- **What it is:** a relational (SQL) database.
- **Why:** the data is **highly relational** — a league has teams, teams have
  players, players have contracts, contracts have yearly salaries, trades move
  assets between teams. That's a web of foreign-key relationships, which is
  exactly what relational databases are built for. I also rely on **transactions**
  (all-or-nothing writes) when, e.g., executing a trade or ending a career —
  Postgres gives me that guarantee.
- **Alternative considered:** a document database like MongoDB. Rejected because
  the data isn't document-shaped; modeling "which team owns this 2027 2nd-round
  pick after three trades" in documents would mean re-implementing joins by hand.
- **Hosting:** Neon (serverless Postgres) so it works with serverless deploys.

### Prisma — the ORM

- **What it is:** an **ORM** (Object-Relational Mapper) — a library that lets you
  query the database with typed JavaScript objects instead of raw SQL strings,
  and that generates the SQL for you.
- **Why:** (1) **type safety** — the query results are fully typed to match the
  schema, so the database and the code can't silently disagree; (2) **migrations**
  — the schema lives in one file (`schema.prisma`) and Prisma generates versioned
  SQL migration files from it; (3) **SQL-injection safety** — Prisma always
  parameterizes queries, so user input can never be interpreted as SQL.
- **Alternative considered:** raw SQL (more control, but you hand-maintain types
  and migrations) or a query builder like Knex (less type safety). Prisma's
  end-to-end typing won for a TypeScript project.

### Auth.js / NextAuth v5 — authentication

- **Why:** authentication is easy to get subtly wrong. Auth.js handles session
  management, cookies, and CSRF. I use its **Credentials** provider (email +
  password) with **bcrypt** for hashing. Details in doc 07.

### Supporting libraries

- **Zod** — runtime validation of untrusted input (form data). TypeScript types
  vanish at runtime; Zod re-checks the shape at the boundary.
- **Recharts** — the charts (finances, fan trends).
- **dnd-kit** — drag-and-drop for the rotation/depth-chart editor.
- **bcryptjs** — password hashing.
- **Vitest** — unit tests (fast, runs the pure logic). **Playwright** —
  end-to-end browser tests.

## 3. The core architecture pattern: _functional core, imperative shell_

This is the single most important thing to be able to explain. It's the backbone
of the whole codebase and the reason there are ~780 tests.

**The idea:** split every feature into two layers.

1. **Functional core (`src/lib/**`)** — the _rules and math_, written as **pure
   functions**. A pure function only depends on its inputs and only returns a
   value — it never touches the database, the network, the clock, or randomness
   (except a random generator you _pass in_, so tests can make it deterministic).
   - Examples: `computeCapSheet(contracts)` → a cap sheet; `simulateGame(strengthA,
strengthB, rng)` → a score; `computeSeedOverallRating(stats)` → a 60–99 rating.
   - Because they're pure, you can unit-test them exhaustively with plain inputs
     and no database. **This is why the test count is high and the tests are fast.**

2. **Imperative shell (`src/lib/actions/**`)** — the _plumbing_. These are
   Next.js **server actions**: they read data from the database, call the pure
   core to compute the result, then write the result back. They handle the messy,
   effectful world so the core doesn't have to.
   - Example: the "execute trade" action loads both teams' contracts, calls the
     pure cap-validation functions, and — if legal — writes the moved assets in a
     database transaction.

```
   Browser (form submit)
        │
        ▼
   Server Action (imperative shell)  ── reads DB ──► pulls the raw data
        │                                             (contracts, ratings…)
        ▼
   Pure functions (functional core)  ── computes ──► the decision/result
        │                                             (is this legal? what score?)
        ▼
   Server Action                     ── writes DB ─► saves the result (transaction)
        │
        ▼
   revalidatePath() → Next re-renders the affected pages with fresh data
```

**Why this matters / how to defend it:** the hard-to-test parts (database,
randomness) are pushed to the thin edges, and the hard-to-_get-right_ parts (the
rules) are pure and fully tested. It also kills duplication — the cap rules exist
once and are reused by the trade validator, the free-agency signer, and the UI.

## 4. Request lifecycle (what happens when you click "Simulate")

1. You submit a form (or click a button that calls a server action).
2. Next.js runs the **server action** on the server. First line is almost always
   an **auth check** (`const session = await auth()`) — no session → redirect to
   sign-in.
3. The action **authorizes**: it loads the league and checks _you own it_ before
   doing anything.
4. It **validates** input (Zod for text input; type/range checks otherwise).
5. It loads the needed rows from Postgres via Prisma.
6. It calls the **pure core** to compute the result.
7. It **writes** the result — using a `$transaction` when several rows must change
   together (so a half-finished trade can never be saved).
8. It calls `revalidatePath(...)` so Next throws away the cached page and
   re-renders it with the new data, or `redirect(...)` to send you somewhere.

## 5. Folder layout (where to find things)

```
prisma/
  schema.prisma        # the entire database schema (source of truth)
  migrations/          # versioned SQL migrations Prisma generated
  seed.ts              # loads reference data (teams + current players) into the DB
  data/                # static/imported data files (teams, the NBA dataset)
src/
  app/                 # every page/route (Next App Router). Server-rendered by default.
    leagues/[id]/...   # the in-league screens (roster, trades, draft, finances…)
  lib/
    actions/           # server actions — the "imperative shell" / the app's write API
    cap/               # salary-cap engine (pure)
    simulation/        # game/season/playoff simulation (pure)
    data-sources/      # the real-data ingestion pipeline (pure + adapters)
    gm/                # GM career, job security, expectations (pure)
    finances/          # team finances model (pure)
    fans/ morale/ draft/ contracts/ valuation/ staff/ ...  # more pure domains
    prisma.ts          # the shared Prisma client instance
  auth.ts              # Auth.js configuration (providers, session, callbacks)
  components/          # React components used by the pages
docs/                  # architecture notes, feature history, this handbook
```

**The mental model:** `src/lib/**` (minus `actions`) is the _brain_ (pure rules);
`src/lib/actions/**` is the _hands_ (touch the database); `src/app/**` is the
_face_ (what the user sees).
