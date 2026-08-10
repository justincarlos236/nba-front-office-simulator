import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - roster construction as a shape.
 *
 * "My roster is thin at center" was only ever inferable by reading fifteen
 * table rows and holding positions in your head. This is the same data as a
 * silhouette: five columns, one per position, players stacked and sized by
 * the minutes actually assigned to them.
 *
 * A short column is a hole. A column of one tall block is a star with nothing
 * behind him. Both read instantly, and neither needed a new number - this is
 * `rotationSlot` and `targetMinutesPerGame`, which the rotation board already
 * writes.
 */

export interface RosterShapePlayer {
  leaguePlayerId: string;
  fullName: string;
  position: string;
  overallRating: number;
  /** Assigned minutes; null or 0 means outside the rotation. */
  targetMinutesPerGame: number | null;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

/** A full starter's night. Blocks are sized against this, not against each other. */
const REFERENCE_MINUTES = 36;

export function RosterShape({
  players,
  className = "",
}: {
  players: RosterShapePlayer[];
  className?: string;
}) {
  const byPosition = POSITIONS.map((pos) => ({
    position: pos,
    players: players
      .filter((p) => p.position === pos && (p.targetMinutesPerGame ?? 0) > 0)
      .sort((a, b) => (b.targetMinutesPerGame ?? 0) - (a.targetMinutesPerGame ?? 0)),
  }));

  const columnMinutes = byPosition.map((c) =>
    c.players.reduce((sum, p) => sum + (p.targetMinutesPerGame ?? 0), 0),
  );
  const thinnest = Math.min(...columnMinutes);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <Label>Roster shape</Label>
        <span className="text-[11px] tracking-[0.09em] text-ink-muted uppercase">
          Minutes by position
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {byPosition.map((column, i) => {
          // The genuinely thinnest position, flagged only when it is actually
          // a gap rather than merely the smallest of five healthy columns.
          const isGap = columnMinutes[i] === thinnest && columnMinutes[i] < REFERENCE_MINUTES;
          return (
            <div key={column.position} className="flex min-w-0 flex-col">
              {/* Blocks build upward from a shared floor. Every column is the
                  same height so the columns are comparable as *shapes* - an
                  uneven ragged top reads as broken layout, a consistent frame
                  with different fills reads as information. */}
              <div className="relative flex h-32 flex-col justify-end gap-px bg-raised/30">
                {column.players.map((p) => {
                  const minutes = p.targetMinutesPerGame ?? 0;
                  const height = Math.max(12, Math.round((minutes / REFERENCE_MINUTES) * 76));
                  return (
                    <div
                      key={p.leaguePlayerId}
                      title={`${p.fullName} - ${minutes} min`}
                      style={{ height: `${height}px` }}
                      className="flex items-center justify-center overflow-hidden border-t border-team-accent/50 bg-team-accent/20 px-1 text-[11px] font-semibold text-ink"
                    >
                      <span className="truncate">{p.fullName.split(" ").slice(-1)[0]}</span>
                    </div>
                  );
                })}
                {column.players.length === 0 && (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-[11px] font-semibold tracking-[0.09em] text-negative uppercase">
                      None
                    </span>
                  </div>
                )}
              </div>

              <p
                className={`mt-2 border-t pt-1.5 text-center text-[11px] font-semibold tracking-[0.09em] uppercase ${
                  isGap ? "border-negative text-negative" : "border-rule text-ink-muted"
                }`}
              >
                {column.position}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
