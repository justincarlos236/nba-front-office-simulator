/**
 * Which real-world seasons this build's seeded dataset actually describes.
 *
 * **These were hardcoded in four places and three of them had rotted.** The
 * dataset was re-imported to 2026-27 rosters, but `PROFILE_SEASON` still said
 * `2023` - and because the earlier import's rows were never deleted, the
 * database still held 818 stat rows for 2023 beside 823 for 2025. So nothing
 * broke visibly. The queries kept returning data; it was simply the wrong
 * data, three seasons out of date, while the current season sat unused next to
 * it.
 *
 * That reached further than a stale label. `leagueTeamStrength` selects a
 * player's real baseline with this season, and `boxScore.ts` builds its per-36
 * rate priors from that baseline - so every simulated box score in the game was
 * shaped by how a player performed in 2023-24. The player profile also priced
 * a market value with it, which meant 2023-24 cap rules and an age three years
 * short of the player's real one.
 *
 * Stating them once, derived from the dataset manifest and pinned by a test
 * against `prisma/data/nbaDataset.json`, means a re-import that moves the
 * seasons fails the suite instead of quietly aging the simulation.
 */

/**
 * The season the seeded rosters represent - what a new save starts in.
 *
 * From the dataset manifest's `seasonYear`.
 */
export const DATASET_ROSTER_SEASON = 2026;

/**
 * The most recent *completed* real season, and therefore the one every real
 * player's statistical baseline comes from.
 *
 * One behind `DATASET_ROSTER_SEASON` because the roster season has not been
 * played yet: a 2026-27 roster's players carry their 2025-26 production. The
 * manifest bears this out - 461 of 585 players' stat lines are season 2025,
 * against 105 for 2026 (partial) and 19 for 2024 (players who missed a year).
 */
export const REFERENCE_STAT_SEASON = 2025;

/** A season rendered the way basketball writes it: 2025 becomes "2025-26". */
export function seasonLabel(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, "0")}`;
}
