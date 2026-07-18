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
- [ ] "New league" flow: clone the snapshot into a fresh `League`, let the
      user pick which team to run - deferred to M5, since a League needs a
      real signed-in owner

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
- [ ] Free agency signing tools (MLE variants, Bird rights, minimums)
- [ ] Wire the engine into real Prisma-backed data once M1 seeding lands

## M3 — Core UI (started early)

- [x] League browser (`/teams`) - all 30 real teams, grouped by conference/
      division, linking into real rosters
- [x] Team roster page (`/teams/[abbreviation]`) - real 2023-24 statlines,
      sorted by scoring, with a live-computed 0-100 rating per player
- [x] Player detail page (`/players/[id]`) - bio + statline + live
      valuation-model output (performance score, estimated market value)
- [x] Playwright e2e test covering the full browse -> roster -> player flow
- [ ] Team dashboard for an actual league save (cap sheet, record) - needs M5
- [ ] Interactive trade builder with live legality feedback
- [ ] Free agency board
- [ ] Data visualization (charts, not just tables)

## M4 — AI GM assistant

- [x] Player valuation model (performance composite, age curve, surplus
      value vs. actual salary) — pure logic, unit tested
- [ ] Claude-powered assistant with tool-use into cap/trade/valuation logic
- [ ] Chat UI, persisted per league

## M5 — Auth & multi-tenancy

- [ ] Auth.js wired up (GitHub OAuth + credentials)
- [ ] Per-user league ownership enforced at the data-access layer
- [ ] Multiple saves per user

## M6 — Polish & production

- [ ] Accessibility pass, responsive design pass
- [ ] Error boundaries / thoughtful empty & error states
- [ ] Performance pass (caching, pagination, optimistic UI)
- [ ] Deployed to Vercel with a public demo
- [ ] Observability (error tracking)

## Stretch goals

- [ ] Season simulation engine (game-by-game results from team strength)
- [ ] League-wide trade grade leaderboard / activity feed
- [ ] Public read-only demo mode for recruiters (no sign-up required)
