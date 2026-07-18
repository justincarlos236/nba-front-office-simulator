# NBA Front Office Simulator

**Live demo: [nba-front-office-simulator-8s2o.vercel.app](https://nba-front-office-simulator-8s2o.vercel.app)**

Run an NBA franchise like a real GM: manage rosters, negotiate trades against
the actual 2023 CBA salary-cap rules, sign free agents, and lean on an
AI assistant that grounds its advice in a real quantitative player-valuation
model instead of guessing.

This is a solo-built, production-style web app — not a tutorial project.
Every save starts from a real snapshot of the current NBA (teams, players,
contracts) and diverges independently from there, the same way franchise
modes in sports games separate static roster data from your save file.

## Why this project exists

Built as a portfolio centerpiece to demonstrate real software engineering
depth: complex domain logic (salary cap math, trade legality), a data
pipeline seeded from real-world data, multi-tenant auth, and an AI feature
that's grounded in computed data rather than a thin prompt wrapper. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the engineering rationale
and [docs/ROADMAP.md](docs/ROADMAP.md) for what's built vs. planned.

## Tech stack

| Layer      | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS             |
| Database   | PostgreSQL, Prisma 7 ORM                                                |
| Auth       | Auth.js (NextAuth v5), multi-tenant per-user franchise saves            |
| AI         | Claude API (`@anthropic-ai/sdk`), tool-use grounded in live league data |
| Testing    | Vitest (unit) + Playwright (e2e)                                        |
| CI/CD      | GitHub Actions                                                          |
| Deployment | Vercel + Neon Postgres                                                  |

## Getting started

```bash
npm install
cp .env.example .env       # fill in DATABASE_URL and AUTH_SECRET (npx auth secret can generate one)
npm run db:migrate         # applies the Prisma schema to your database
npm run db:seed            # seeds the 30 real teams + 497 real players/stats (bundled fixtures, no API key needed)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then **Start a
franchise** to sign up and bootstrap your own save.

Regenerating the bundled fixtures from scratch (not required to just run
the app) needs a free [balldontlie](https://balldontlie.io) API key in
`.env`:

```bash
npm run import:season-stats   # aggregates real 2023-24 box scores into prisma/data/playerSeasonStats.json
npm run import:players        # fetches real bios and joins them to the stats fixture into prisma/data/players.json
```

### Useful scripts

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier write
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright end-to-end tests (builds + runs a production server)
npm run db:studio     # Prisma Studio (browse the database)
```

## Project status

Foundations, the real data pipeline, the salary cap/trade/valuation engine,
auth, and the core gameplay loop (sign up → pick a team → make trades → sign
free agents, all against a real generated cap sheet) are all live and
working end to end at the demo link above. See
[docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone-by-milestone plan
and what's next (the AI GM assistant, draft picks, more polish).

## License

MIT
