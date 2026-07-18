# Roadmap

Built in milestones across multiple sessions rather than all at once, so
each phase reaches a genuinely polished, tested state before moving on.

## M0 — Foundations ✅ (current)

- [x] Next.js 16 + TypeScript + Tailwind scaffold
- [x] Prisma schema: auth models, reference data (`Team`/`Player`/
      `PlayerSeasonStat`), per-save domain (`League`/`LeagueTeam`/
      `LeaguePlayer`/`Contract`/`ContractYear`/`DraftPick`/`Trade`/
      `TradeAsset`/`TradeException`), AI assistant thread/message models
- [x] Tooling: ESLint + Prettier, Vitest, Playwright, GitHub Actions CI
- [ ] Neon Postgres provisioned, first migration applied
- [ ] Initial commit pushed to GitHub

## M1 — Data pipeline

- [ ] Seed script pulling real teams/players/season stats from a stats API
- [ ] Curated contract/salary dataset (approximate, clearly labeled) for a
      current-season snapshot
- [ ] "New league" flow: clone the snapshot into a fresh `League`, let the
      user pick which team to run

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

## M3 — Core UI

- [ ] Team dashboard (record, cap sheet summary, roster)
- [ ] Interactive trade builder with live legality feedback
- [ ] Free agency board
- [ ] Player scouting/comparison views with data visualization

## M4 — AI GM assistant

- [ ] Player valuation model (surplus value, age curve)
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
