/**
 * Provider adapter contracts. Each real-world data source implements one or
 * more of these small role interfaces; the import pipeline depends only on the
 * interfaces, never on a concrete provider. Adding or replacing a provider
 * (balldontlie, hoopR, a licensed feed later) means writing an adapter that
 * emits canonical records - no pipeline changes.
 *
 * Roles are split (bios vs. stats vs. rosters vs. draft) because real sources
 * rarely cover everything well: today hoopR can supply stats + rosters + draft
 * while balldontlie supplies clean bios, and the pipeline mixes them by role.
 * A single provider may implement several roles.
 */

import type { CanonicalPlayerBio, CanonicalSeasonStat, ProviderRef } from "../canonical";

/** Common identity/metadata every adapter carries. */
export interface ProviderAdapter {
  /** Stable slug used in `ProviderRef.provider`, manifest, and audit output. */
  readonly id: string;
  /** Human-readable name + license, surfaced in the dataset manifest. */
  readonly displayName: string;
  readonly license: string;
  readonly sourceUrl?: string;
}

/** Supplies biographical facts + current roster placement. */
export interface BioProvider extends ProviderAdapter {
  fetchBios(): Promise<CanonicalPlayerBio[]>;
}

/**
 * A season stat line tagged with the identity needed to join it to a bio.
 * Both keys are carried: `ref` (an exact provider id, preferred when the bio
 * comes from the same provider) and `normalizedName` (the cross-provider
 * fallback join).
 */
export interface ProviderSeasonStatLine {
  ref: ProviderRef;
  normalizedName: string;
  stat: CanonicalSeasonStat;
}

/** Supplies real per-player season stat lines for a given season. */
export interface StatsProvider extends ProviderAdapter {
  fetchSeasonStats(seasonYear: number): Promise<ProviderSeasonStatLine[]>;
}

/** A raw draft-history record - real players and where they were drafted. */
export interface DraftPickRecord {
  normalizedName: string;
  fullName: string;
  season: number;
  round: number | null;
  pick: number | null;
  teamAbbreviation: string | null;
  ref: ProviderRef;
}

/** Supplies historical draft results (used to backfill draft provenance). */
export interface DraftProvider extends ProviderAdapter {
  fetchDraftHistory(): Promise<DraftPickRecord[]>;
}
