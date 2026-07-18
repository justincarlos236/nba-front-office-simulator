# NBA Front Office Simulator

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
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY
npm run db:migrate     # applies the Prisma schema to your database
npm run db:seed        # seeds real NBA reference data + a starter league
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier write
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright end-to-end tests
npm run db:studio     # Prisma Studio (browse the database)
```

## Project status

Early foundation stage — see [docs/ROADMAP.md](docs/ROADMAP.md) for the
milestone-by-milestone plan and current progress.

## License

MIT
