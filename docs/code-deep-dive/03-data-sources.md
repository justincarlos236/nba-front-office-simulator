# Deep Dive 03 — The Data-Sources Pipeline (with real code)

Folder: `src/lib/data-sources/` + `scripts/import-hoopr-dataset.ts`. Produces
`prisma/data/nbaDataset.json`, which `prisma/seed.ts` loads. **Code blocks are the real
source.**

**Flow:** hoopR parquet → adapter → canonical types → `buildDataset` (merge + rate +
override) → `validateDataset` → `nbaDataset.json` + manifest → `seed.ts` → `Player` rows.

---

## `canonical.ts` — the provider-neutral schema

```ts
export interface CanonicalPlayer {
  bio: CanonicalPlayerBio;
  stat: CanonicalSeasonStat;
  seedOverallRating: number;
  seedPotentialRating: number;
  overrideApplied: boolean;
}

export interface DatasetManifest {
  version: string; // e.g. "2025-26.1"
  rosterDate: string;
  seasonYear: number;
  dataSources: Array<{
    provider: string;
    role: "bios" | "stats" | "rosters" | "draft" | "photos";
    url?: string;
    license?: string;
  }>;
  ratingsModelVersion: string;
  includedTransactions: string;
  generatedAt: string;
  playerCount: number;
}
```

The `seed*` naming is the seed/sim boundary in the type system — these set a league's
_initial_ state only. `CanonicalSeasonStat` keeps advanced fields (`usagePct`,
`boxPlusMinus`, …) but they're `| null`, filled only if a source provides them.

## `providers/adapter.ts` — the interfaces the pipeline depends on

```ts
export interface BioProvider extends ProviderAdapter {
  fetchBios(): Promise<CanonicalPlayerBio[]>;
}
export interface ProviderSeasonStatLine {
  ref: ProviderRef; // exact source id, for a precise join
  normalizedName: string; // cross-provider fallback join
  stat: CanonicalSeasonStat;
}
export interface StatsProvider extends ProviderAdapter {
  fetchSeasonStats(seasonYear: number): Promise<ProviderSeasonStatLine[]>;
}
```

Add a data source = write one class implementing these; nothing downstream changes.

## `parquet.ts` — reading the compressed files

```ts
export async function readParquetFromUrl(url: string): Promise<ParquetRow[]> {
  const [{ parquetReadObjects }, { compressors }] = await Promise.all([
    import("hyparquet"),
    import("hyparquet-compressors"),
  ]);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch parquet ${url}: ${res.status} ${res.statusText}`);
  const file = await res.arrayBuffer();
  return (await parquetReadObjects({ file, compressors })) as ParquetRow[];
}
```

**Dynamic `import()`** so it resolves under both the `tsx` CJS import scripts and
vite/ESM tests (a static import would become a failing `require()` under tsx). The files
are ZSTD-compressed, hence `hyparquet-compressors`.

## `providers/hoopR.ts` — the concrete adapter

Season convention + position inference:

```ts
export function espnSeasonYear(ourStartYear: number): number {
  return ourStartYear + 1; // ESPN labels by end year: 2026 = our 2025
}

export function inferPosition(espnAbbr: string | null, heightInches: number | null): Position {
  const base = mapPosition(espnAbbr);
  if (heightInches == null) return base;
  const a = (espnAbbr ?? "").trim().toUpperCase();
  if (a === "G") return heightInches >= GUARD_SG_MIN_INCHES ? "SG" : "PG"; // 77 = 6'5"
  if (a === "F") return heightInches >= FORWARD_PF_MIN_INCHES ? "PF" : "SF"; // 81 = 6'9"
  return base;
}
```

The stats aggregation core — note the `active`-flag lesson and the TS% formula:

```ts
for (const row of boxRows) {
  if (num(row, "season_type") !== ESPN_REGULAR_SEASON) continue;   // 2 = regular season
  // ESPN's `active` flag reads false for ~half a star's *played* games, so use minutes > 0.
  if (row.did_not_play === true) continue;
  const minutes = num(row, "minutes");
  if (minutes <= 0) continue;
  // ...accumulate totals per athlete id...
}
// per player, once games >= minGames:
trueShootingPct: acc.fga + acc.fta > 0 ? round3(acc.pts / (2 * (acc.fga + 0.44 * acc.fta))) : null,
```

## `seedRating.ts` — stats → a realistic starting rating

```ts
const ANCHOR = 74;
const BASE = { pts: 14, reb: 4.5, ast: 3, stl: 0.9, blk: 0.5, tov: 1.6, min: 24, ts: 0.57 };
const W = { pts: 0.62, reb: 0.5, ast: 0.9, stl: 1.7, blk: 1.5, tov: -0.9, role: 0.45, eff: 42 };
const KNEE = 89;
const ABOVE_KNEE_SCALE = 0.52;
const REGRESSION_TARGET = 67;
const FULL_TRUST_GAMES = 42;
const FULL_TRUST_MINUTES = 22;

export function seedProductionScore(stat: CanonicalSeasonStat): number {
  const ts = stat.trueShootingPct ?? BASE.ts;
  const production =
    (stat.pointsPerGame - BASE.pts) * W.pts +
    (stat.reboundsPerGame - BASE.reb) * W.reb +
    (stat.assistsPerGame - BASE.ast) * W.ast +
    (stat.stealsPerGame - BASE.stl) * W.stl +
    (stat.blocksPerGame - BASE.blk) * W.blk +
    (stat.turnoversPerGame - BASE.tov) * W.tov;
  const role = (stat.minutesPerGame - BASE.min) * W.role; // minutes = coach trust signal
  const eff = clamp((ts - BASE.ts) * W.eff, -EFF_CLAMP, EFF_CLAMP);
  const raw = ANCHOR + production + role + eff;
  return raw <= KNEE ? raw : KNEE + (raw - KNEE) * ABOVE_KNEE_SCALE; // compress the top end
}

export function sampleConfidence(gamesPlayed: number, minutesPerGame: number): number {
  const gamesConf = clamp(gamesPlayed / FULL_TRUST_GAMES, 0, 1);
  const minConf = clamp(minutesPerGame / FULL_TRUST_MINUTES, 0, 1);
  return gamesConf * (0.6 + 0.4 * minConf);
}

export function computeSeedOverallRating(stat: CanonicalSeasonStat): number {
  const score = seedProductionScore(stat);
  const confidence = sampleConfidence(stat.gamesPlayed, stat.minutesPerGame);
  const regressed = confidence * score + (1 - confidence) * REGRESSION_TARGET;
  return clamp(Math.round(regressed), 60, 99);
}
```

Volume-aware (per-game, not per-36), minutes as a role signal, top-end compression above
the knee, and **sample-size regression** toward 67 for unproven players — this is what
fixed the old model rating a 20-game efficient bench big as a 99.

## `ratingOverrides.ts` — the minimal consensus layer

```ts
const OVERRIDES: ReadonlyMap<string, number> = new Map(
  Object.entries(overridesRaw)
    .filter(([, v]) => typeof v === "number") // skip the "_comment" doc field
    .map(([name, target]) => [normalizePlayerName(name), target as number]),
);

export function applyRatingOverride(fullName: string, modelRating: number): OverrideResult {
  const target = OVERRIDES.get(normalizePlayerName(fullName));
  return target === undefined
    ? { rating: modelRating, applied: false }
    : { rating: target, applied: true };
}
```

Keys are normalized on load (accents/case/hyphens don't matter). ~15 marquee targets —
_our_ editorial ratings, not a copy of any proprietary list.

## `teamCrosswalk.ts`

```ts
const ESPN_TO_OURS: Readonly<Record<string, string>> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};
export function mapEspnTeamAbbreviation(espn: string | null): string | null {
  if (!espn) return null;
  return ESPN_TO_OURS[espn] ?? espn;
}
```

Only the 6 codes that differ; identity for the other 24.

## `rosterConstruction.ts` — the shared trim

```ts
export function selectTopPerTeam<T>(
  items: readonly T[],
  teamKeyOf: (item: T) => string | null,
  ratingOf: (item: T) => number,
  maxPerTeam: number = DEFAULT_MAX_ROSTER_SIZE,
): { rostered: Set<T>; byTeam: Map<string, T[]> } {
  const byTeam = new Map<string, T[]>();
  for (const item of items) {
    const key = teamKeyOf(item);
    if (!key) continue;
    const list = byTeam.get(key) ?? [];
    list.push(item);
    byTeam.set(key, list);
  }
  const rostered = new Set<T>();
  for (const list of byTeam.values()) {
    list.sort((a, b) => ratingOf(b) - ratingOf(a));
    for (const item of list.slice(0, maxPerTeam)) rostered.add(item);
  }
  return { rostered, byTeam };
}
```

Generic (works on any `T`). **Used by both the league bootstrap and the validator**, so
"the dataset passed validation" means "every team can be fielded exactly as built."

## `buildDataset.ts` — the merge

The fallback join (why an injured-all-season star still gets a rating):

```ts
// scan seasons newest-first; id match preferred, then normalized name
let matchIndex = -1;
let line: ProviderSeasonStatLine | undefined;
for (let i = 0; i < indexed.length; i++) {
  const id = bio.refs[0]?.id;
  line = (id ? indexed[i].byId.get(id) : undefined) ?? indexed[i].byName.get(bio.normalizedName);
  if (line) {
    matchIndex = i;
    break;
  }
}

let modelOverall: number;
if (line) {
  modelOverall = computeSeedOverallRating(line.stat);
  if (matchIndex === 0) report.fromTargetSeason++;
  else report.fromFallbackSeason++;
} else {
  modelOverall = NO_STATS_DEFAULT_OVERALL; // 66
  report.noStatDefault++;
}
const override = applyRatingOverride(bio.fullName, modelOverall);
```

So Haliburton/Lillard (no current-season line) fall back to their prior-season line by
exact id; a rating override can then correct the marquee cases.

## `validateDataset.ts` — gameplay-readiness gate

```ts
const { rostered, byTeam } = selectTopPerTeam(
  players,
  (p) => p.teamAbbreviation,
  (p) => p.seedOverallRating,
  maxRosterSize,
);
if (byTeam.size < expectedTeams)
  err("team_coverage", `Only ${byTeam.size}/${expectedTeams} teams have players`);

for (const [team, all] of byTeam) {
  const roster = all.slice(0, maxRosterSize);
  if (roster.length < MIN_ROSTER_SIZE)
    err("short_roster", `${team} has only ${roster.length} players`);
  const guards = roster.filter((p) => GUARDS.has(p.position)).length;
  const bigs = roster.filter((p) => BIGS.has(p.position)).length;
  const centers = roster.filter((p) => p.position === "C").length;
  if (guards < 2) err("no_backcourt", `${team} can't field a backcourt (${guards} guards)`);
  if (bigs < 2) err("no_frontcourt", `${team} can't field a frontcourt (${bigs} bigs)`);
  if (centers === 0) warn("no_center", `${team} has no natural center...`);
}
```

Runs the **same trim the game uses**, then asserts each team is actually playable — not
just that the JSON parsed. Errors block; warnings inform.

## `prisma/seed.ts` — the consumer + the legacy-cleanup fix

```ts
async function retireLegacyPlayers() {
  const { count } = await prisma.player.updateMany({
    where: { seedOverallRating: null, currentTeamId: { not: null } },
    data: { currentTeamId: null },
  });
  if (count > 0)
    console.log(`Retired ${count} legacy (superseded-dataset) players from global rosters.`);
}
```

This is the fix for the "30+ players per team" bug: a re-import stacked the old dataset
on the new one in the shared `Player` table, so this clears the old rows' team (keeping
the rows themselves, which older saves still reference by id).

---

## Interview one-liners

- "The pipeline programs to a canonical schema behind adapters, so a new data source is
  one new adapter — merge, rating, and validation never change."
- "Imported data sets only a league's initial state, in `seed*` columns read once at
  creation; the sim owns everything after."
- "The validator runs the _same_ roster trim the bootstrap uses, so passing validation
  literally means every team is fieldable."
