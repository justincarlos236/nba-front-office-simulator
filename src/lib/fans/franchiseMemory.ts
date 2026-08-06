/**
 * Fans Page Redesign (Phase 5) - "Franchise Memory" (docs/FANS_PAGE_REDESIGN.md
 * Part 3.5). A short, permanent list of the moments this fanbase will not
 * forget: championships, a franchise icon traded away, a brutal collapse, a
 * relocation. Deliberately "nearly free" per the design - no new model, no
 * new derivation logic. This is a curated READ over history that already
 * persists (LeagueTransaction at BREAKING/MAJOR importance, plus the
 * relocation fields already on LeagueTeam) - pure filtering and ranking,
 * not a new opinion about what happened.
 */

export type MemoryTransactionType =
  "AWARD" | "TRADE" | "FRANCHISE_MILESTONE" | "DRAFT_LOTTERY" | "ALL_STAR_RESULT";

export interface MemoryTransaction {
  id: string;
  season: number;
  type: string;
  description: string;
  importance: "MINOR" | "STANDARD" | "MAJOR" | "BREAKING";
}

export interface FranchiseMemoryEntry {
  id: string;
  season: number;
  description: string;
  /** BREAKING moments are weighted above MAJOR ones when trimming to the cap. */
  weight: number;
}

// A curated allowlist, not every BREAKING/MAJOR row - a routine MAJOR
// signing shouldn't sit alongside a championship in the permanent record.
// Franchise Memory is about identity-defining moments, not "big news."
const MEMORY_WORTHY_TYPES = new Set<string>([
  "AWARD", // MVP and other major individual honors
  "TRADE", // only ever reaches here at BREAKING (a true blockbuster)
  "FRANCHISE_MILESTONE", // relocation, icon departures, valuation milestones
  "DRAFT_LOTTERY", // a #1 pick or a historic fall
]);

const IMPORTANCE_WEIGHT: Record<MemoryTransaction["importance"], number> = {
  MINOR: 0,
  STANDARD: 0,
  MAJOR: 1,
  BREAKING: 3,
};

const MAX_MEMORY_ENTRIES = 8;

/**
 * Filters a team's transaction history down to the identity-defining
 * subset, ranked by importance then recency, capped to a short permanent
 * list. Deliberately excludes MINOR/STANDARD entirely - Franchise Memory is
 * "moments," not a season recap.
 */
export function curateFranchiseMemory(transactions: MemoryTransaction[]): FranchiseMemoryEntry[] {
  return transactions
    .filter((t) => t.importance === "BREAKING" || t.importance === "MAJOR")
    .filter((t) => MEMORY_WORTHY_TYPES.has(t.type))
    .map((t) => ({
      id: t.id,
      season: t.season,
      description: t.description,
      weight: IMPORTANCE_WEIGHT[t.importance],
    }))
    .sort((a, b) => b.weight - a.weight || b.season - a.season)
    .slice(0, MAX_MEMORY_ENTRIES);
}

export interface RelocationMemoryInputs {
  relocatedCityName: string | null;
  relocatedAtSeason: number | null;
}

/** A relocation is always memory-worthy and always included regardless of the cap above - the single most permanent, franchise-defining fact a save can have. */
export function relocationMemoryEntry(inputs: RelocationMemoryInputs): FranchiseMemoryEntry | null {
  if (!inputs.relocatedCityName || inputs.relocatedAtSeason == null) return null;
  return {
    id: "relocation",
    season: inputs.relocatedAtSeason,
    description: `The franchise relocated to ${inputs.relocatedCityName} - a permanent chapter in this team's history.`,
    weight: 4, // above even BREAKING news - this outranks everything else
  };
}
