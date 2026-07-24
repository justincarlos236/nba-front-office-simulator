/**
 * The canonical internal representation of imported real-world roster data.
 *
 * Provider APIs/datasets (balldontlie, hoopR, a future replacement) each have
 * their own shapes; every provider adapter (see `providers/adapter.ts`) maps
 * its raw records into these canonical types, so the rest of the import
 * pipeline - name normalization, roster assembly, rating derivation, seeding,
 * validation - is written *once* against this schema and never against a
 * specific provider. Swapping or adding a provider is then an adapter change,
 * not a pipeline rewrite.
 *
 * Two boundaries this file deliberately encodes:
 *
 *   1. **Provider-neutral identity.** A player's cross-provider identity is a
 *      normalized name plus optional provider-scoped external ids. No canonical
 *      field is named after a provider.
 *
 *   2. **"Seed" ratings are the initial state only.** The rating fields here are
 *      named `seed*` on purpose: real-world data establishes the *starting
 *      state of a newly created league and nothing more*. Once a save exists,
 *      its `LeaguePlayer` rows own the evolving simulated rating and this
 *      imported data is never re-read onto that save. See the season/league
 *      bootstrap in `src/lib/actions/league.ts` and the progression systems in
 *      `src/lib/development/`.
 */

import type { Position } from "@/generated/prisma/client";

/** A provider-scoped identifier, e.g. `{ provider: "balldontlie", id: "38017675" }`. */
export interface ProviderRef {
  provider: string;
  id: string;
}

/**
 * Real per-game production for one player-season. Mirrors the persisted
 * `PlayerSeasonStat` columns (including the nullable advanced fields, which
 * an adapter fills only when its provider actually supplies them - never
 * fabricated). The rating model in `src/lib/valuation/playerValue.ts` consumes
 * a subset of these.
 */
export interface CanonicalSeasonStat {
  season: number; // start year, e.g. 2025 for 2025-26
  team: string; // abbreviation at season's end (or most-played team)
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  trueShootingPct: number | null;
  // Advanced fields: present only when the source provides them. Left null (not
  // guessed) otherwise - the rating model degrades gracefully without them.
  usagePct: number | null;
  winSharesPer48: number | null;
  boxPlusMinus: number | null;
  valueOverReplacement: number | null;
}

/** Provider-supplied biographical facts (never editorial opinion). */
export interface CanonicalPlayerBio {
  /** Cross-provider identity anchor: the fully normalized display name. */
  normalizedName: string;
  fullName: string;
  position: Position;
  heightInches: number | null;
  weightLbs: number | null;
  birthDate: string | null; // ISO date; age is derived at seed time, never stored raw
  draftYear: number | null;
  draftRound: number | null;
  draftPick: number | null;
  nationality: string | null;
  college: string | null;
  /** Provider-supplied headshot URL, when available (else resolved separately). */
  photoUrl: string | null;
  /** Team abbreviation the player currently belongs to (roster placement). */
  currentTeamAbbreviation: string | null;
  /** All provider ids seen for this player, for cross-provider joins + audit. */
  refs: ProviderRef[];
}

/**
 * A fully assembled canonical player: real bio + real season line + the derived
 * *seed* ratings. This is the unit the seed pipeline writes and the validation
 * pass checks. `seedOverallRating` is what a brand-new league copies once into
 * `LeaguePlayer.overallRating`; it is not gameplay state.
 */
export interface CanonicalPlayer {
  bio: CanonicalPlayerBio;
  stat: CanonicalSeasonStat;
  seedOverallRating: number;
  seedPotentialRating: number;
  /** True when `seedOverallRating` was nudged by the consensus override layer. */
  overrideApplied: boolean;
}

/**
 * Versioned provenance stamped onto every imported dataset. Lets a save record
 * exactly which real-world snapshot it was born from, makes refreshes
 * comparable, and drives the audit report. Written alongside the player data
 * (e.g. `prisma/data/players.json`'s top-level `manifest`).
 */
export interface DatasetManifest {
  /** Monotonic dataset version, e.g. "2025-26.1". */
  version: string;
  /** The real-world roster date this snapshot reflects (ISO date). */
  rosterDate: string;
  /** The NBA season this dataset's stats/ratings describe (start year). */
  seasonYear: number;
  /** Every source that contributed, with the role it played. */
  dataSources: Array<{
    provider: string;
    role: "bios" | "stats" | "rosters" | "draft" | "photos";
    url?: string;
    license?: string;
  }>;
  /** Version of the rating model + override layer used to derive seed ratings. */
  ratingsModelVersion: string;
  /**
   * Human-readable note on which real-world transactions are reflected (e.g.
   * "trades and signings through 2026-07-15 free agency"), so a user can tell
   * how current the rosters are.
   */
  includedTransactions: string;
  /** When this dataset file was generated (ISO timestamp). */
  generatedAt: string;
  /** Total players included, for a quick integrity check against the seed. */
  playerCount: number;
}
