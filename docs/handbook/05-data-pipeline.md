# 05 — The Real-NBA-Data Ingestion Pipeline

Files: `src/lib/data-sources/` (pure logic + adapters) and
`scripts/import-hoopr-dataset.ts` (the offline importer). This is your best
**engineering-judgment** story — it's full of "I had to make a call and here's
why" moments, which is exactly what interviewers dig for.

## 1. Purpose

Seed every new league with the **current, real NBA rosters** and **realistic
player ratings**, from a source that's **legal to use in a public project**, and
do it as a **repeatable** process I can re-run each season — not a one-time
hand-edit of hundreds of players.

## 2. The judgment calls (this is the interesting part)

### Legality — why not NBA 2K ratings?

The obvious "realistic ratings" source is NBA 2K. But those ratings are
**proprietary** to the game's publisher — scraping and redistributing them in a
public portfolio project would violate their terms and copyright. So I **couldn't
use the obvious source**, and had to build a defensible alternative.

### The data source I chose

- **Rosters, bios, photos, and box-score stats:** `hoopR-nba-data`, an
  **MIT-licensed** open dataset (MIT = free to use and redistribute). This gives
  current rosters and real per-game stats for free.
- **The honest limitation:** the free data has traditional box-score stats (points,
  rebounds, shooting) but **not** advanced metrics like BPM or VORP. I flag this
  openly rather than pretending the ratings are more precise than they are.

### Ratings — building "2K-style" without copying 2K

Since I can't copy ratings, I **derive** them:

1. A **seed-rating model** (`seedRating.ts`) converts a player's real season
   stats into a 60–99 overall — volume-aware, with efficiency and minutes
   factored in, and **sample-size regression** so a player with a tiny, flukey
   sample isn't overrated.
2. A **minimal consensus-override layer** (`ratingOverrides.json`, ~15 players)
   nudges the handful of superstars the pure stat model gets wrong (e.g. a star
   who missed half a season to injury). These are my _own_ editorial ratings,
   not a copy of anyone's proprietary list.

## 3. Architecture — provider adapters (the key design pattern)

The pipeline is built around a **canonical (internal) player schema** with
**per-source adapters**, so the app isn't welded to one data provider.

```
Raw provider data        Adapter (per source)          Canonical schema        Merge + rate
─────────────────        ────────────────────          ────────────────        ────────────
hoopR parquet files ──►  hoopRProvider.fetchBios() ──►  CanonicalPlayerBio  ──►  buildDataset:
hoopR box scores    ──►  ...fetchSeasonStats()     ──►  CanonicalSeasonStat ──►   join by id,
(future provider X) ──►  (just write a new adapter)                              seed-rate,
                                                                                 apply overrides,
                                                                                 validate → nbaDataset.json
```

- **`providers/adapter.ts`** defines the _interfaces_ (`BioProvider`,
  `StatsProvider`). The rest of the pipeline depends only on these interfaces.
- **`providers/hoopR.ts`** implements them for the current source.
- **Why:** if I ever switch or add a data source, I write **one new adapter** —
  the merge, rating, validation, and seeding code doesn't change. This is the
  "**program to an interface**" / dependency-inversion idea, and it directly
  answers "how would you make this extensible?"

## 4. The pipeline steps (data flow)

1. **Fetch** (adapter): pull current rosters + the completed season's box scores
   (parquet files) and the prior season (as a fallback for players who missed the
   whole current season, like an injured star).
2. **Merge** (`buildDataset.ts`): join bios ↔ stats by exact player id, pick each
   player's most recent real season, compute the seed rating, apply overrides,
   and emit `CanonicalPlayer`s plus a **validation/audit report**.
3. **Map teams** (`teamCrosswalk.ts`): the source uses slightly different team
   abbreviations (GS vs GSW, NY vs NYK…) — a small crosswalk maps them to ours so
   no player is dropped for an unrecognized team.
4. **Validate** (`validateDataset.ts`): a _gameplay-readiness_ gate (see §6).
5. **Write** `prisma/data/nbaDataset.json` with a **versioned manifest** (which
   sources, roster date, rating-model version, player count).
6. **Seed** (`prisma/seed.ts`) loads that file into the database.

## 5. The seed/sim boundary (a rule, not just code)

**Imported real-world data sets a new league's _initial state only_. After a
league begins, the simulation owns the numbers and real data never overwrites
them.**

- In the schema, this is the `Player.seedOverallRating` column: it's the starting
  rating, copied _once_ into `LeaguePlayer.overallRating` at league creation, then
  never read again for that save.
- **Why it's essential:** if a nightly data refresh re-synced ratings onto active
  saves, it would clobber all the development, decline, and trades the simulation
  produced — corrupting the save's history. The boundary keeps real data and
  simulated data from ever fighting.

## 6. Validation — "gameplay readiness," not just shape

`validateDataset.ts` doesn't just check field types. It runs the **same
roster-trim the game uses** and asserts each team can actually be _played_:
every team has a legal roster size, a viable backcourt and frontcourt, ratings in
range, unique ids, and full 30-team coverage. Errors block the import; warnings
inform. **Why:** "the JSON parsed" is not the same as "you can start a league from
this" — the validator checks the thing that actually matters.

## 7. A real bug I found and fixed (great to tell)

During hands-on testing I noticed **each team showed 30+ players**. Cause: the
global `Player` table is shared reference data, and re-importing had **stacked the
new dataset on top of the old one** (~35 players per team). In-league rosters were
correct (they're copied and trimmed to 15), but any _global_ team view showed both
datasets. **Fix:** the seed now **retires superseded players** — it clears the old
rows' team assignment (keeping the rows themselves, because an older save's data
still references them via foreign keys). This is a nice "I tested it like a user,
found a real data-integrity bug, traced it to shared mutable state, and fixed it
safely without breaking existing saves" story.

## 8. Key files

| File                       | Responsibility                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `canonical.ts`             | The internal player/stat schema + the versioned dataset manifest type.                                                    |
| `providers/adapter.ts`     | The provider **interfaces** the pipeline depends on.                                                                      |
| `providers/hoopR.ts`       | The hoopR adapter: parses parquet, aggregates box scores → season lines, infers finer positions from height.              |
| `parquet.ts`               | Reads the compressed parquet data files.                                                                                  |
| `seedRating.ts`            | Stats → a realistic 60–99 seed rating (volume + efficiency + sample-size regression).                                     |
| `ratingOverrides.json/.ts` | The minimal consensus override layer.                                                                                     |
| `buildDataset.ts`          | Merge + rate + override + audit report.                                                                                   |
| `teamCrosswalk.ts`         | Provider team-abbreviation → ours.                                                                                        |
| `rosterConstruction.ts`    | The shared "keep top 15 per team" trim (used by both the bootstrap **and** the validator, so validation matches reality). |
| `validateDataset.ts`       | Gameplay-readiness validation.                                                                                            |

## 9. Interview questions & strong answers

**Q: You wanted realistic ratings but couldn't use NBA 2K. What did you do?**

> 2K's ratings are proprietary, so I couldn't legally copy them. I used a free
> MIT-licensed dataset for rosters and real stats, then derived my own 60–99
> ratings with a stat-based model plus a tiny manual override layer for the few
> superstars the stats miss. I documented that the free data lacks advanced
> metrics, so I'm honest about the ceiling on accuracy.

**Q: How is the pipeline not locked to one data source?**

> It's built on a canonical internal schema with per-provider adapters. The merge,
> rating, and validation code only knows the adapter _interface_, so adding a new
> source is just writing a new adapter — nothing downstream changes.

**Q: How do you keep imported data from corrupting a save?**

> A hard seed/sim boundary: real data only sets a league's initial state, stored
> in a `seed*` column that's read exactly once at creation. After that the
> simulation owns the ratings and real data is never re-synced onto an active
> save.

**Q: How do you know an imported dataset is actually usable?**

> A validation step runs the same roster trim the game uses and asserts every
> team is playable — legal roster size, viable positions, in-range ratings, unique
> ids, all 30 teams. It failed loudly during development when positions were too
> coarse, which is exactly what I wanted.

**Q: Tell me about a bug you found.**

> Re-importing stacked old and new players in the shared reference table, so global
> team views showed 30+ players. I traced it to shared mutable state, and fixed it
> by having the seed retire superseded players — clearing their team but keeping
> the rows so older saves that reference them don't break.

## 10. Elevator explanation (30s)

> The data pipeline seeds each new game with current, real NBA rosters and
> realistic ratings, from a free MIT-licensed dataset — since the obvious source,
> 2K's ratings, is proprietary and can't be copied. It's built on a canonical
> schema with per-source adapters so it's not locked to one provider, it derives
> ratings from real stats plus a tiny manual override layer, and it enforces a
> strict boundary where real data only sets a league's starting state and the
> simulation owns everything after. Every import is validated for
> gameplay-readiness and stamped with a versioned manifest.
