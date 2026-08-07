# 08 — Interview Q&A Bank + Cheat Sheet

The night-before-the-interview cram sheet. Practice saying these **out loud** —
knowing the answer and being able to _say_ it smoothly are different skills.

## Part A — One-line pitch per module (rapid recall)

| Module            | One sentence                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Whole project** | A full-stack web app to run an NBA team as GM under the real salary cap — trades, free agency, draft, and season simulation.                                                |
| **Architecture**  | Pure functional core (all rules/math as testable pure functions) wrapped by a thin imperative shell of server actions that touch the database.                              |
| **Cap engine**    | The real CBA — cap, tax, two aprons, trade matching — as pure functions with the numbers in one constants table, reused everywhere so the rules can't drift.                |
| **Simulation**    | Each game is a logistic win probability from team strengths; injected RNG makes it deterministic and testable; seasons run in chunks to avoid serverless timeouts.          |
| **Data pipeline** | Seeds current real rosters + derived ratings from a free MIT-licensed source via provider adapters, with a strict boundary that real data only sets a save's initial state. |
| **Database**      | Postgres via Prisma; reference data (real NBA) is copied into per-save league state at creation so each save evolves independently.                                         |
| **GM career**     | Owner confidence (job security) + cross-league reputation that gates a job market — long-term stakes beyond one season.                                                     |
| **Finances**      | A business layer that consumes existing signals (attendance, market, playoffs) and gives real levers, but never lets money override the cap.                                |
| **Security**      | Auth.js + bcrypt + JWT sessions; every action re-checks ownership server-side; Zod validates input; Prisma prevents SQL injection.                                          |

## Part B — General project questions

**Q: Give me the overview of this project.**

> _(Use the 2-minute pitch from the README — what it is, the cap engine as the
> heart, the systems around it, and the data pipeline as the newest piece.)_

**Q: Why did you build it this way — the pure core / imperative shell split?**

> To make the hard-to-get-right rules (cap math, ratings, simulation) pure and
> exhaustively testable, and to isolate the hard-to-test effects (database,
> randomness) at the thin edges. It also means each rule lives once and is reused,
> so the trade validator, free agency, the AI, and the UI can't disagree. That
> discipline is why there are ~780 fast unit tests.

**Q: What was the hardest part?**

> _(Pick one of the three hard-problem stories: the CBA modeling, the legal/rating
> data pipeline, or scaling season simulation. Go deep on one rather than skimming
> all three.)_

**Q: How did you test it?**

> Mostly unit tests on the pure core with Vitest — because the rules are pure
> functions, I can test hundreds of cap and rating scenarios with plain inputs and
> a seeded random generator, no database. Playwright covers key end-to-end flows.
> The high-value logic is heavily covered; the UI is lighter, which I'd expand.

**Q: How does data flow through the app end to end?**

> A form submit calls a server action. The action authenticates, authorizes
> (ownership check), validates input, loads rows via Prisma, calls the pure core to
> compute the result, writes it back in a transaction if multiple rows change, then
> revalidates the affected pages so the UI shows fresh data.

**Q: Why Next.js / Postgres / Prisma specifically?**

> _(README fast-facts + doc 01: Next.js for server-rendered, data-heavy pages and
> one full-stack codebase; Postgres because the data is deeply relational and I
> need transactions; Prisma for end-to-end type safety, migrations, and
> parameterized queries.)_

**Q: It's a solo project — how would this change on a team?**

> The pure/shell split and one-source-of-truth rules make it easy to divide work by
> domain without stepping on each other. I already keep architecture notes and a
> feature-decision log in `docs/`, which is the kind of shared context a team
> needs. I'd add PR review, more end-to-end tests, and CI to run the suite on every
> change.

## Part C — Deeper / curveball questions

**Q: How would you scale this to thousands of concurrent users?**

> Reads are already server-rendered and could be cached/CDN'd. The database is the
> shared bottleneck — I'd add read replicas, make sure the hot queries stay indexed,
> and keep the heavy simulation work chunked (or move it to a background job/queue
> so a long simulation never blocks a web request). The pure core is stateless, so
> the app layer scales horizontally.

**Q: A user's season simulation times out halfway. What happens to the data?**

> Each chunk is written as it completes, so progress isn't lost — the next click
> resumes from where the schedule left off (games are resolved in chronological
> order). I'd make each chunk write transactional so a chunk is all-or-nothing.

**Q: How do you keep two systems (e.g. cap engine and trade UI) from disagreeing?**

> They call the exact same pure functions and the same constants table — there's
> one implementation of the rule, so there's nothing to disagree about. That's the
> main reason I centralized the CBA numbers.

**Q: Why store money as integers?**

> Floating point can't represent money exactly and cap math must be exact, so I use
> integer cents; BigInt because salary-in-cents exceeds the safe integer range.

**Q: What's a bug you found and how did you debug it?**

> The "30+ players per team" bug (doc 05): I found it by testing the app like a
> user, reproduced it, and traced it with targeted database queries to shared
> mutable reference data — re-importing had stacked two datasets. I fixed it by
> retiring superseded players safely without breaking older saves. Lesson: shared
> mutable state needs an explicit cleanup step, and "test it like a user" catches
> things unit tests don't.

**Q: If you had two more weeks, what would you build?**

> A lightweight possession-based simulation for realistic per-player box scores,
> and the real-prospect draft pipeline (replacing generated prospects with scouted
> real ones) using the same adapter architecture I already built for rosters.

**Q: What are you most proud of?**

> That it's a large system that stayed maintainable — the architecture let me keep
> adding systems (finances, career mode, the data pipeline) without the codebase
> collapsing, because the rules are pure, tested, and reused. And that I made real
> engineering-judgment calls, like refusing to scrape proprietary ratings and
> building a legal, honest alternative instead.

## Part D — 60-second "walk me through the architecture" script

> At the top is Next.js with the App Router — pages are server components that fetch
> their own data, and writes go through server actions instead of a separate REST
> API. Underneath, I split every feature into a pure functional core and a thin
> imperative shell. The core — the salary-cap engine, the simulation, the rating
> models — is pure functions with no database or randomness, so it's exhaustively
> unit-tested. The shell is the server actions: they authenticate, check that you
> own the league, validate input with Zod, load data through Prisma, call the pure
> core, and write results back to Postgres in a transaction. The data itself splits
> into shared reference data — the real NBA teams and players — and per-save league
> state that's copied from it at league creation, so every save evolves
> independently. Auth is Auth.js with bcrypt-hashed passwords and JWT sessions, and
> Prisma keeps every query parameterized against SQL injection. The through-line is
> one source of truth for every rule, which is what kept a project this big
> maintainable and testable.

## Part E — Final tips

- **Lead with the problem, then the solution.** "NBA GMing is constrained by the
  cap, so the heart of the app is a cap engine that…" beats "I have a cap engine."
- **Name the concept.** Saying "logistic curve," "single source of truth,"
  "dependency inversion via adapters," "parameterized queries," "idempotent seed"
  signals you know the vocabulary.
- **Own the trade-offs.** Confidently saying "the sim is approximate _on purpose_,
  here's why, and here's what I'd change" is stronger than pretending it's perfect.
- **Have the three hard-problem stories rehearsed** (README) — most "hardest thing"
  questions map to one of them.
