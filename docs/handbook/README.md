# Developer Handbook — NBA Front Office Simulator

This handbook exists to get **you** (the person who built this) to the point
where you can confidently explain and _defend_ every major engineering decision
in an interview. It focuses on **concepts, architecture, and trade-offs** — not
line-by-line code. Read it like a study guide, not a reference manual.

It's written assuming you know how to program but haven't done a lot of
"systems" work yet, so it defines the jargon (ORM, RSC, JWT, logistic curve,
apron, etc.) as it goes.

## How to read this

Go in order the first time; after that, jump around.

| #   | Doc                                                                  | What it covers                                                                                                            |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| —   | [README.md](./README.md) (this file)                                 | Index, elevator pitches, the 3 "hard problem" stories, what you'd improve                                                 |
| 01  | [01-overview-and-architecture.md](./01-overview-and-architecture.md) | What the app is, the full tech stack + _why_ each choice, the core architecture pattern, request lifecycle, folder layout |
| 02  | [02-database.md](./02-database.md)                                   | The data model — every important table, relationships, and why the schema looks like this                                 |
| 03  | [03-salary-cap-engine.md](./03-salary-cap-engine.md)                 | The CBA/salary-cap engine — the most technically impressive module                                                        |
| 04  | [04-simulation-engine.md](./04-simulation-engine.md)                 | How games and seasons are simulated (the algorithms)                                                                      |
| 05  | [05-data-pipeline.md](./05-data-pipeline.md)                         | The real-NBA-data ingestion pipeline (rosters + ratings) — your best "judgment" story                                     |
| 06  | [06-feature-modules.md](./06-feature-modules.md)                     | The gameplay systems (trades, free agency, draft, finances, GM career, fans, morale, staff, rotation)                     |
| 07  | [07-security-and-performance.md](./07-security-and-performance.md)   | Auth, authorization, input validation, SQL-injection safety, performance, trade-offs                                      |
| 08  | [08-interview-qa-bank.md](./08-interview-qa-bank.md)                 | A big bank of likely interview questions + strong answers, plus a one-line pitch per module                               |

## What this project is, in one sentence

> A full-stack web app where you run an NBA team as the General Manager —
> managing a real salary cap, making trades, signing free agents, drafting, and
> simulating seasons — built with Next.js, TypeScript, and PostgreSQL.

## Elevator pitches (memorize these)

**30 seconds (what):**

> It's an NBA "front office" simulator — a web app where you take over a real
> NBA team as GM. You manage the roster under the league's actual salary-cap
> rules, make trades that have to be cap-legal, sign free agents, run the draft,
> and simulate seasons that produce standings, playoffs, and awards. It's built
> with Next.js and React on the front end, TypeScript everywhere, and PostgreSQL
> through Prisma on the back end. There are about 780 automated tests.

**2 minutes (what + how + why it's interesting):**

> The core idea is that being an NBA GM is a constrained optimization problem —
> you want to win, but you're boxed in by the salary cap and the collective
> bargaining agreement. So the heart of the app is a **salary-cap engine** that
> models the real CBA: the cap, the luxury tax, the two "apron" spending limits,
> and the rules for how much salary has to match in a trade. That engine is
> written as **pure functions** — no database, no framework — so it's easy to
> test and reason about, and the game logic and the AI tools can both reuse it.
>
> Around that, there's a **season simulation engine**, a **trade system** that
> validates every deal against the cap, **free agency**, a **draft** with a
> lottery, and long-term systems like player development, injuries, team
> finances, and a "GM career mode" where your reputation carries across leagues.
>
> The most recent thing I built is a **data pipeline** that seeds each new game
> with the _current_, real NBA rosters and realistic player ratings, sourced
> legally from an open dataset — which forced some interesting decisions about
> data licensing, rating models, and keeping imported data separate from the
> game's own simulated state.

## The three "hard problems" — your interview ammunition

Interviewers love "tell me about the hardest technical problem you solved."
Have these three ready. Each has its own doc for depth.

### 1. Modeling the real NBA salary cap / CBA (see doc 03)

The NBA's Collective Bargaining Agreement is genuinely complicated: a soft cap,
a luxury tax, two "apron" thresholds that unlock/lock different privileges, and
a trade-matching rule where the salary you take back can't exceed a formula
based on the salary you send out. **The hard part** was deciding what to model
faithfully vs. simplify, and structuring it so the rules are _one source of
truth_ reused by the trade validator, the AI tools, and the UI — instead of the
same rule being re-implemented (and drifting) in three places. I solved that by
making the cap logic **pure, data-only functions** with the CBA numbers in one
constants table.

### 2. Getting _current, realistic_ player data without breaking the law or the sim (see doc 05)

The obvious data source — NBA 2K ratings — is proprietary and can't be legally
copied into a public project. **The hard part** was finding a legally-clean,
free, current data source, turning raw box-score stats into believable "2K-style"
overall ratings (a small modeling problem), and doing it through a
**provider-adapter architecture** so the app isn't welded to one data source.
Plus a crucial design rule: imported real-world data sets a save's _starting
state only_ and is never allowed to overwrite the game's own evolving simulation
afterward. I also hit a real bug during testing — re-importing stacked old and
new players in the shared table, showing 30+ per team — and fixed it by having
the seed retire superseded players.

### 3. Simulating a whole season without timing out (see doc 04)

A full NBA season is ~1,230 games, each needing a database write. Doing that in
one web request would time out on a serverless host. **The hard part** was
making "simulate my next 10 games" feel instant while still advancing all 30
teams' schedules correctly. I solved it by simulating in **bounded chunks** and
by making the game model cheap: instead of simulating every possession, I model
each game as a **logistic (S-curve) win probability** from the two teams'
strength ratings, which is fast, deterministic given a random seed, and easy to
test.

## "What would you improve?" (have honest answers ready)

- **The game simulation is coarse** — it's strength-vs-strength, not
  possession-by-possession, so individual box scores are generated
  approximately. I'd move to a lightweight possession model if I wanted
  realistic per-player stat lines.
- **Player ratings rest on box-score stats, not advanced metrics** (no
  BPM/VORP), because the free data source doesn't include them. A paid source
  or a fitted regression would improve rating accuracy.
- **Positions are inferred from height** (the data only gives Guard/Forward/
  Center), which is a heuristic, not ground truth.
- **No real-time multiplayer** — each league is single-user. Making it
  multi-GM would require locking/turn logic I haven't built.
- **Test coverage is strong on the pure logic but lighter on the UI** — I'd add
  more end-to-end (Playwright) coverage of full user flows.

## Fast facts to have on the tip of your tongue

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
  PostgreSQL (hosted on Neon) · Prisma ORM · Auth.js (NextAuth v5) · Zod ·
  Recharts · Vitest + Playwright.
- **Size:** ~40 database tables, ~780 automated tests, ~30 pages/routes,
  ~20 server-action modules.
- **Architecture in one line:** _pure functional core_ (all the rules and math
  as testable pure functions) wrapped by a thin _imperative shell_ (server
  actions that read/write the database).
