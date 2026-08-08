import type { CapSheet } from "@/lib/cap/capSheet";
import { ApronLevel } from "@/lib/cap/apron";

/**
 * Immutable cap evidence, frozen onto `Trade.capSnapshot` at execution.
 *
 * Cap sheets everywhere else in the product are computed live from current
 * league state (`computeCapSheet`), which is correct for "what is my cap
 * situation right now" and *wrong* for "what did this trade do to me." A
 * revisit to the trade outcome surface years later would otherwise recompute
 * today's numbers and present them as the consequence of a deal made ten
 * seasons ago.
 *
 * This is never a source of truth for live cap math. It is a receipt.
 *
 * Cents are stored as strings: `JSON.stringify` cannot serialize `bigint`, and
 * this lands in a JSONB column. Read them back with `BigInt(...)`.
 */
export interface TradeCapSnapshotSide {
  /** Total salary counted against the cap, before and after the trade. */
  totalSalaryBeforeCents: string;
  totalSalaryAfterCents: string;
  /** Room under the cap; "0" once at or over it. */
  capSpaceBeforeCents: string;
  capSpaceAfterCents: string;
  /** Apron standing, stored as the string form of `ApronLevel`. */
  apronLevelBefore: string;
  apronLevelAfter: string;
  /** Players under contract, before and after assets changed hands. */
  rosterCountBefore: number;
  rosterCountAfter: number;
}

export interface TradeCapSnapshot {
  /** Which season's CBA rules produced these numbers. */
  season: number;
  /** The team that proposed the trade (the user's team, in practice). */
  from: TradeCapSnapshotSide;
  to: TradeCapSnapshotSide;
}

/** Builds one side of the snapshot from the canonical cap engine output. */
export function buildTradeCapSnapshotSide(
  before: CapSheet,
  after: CapSheet,
  rosterCountBefore: number,
  rosterCountAfter: number,
): TradeCapSnapshotSide {
  return {
    totalSalaryBeforeCents: before.totalSalaryCents.toString(),
    totalSalaryAfterCents: after.totalSalaryCents.toString(),
    capSpaceBeforeCents: before.capSpaceCents.toString(),
    capSpaceAfterCents: after.capSpaceCents.toString(),
    apronLevelBefore: before.apronLevel,
    apronLevelAfter: after.apronLevel,
    rosterCountBefore,
    rosterCountAfter,
  };
}

/**
 * Reads a snapshot back off the `Json?` column. Returns null for trades
 * executed before this field existed (the 26 already in the database) so the
 * outcome surface can degrade honestly rather than invent numbers.
 */
export function parseTradeCapSnapshot(value: unknown): TradeCapSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<TradeCapSnapshot>;
  if (typeof v.season !== "number" || !v.from || !v.to) return null;
  return v as TradeCapSnapshot;
}

/** Human-readable apron standing. Mirrors the labels used elsewhere in the UI. */
export const APRON_LEVEL_LABEL: Record<string, string> = {
  [ApronLevel.UNDER_CAP]: "Under the cap",
  [ApronLevel.BETWEEN_CAP_AND_TAX]: "Over the cap",
  [ApronLevel.TAXPAYER]: "Luxury tax",
  [ApronLevel.FIRST_APRON]: "First apron",
  [ApronLevel.SECOND_APRON]: "Second apron",
};

/**
 * Whether a trade moved a team across an apron/tax boundary. This is the most
 * product-specific sentence the outcome surface can say ("this deal pushed you
 * into the second apron"), so it gets a named helper rather than an inline
 * comparison.
 */
export function crossedApronBoundary(side: TradeCapSnapshotSide): boolean {
  return side.apronLevelBefore !== side.apronLevelAfter;
}
