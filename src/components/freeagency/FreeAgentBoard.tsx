"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerChip } from "@/components/players/PlayerChip";
import { DataTable, Label, Status, Td, Th } from "@/components/ui/primitives";
import { INTEREST_LABEL, INTEREST_TONE, type InterestLevel } from "@/lib/freeagency/rivalInterest";

/**
 * THE WIRE - Ledger archetype. The market board.
 *
 * The audit found 77+ rows with no filters, no search, no position or need
 * filtering, and - the sharpest finding - an "Est. value" column showing what a
 * player is worth while withholding the cap space that makes it meaningful.
 * Filters are first-class header controls here, and your own position is
 * pinned above the board rather than living a page away on the dashboard.
 */

export interface FreeAgentRow {
  id: string;
  fullName: string;
  photoUrl: string | null;
  position: string;
  overallRating: number;
  valueTier: string;
  pointsPerGame: number | null;
  estimatedValue: string | null;
  /** Raw cents, for the affordability filter. */
  estimatedValueCents: string | null;
  hasReSigningRights: boolean;
  /** How hard rivals are competing for this player. See `rivalInterest.ts`. */
  interestLevel: InterestLevel;
  /** Abbreviations of the clubs with a genuine hole this player fills. */
  interestedTeams: string[];
}

type SortKey = "overallRating" | "pointsPerGame" | "estimatedValueCents";

const POSITIONS = ["ALL", "PG", "SG", "SF", "PF", "C"] as const;

export function FreeAgentBoard({
  rows,
  leagueId,
  capSpaceCents,
  needPositions,
}: {
  rows: FreeAgentRow[];
  leagueId: string;
  /** Your own cap space - the number that makes "Est. value" mean anything. */
  capSpaceCents: string;
  /** Positions the roster is thin at, from the same computeTeamNeeds the dashboard uses. */
  needPositions: string[];
}) {
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [rightsOnly, setRightsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("overallRating");

  const capSpace = BigInt(capSpaceCents);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (position !== "ALL" && row.position !== position) return false;
      if (rightsOnly && !row.hasReSigningRights) return false;
      if (query && !row.fullName.toLowerCase().includes(query)) return false;
      if (affordableOnly) {
        // Rights let you exceed the cap, so a rights-held player is always
        // reachable regardless of space.
        if (row.hasReSigningRights) return true;
        if (!row.estimatedValueCents) return false;
        if (BigInt(row.estimatedValueCents) > capSpace) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "pointsPerGame") return (b.pointsPerGame ?? -1) - (a.pointsPerGame ?? -1);
      if (sort === "estimatedValueCents") {
        const av = a.estimatedValueCents ? BigInt(a.estimatedValueCents) : 0n;
        const bv = b.estimatedValueCents ? BigInt(b.estimatedValueCents) : 0n;
        return bv > av ? 1 : bv < av ? -1 : 0;
      }
      return b.overallRating - a.overallRating;
    });
  }, [rows, position, search, affordableOnly, rightsOnly, sort, capSpace]);

  const pillClass = (active: boolean) =>
    `rounded-[2px] border px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] uppercase transition-colors duration-120 ${
      active
        ? "border-team-accent bg-team-accent text-team-accent-ink"
        : "border-rule text-ink-muted hover:bg-raised hover:text-ink"
    }`;

  return (
    <>
      <div className="mt-8 border-t border-rule bg-field p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div>
            <Label>Position</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={pillClass(position === p)}
                >
                  {p === "ALL" ? "All" : p}
                  {needPositions.includes(p) && (
                    <span className="ml-1.5 text-team-accent" aria-label="roster need">
                      &bull;
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Filter</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAffordableOnly((v) => !v)}
                className={pillClass(affordableOnly)}
              >
                Can afford
              </button>
              <button
                type="button"
                onClick={() => setRightsOnly((v) => !v)}
                className={pillClass(rightsOnly)}
              >
                My rights
              </button>
            </div>
          </div>

          <div>
            <Label>Sort</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSort("overallRating")}
                className={pillClass(sort === "overallRating")}
              >
                Rating
              </button>
              <button
                type="button"
                onClick={() => setSort("pointsPerGame")}
                className={pillClass(sort === "pointsPerGame")}
              >
                Scoring
              </button>
              <button
                type="button"
                onClick={() => setSort("estimatedValueCents")}
                className={pillClass(sort === "estimatedValueCents")}
              >
                Value
              </button>
            </div>
          </div>

          <div className="min-w-[180px] flex-1">
            <Label>Search</Label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player name"
              className="mt-2 w-full rounded-[2px] border border-rule bg-raised px-3 py-1.5 text-[15px] text-ink transition-colors duration-120 placeholder:text-ink-muted/60 focus:border-rule-strong"
            />
          </div>
        </div>
      </div>

      <p
        aria-live="polite"
        className="mt-4 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase"
      >
        {filtered.length} of {rows.length} available
      </p>

      <DataTable className="mt-3">
        <thead>
          <tr>
            <Th>Player</Th>
            <Th>Pos</Th>
            <Th numeric>OVR</Th>
            <Th>Tier</Th>
            <Th numeric>PPG</Th>
            <Th numeric>Est. value</Th>
            <Th>Competition</Th>
            <Th>
              <span className="sr-only">Offer</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => {
            const affordable =
              row.hasReSigningRights ||
              (row.estimatedValueCents ? BigInt(row.estimatedValueCents) <= capSpace : false);
            return (
              <tr key={row.id} className="transition-colors hover:bg-raised">
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <PlayerChip
                      identity={{ kind: "league", leagueId, leaguePlayerId: row.id }}
                      fullName={row.fullName}
                      photoUrl={row.photoUrl}
                      className="font-semibold text-ink"
                    />
                    {row.hasReSigningRights && <Status tone="positive">Rights</Status>}
                  </span>
                </Td>
                <Td className="text-ink-muted">{row.position}</Td>
                <Td numeric className="text-team-accent">
                  {row.overallRating}
                </Td>
                <Td className="text-[11px] tracking-[0.09em] text-ink-muted uppercase">
                  {row.valueTier}
                </Td>
                <Td numeric className="text-ink-muted">
                  {row.pointsPerGame?.toFixed(1) ?? "-"}
                </Td>
                <Td numeric className={affordable ? "text-ink" : "text-ink-muted"}>
                  {row.estimatedValue ?? "-"}
                </Td>
                {/* Who else is circling. A quiet market is the default and gets
                    no weight; only genuine competition is worth a tone. */}
                <Td>
                  {row.interestLevel === "none" ? (
                    <span className="text-rule">&mdash;</span>
                  ) : (
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Status tone={INTEREST_TONE[row.interestLevel]}>
                        {INTEREST_LABEL[row.interestLevel]}
                      </Status>
                      {row.interestedTeams.length > 0 && (
                        <span className="font-mono text-[11px] text-ink-muted">
                          {row.interestedTeams.slice(0, 3).join(" ")}
                          {row.interestedTeams.length > 3
                            ? ` +${row.interestedTeams.length - 3}`
                            : ""}
                        </span>
                      )}
                    </span>
                  )}
                </Td>
                <Td numeric>
                  <Link
                    href={`/leagues/${leagueId}/free-agents/${row.id}`}
                    className="inline-flex rounded-[2px] border border-rule px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition-colors duration-120 hover:bg-raised"
                  >
                    Offer
                  </Link>
                </Td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <Td className="py-10 text-center text-ink-muted" colSpan={8}>
                {rows.length === 0
                  ? "No free agents available."
                  : "No players match these filters."}
              </Td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </>
  );
}
