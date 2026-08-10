# NBA Front Office Simulator

Run an NBA franchise as its general manager — build a roster, negotiate
trades against the real 2023 CBA salary-cap rules, scout a draft class, and
simulate seasons forward from a real snapshot of the league.

**[Live demo →](https://nba-front-office-simulator-8s2o.vercel.app)**

Solo-built. Next.js 16 · TypeScript · PostgreSQL · **1,240 unit tests across
139 files**, plus 10 end-to-end specs, all run in CI on every push.

<!-- SCREENSHOTS: see docs/PHOTO_SOURCING_BRIEF.md; hero should be the trade builder -->

## What it is

Every save starts from a real snapshot of the NBA — 30 teams, 497 real
players with real season averages — and diverges independently from there,
the same way a franchise mode separates static roster data from your save
file. Trade in your league and nothing changes in anyone else's.

The rules are the product. Most trade tools stop at salary matching; this one
adjudicates apron classification, second-apron no-aggregation, no-trade
clauses, a Stepien-lite pick rule, multi-team trades, and mid-level exception
eligibility gated on apron status — and the same `validateTrade` engine that
gives you live feedback in the builder re-runs server-side before anything
commits.

## The interesting engineering

**A rules engine for actual regulatory complexity.** The CBA is genuine
domain complexity: cap, luxury tax, two aprons, four MLE variants, Bird /
Early-Bird / Non-Bird re-signing rights, and salary-matching breakpoints that
change per season. It lives in `src/lib/cap/` and `src/lib/trade/` as pure
functions over one season-keyed constants table, so a rule change is a data
change. `validateTrade` returns a list of violations rather than a boolean,
because "why is this illegal" is the useful answer. Money is `BigInt` cents
everywhere — a float rounding error in cap math is a legality bug.

**A simulation calibrated against real distributions, not vibes.** A game is
a point margin drawn from a normal distribution centred on the strength
differential, with the winner falling out of the margin's sign — so win
probability and margin can never disagree, because they are one draw. The
constants each carry the experiment that set them. The model it replaced
produced identical margin distributions for a 97.5% favourite and a coin
flip, which took 246,000 simulated games to notice.

**Multi-tenancy from the data model up.** Reference data (who a player really
is) and per-save state (what is true in this timeline) are separate layers
with separate lifecycles. Ownership is enforced at the data-access layer and
returns 404 rather than 403, so a non-owner cannot confirm a league exists.

**Auditing my own system.** Three empirical audits measured the running game
against 13 live saves and hundreds of simulated seasons. They found, among
other things, that every real player was permanently 27 years old — so nobody
aged, declined, or retired, and a six-season save had recorded zero
retirements. Every unit test passed the whole time; they were correct
functions being fed a constant. The findings and the fixes are in
[docs/](docs/README.md).

Full rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS       |
| Database   | PostgreSQL, Prisma 7 ORM — 49 models, 51 migrations               |
| Auth       | Auth.js (NextAuth v5), multi-tenant per-user franchise saves      |
| Testing    | Vitest (unit) + Playwright (e2e)                                  |
| CI/CD      | GitHub Actions — migrate, seed, lint, typecheck, test, build, e2e |
| Deployment | Vercel + Neon Postgres                                            |

## Getting started

**Prerequisites:** Node 22+ and a PostgreSQL 16 database. For a local one:

```bash
docker run --name nba-fo -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

Then:

```bash
npm install
cp .env.example .env       # set DATABASE_URL and AUTH_SECRET (npx auth secret generates one)
npm run db:migrate         # applies the Prisma schema
npm run db:seed            # seeds 30 real teams + 497 real players from bundled fixtures
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose **Start a
franchise** to sign up and bootstrap a save. No API key is needed — the real
NBA fixtures are committed, so seeding works offline.

Regenerating those fixtures from source (not required to run the app) needs a
free [balldontlie](https://balldontlie.io) key in `.env`. See
[scripts/README.md](scripts/README.md).

### Scripts

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier write
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright e2e (builds and runs a production server)
npm run db:studio     # Prisma Studio
```

## Project status

Feature-complete as a single-player franchise game: a full season loop from
preseason through the playoffs, All-Star weekend, the draft lottery and
draft, and the offseason, with salary-cap, trade, free-agency, scouting,
finance, fan and GM-career systems on top. Deployed and playable at the demo
link.

Not built, recorded honestly: an AI GM assistant, GitHub OAuth, and
observability. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full list.

## License

MIT — see [LICENSE](LICENSE). A personal, non-commercial project; not
affiliated with or endorsed by the NBA.
