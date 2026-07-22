export interface CalendarGame {
  dayIndex: number;
  opponentLabel: string;
  isHome: boolean;
  won: boolean | null; // null = not yet played
  teamScore: number | null;
  opponentScore: number | null;
}

/**
 * Renders only this team's own games (not every day of the season) - with
 * ~82 games across a ~155-220 day season, rendering every empty day as its
 * own row would be mostly blank space. A "N days rest" divider between
 * rows conveys the same "days without a game" information more compactly.
 * `dayIndex` is a sequential day-of-season index, not a real calendar date
 * (see src/lib/simulation/generateSchedule.ts) - kept simple per the
 * original design brief.
 */
export function SeasonCalendar({ games }: { games: CalendarGame[] }) {
  if (games.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
        Calendar available starting next season.
      </div>
    );
  }

  const sorted = [...games].sort((a, b) => a.dayIndex - b.dayIndex);

  return (
    <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
      {sorted.map((g, i) => {
        const prevDay = i > 0 ? sorted[i - 1].dayIndex : null;
        const restDays = prevDay !== null ? g.dayIndex - prevDay - 1 : 0;
        return (
          <div key={g.dayIndex}>
            {restDays > 0 && (
              <p className="py-1 text-center text-xs text-muted">
                {restDays} day{restDays > 1 ? "s" : ""} rest
              </p>
            )}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted">Day {g.dayIndex}</span>
              <span className="flex-1 text-foreground">
                {g.isHome ? "vs" : "@"} {g.opponentLabel}
              </span>
              {g.won === null ? (
                <span className="text-xs text-muted">Upcoming</span>
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    g.won ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {g.won ? "W" : "L"} {g.teamScore}-{g.opponentScore}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
