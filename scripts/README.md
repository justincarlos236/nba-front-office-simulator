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
| `import-dataset.ts`       | Builds `nbaDataset.json` from balldontlie rosters + hoopR bios/stats |
| `import-contracts.ts`     | Merges real NBA contracts into `nbaDataset.json` (see below)    |

`import-players.ts` and `import-season-stats.ts` need a free
[balldontlie](https://balldontlie.io) API key in `.env`. `import-dataset.ts`
needs an **ALL-STAR** key or above, because `/players/active` is not on the free
tier.

### Why the dataset needs two sources

hoopR is MIT-licensed and carries everything except one thing: it publishes a
season's rosters as `rosters_<endYear>.parquet`, and that file does not exist
until the season is under way. Rebuilding from hoopR alone during an offseason
therefore silently reproduces the *previous* season's lineups - measured on
2026-08-13, 177 of 585 active players were on a different team than hoopR had
them, LeBron James among them.

So `import-dataset.ts` takes roster placement from balldontlie's
`/players/active` and merges hoopR's bio detail (birth dates, and real PG/SG
positions where balldontlie only reports G/F/C) on top, joined on normalized
name. Roughly 85% of actives match a hoopR bio; the rest keep balldontlie's own
bio and fall back to draft year for age. See `src/lib/data-sources/enrichBios.ts`.

Two season constants, and the difference matters during an offseason:

| Constant        | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `TARGET_SEASON` | The season the league **starts in**. Sets ages and the label. |
| `STAT_SEASON`   | The most recent **completed** season - where ratings come from. |

### Real contracts

`import-contracts.ts` seeds the opening league with real salaries instead of
generated ones, so year one looks like the actual NBA. Run it _after_
`import:dataset` — it reads that script's output and writes the `contract` field
back into it.

```
npm run import:dataset     # rosters, bios, box scores  (needs ALL-STAR)
npm run import:contracts   # real salaries + draft data (needs GOAT)
npm run db:seed
```

The contracts endpoint is balldontlie **GOAT tier** ($39.99/month as of August
2026), but the output is committed to the repo, so a refresh costs one run — and
balldontlie offers a 48-hour GOAT trial. The script is resumable and checkpoints
to `prisma/data/.contracts-cache.json` after every request, so a rate limit, an
expired trial or a closed laptop never costs more than the call in flight. About
150 requests, ~33 minutes at the trial's 5/min; set `BDL_REQUEST_MS=200` on a
paid tier to go faster.

Players it cannot match by name keep `contract: null` and get a generated deal,
which is what every player got before this existed — so a partial run degrades
rather than breaks. The script prints its match rate and the unmatched names.

It also backfills `draftYear` / `draftRound` / `draftPick`, which the hoopR
dataset does not carry for a single player. That is what lets experience-based
rules (the rookie scale, the max-salary tiers) use real service time instead of
falling back to `age - 22`.

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
