# Scripts

Standalone `tsx` scripts. None of them are needed to run the app — `npm run
db:seed` is enough for that. Each opens its own Prisma client through the
`PrismaPg` driver adapter, since they run outside Next.js.

## Data import

Regenerate the bundled fixtures in `prisma/data/` from their upstream
sources. Only needed if you want to rebuild the dataset; the fixtures are
committed so a fresh clone can seed offline.

| Script                    | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `import-season-stats.ts`  | Aggregates ~26k real box scores into per-player season averages |
| `import-players.ts`       | Fetches real player bios and joins them onto the stats fixture  |
| `import-hoopr-dataset.ts` | Reads the upstream hoopR parquet dataset into `nbaDataset.json` |

`import-players.ts` and `import-season-stats.ts` need a free
[balldontlie](https://balldontlie.io) API key in `.env`.

## Backfills

One-off migrations for save files that already existed when a feature
shipped. A new league gets all of this at creation, so these only matter for
databases created before the feature in question. They are idempotent — each
skips rows that already have the data.

| Script                             | Backfills                                     |
| ---------------------------------- | --------------------------------------------- |
| `backfill-owner-archetype.ts`      | Per-team owner archetype (was league-scoped)  |
| `backfill-player-personalities.ts` | `PlayerPersonalityProfile` rows               |
| `backfill-franchise-finances.ts`   | Opening balance sheet and financial snapshots |
| `backfill-fan-culture.ts`          | `FanCulture` rows                             |
| `backfill-fan-mandate.ts`          | `FanMandate` rows                             |
| `backfill-fan-narratives.ts`       | `FanNarrative` rows                           |
| `backfill-fan-sentiment-ledger.ts` | `FanSentimentEvent` history                   |

## Analysis

| Script                       | Purpose                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `balance-harness.ts`         | Runs many headless seasons against a real database and reports the distributions used to calibrate the simulation. See `docs/SIMULATION_AUDIT.md` |
| `e2e-fast-forward-season.ts` | Advances a league to a target phase so Playwright specs don't have to sim their way there                                                         |
| `resolve-player-photos.ts`   | Resolves and caches player headshot URLs                                                                                                          |
