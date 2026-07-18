# Roadmap

Built in milestones across multiple sessions rather than all at once, so
each phase reaches a genuinely polished, tested state before moving on.

## M0 — Foundations ✅

- [x] Next.js 16 + TypeScript + Tailwind scaffold
- [x] Prisma schema: auth models, reference data (`Team`/`Player`/
      `PlayerSeasonStat`), per-save domain (`League`/`LeagueTeam`/
      `LeaguePlayer`/`Contract`/`ContractYear`/`DraftPick`/`Trade`/
      `TradeAsset`/`TradeException`), AI assistant thread/message models
- [x] Tooling: ESLint + Prettier, Vitest, Playwright, GitHub Actions CI
- [x] Neon Postgres provisioned, first migration applied
- [x] Initial commit pushed to git

## M1 — Data pipeline ✅ (reference data complete; League bootstrap is M5)

- [x] Static team fixture seeded into the database (30 real NBA teams)
- [x] Real 2023-24 season stats: `scripts/import-season-stats.ts` aggregates
      ~26k real per-game box scores (MIT-licensed source) into per-player
      season averages
- [x] Real player bios: `scripts/import-players.ts` pulls from balldontlie
      (rate-limited, resumable) and joins to the stats fixture by name -
      497/497 matched (5 required a hand-resolved nickname/legal-name alias)
- [x] All 497 real players + season stats seeded into Postgres
- [x] Algorithmically-generated contract logic ready (`generateContract`,
      `planLeaguePlayer`), anchored to the valuation model instead of
      hand-curated real salary figures (see docs/ARCHITECTURE.md)
- [x] "New league" flow: clones the snapshot into a fresh `League` (30
      `LeagueTeam`s, 497 `LeaguePlayer`s + generated `Contract`s) - see M5

## M2 — Salary cap & trade engine (started early — pure logic, no DB needed)

- [x] Season-by-season CBA constants (cap/tax/apron thresholds, MLE variants)
- [x] Apron classification + mid-level exception eligibility
- [x] Cap sheet calculator: committed salary, empty-roster charges, dead
      money, apron status, cap space per team per season
- [x] Trade legality validator: cap-space vs. over-the-cap salary matching,
      second-apron no-aggregation rule, no-trade clauses, Stepien-lite
      draft pick rule, multi-team trades
- [x] Unit test suite (39 tests) covering the above as the primary
      correctness story
- [x] Wired into real Prisma-backed data via the trade builder (M3) - the
      validator runs unmodified against live league cap sheets
- [ ] Free agency signing tools (MLE variants, Bird rights, minimums)

## M3 — Core UI (started early)

- [x] League browser (`/teams`) - all 30 real teams, grouped by conference/
      division, linking into real rosters
- [x] Team roster page (`/teams/[abbreviation]`) - real 2023-24 statlines,
      sorted by scoring, with a live-computed 0-100 rating per player
- [x] Player detail page (`/players/[id]`) - bio + statline + live
      valuation-model output (performance score, estimated market value)
- [x] Playwright e2e test covering the full browse -> roster -> player flow
- [x] Data visualization: minutes-vs-rating scatter chart (recharts) on
      every team roster page
- [x] League dashboard (`/leagues/[id]`) - the signed-in user's own team's
      live cap sheet (committed salary, cap space, apron status) and full
      roster with real generated contracts
- [x] Interactive trade builder (`/leagues/[id]/trades/new`) - pick an
      opposing team, select players on each side, get instant legality
      feedback from the same `validateTrade` engine, execute the trade
      (re-validated server-side, never trusting the client) in a DB
      transaction that actually reassigns players/contracts between teams.
      Player-only for now - draft pick trading needs a pick inventory that
      isn't generated during league bootstrap yet.
- [ ] Free agency board

## M4 — AI GM assistant

- [x] Player valuation model (performance composite, age curve, surplus
      value vs. actual salary) — pure logic, unit tested
- [ ] Claude-powered assistant with tool-use into cap/trade/valuation logic
- [ ] Chat UI, persisted per league

## M5 — Auth & multi-tenancy ✅ (single save per user; multiple saves is next)

- [x] Auth.js v5 wired up (Credentials provider + Prisma adapter, JWT
      sessions; `trustHost: true` needed for production - dev mode masks
      this, only caught by testing the real production build)
- [x] Sign-up/sign-in pages (React 19 `useActionState` + server actions)
- [x] Per-user league ownership enforced at the data-access layer (404s,
      not 403s, for a non-owner - doesn't reveal a league even exists)
- [x] Idempotent "start a franchise" flow: revisiting after one exists
      redirects straight to it instead of creating a second one
- [ ] Multiple saves per user
- [ ] GitHub OAuth (credentials-only for now - no external app setup needed)

## M6 — Polish & production

- [ ] Accessibility pass, responsive design pass
- [ ] Error boundaries / thoughtful empty & error states
- [ ] Performance pass (caching, pagination, optimistic UI)
- [ ] Restore static generation for public pages (`/`, `/teams/*`) - adding
      a session-aware `NavBar` to the root layout made every page dynamic,
      since `auth()` reads cookies. Fixable with a Suspense-boundary split
      or Next.js PPR once it's stable; not worth the complexity yet.
- [ ] Deployed to Vercel with a public demo
- [ ] Observability (error tracking)

## Stretch goals

- [ ] Season simulation engine (game-by-game results from team strength)
- [ ] League-wide trade grade leaderboard / activity feed
- [ ] Public read-only demo mode for recruiters (no sign-up required)
