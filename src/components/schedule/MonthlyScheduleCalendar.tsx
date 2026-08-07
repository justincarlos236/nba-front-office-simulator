"use client";

import { useMemo } from "react";
import { buildMonthGrid, isSameDate, type SeasonMonth } from "@/lib/calendar/seasonCalendar";

export interface ScheduleGame {
  date: Date;
  opponentLabel: string;
  opponentLogoUrl: string | null;
  isHome: boolean;
  won: boolean | null; // null = not yet played
  teamScore: number | null;
  opponentScore: number | null;
}

const MONTH_LABEL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The (year, month) pair from `monthRange` closest to `today` - the sensible default month to display. */
export function defaultMonthIndex(monthRange: SeasonMonth[], today: Date): number {
  return Math.max(
    0,
    monthRange.findIndex((m) => m.year === today.getFullYear() && m.month === today.getMonth()),
  );
}

export function MonthlyScheduleCalendar({
  games,
  today,
  monthRange,
  monthIndex,
  onMonthChange,
}: {
  games: ScheduleGame[];
  today: Date;
  /** The real (year, month) pairs this season's games actually span - bounds navigation. */
  monthRange: SeasonMonth[];
  /** Controlled - the caller owns which month is shown, so an in-progress simulation reveal can advance it automatically. */
  monthIndex: number;
  onMonthChange: (index: number) => void;
}) {
  const gamesByDate = useMemo(() => {
    const map = new Map<string, ScheduleGame>();
    for (const g of games) {
      map.set(`${g.date.getFullYear()}-${g.date.getMonth()}-${g.date.getDate()}`, g);
    }
    return map;
  }, [games]);

  if (monthRange.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
        Calendar available starting next season.
      </div>
    );
  }

  const current = monthRange[monthIndex];
  const grid = buildMonthGrid(current.year, current.month);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          disabled={monthIndex === 0}
          onClick={() => onMonthChange(Math.max(0, monthIndex - 1))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
        >
          &larr; Prev
        </button>
        <h3 className="text-lg font-semibold text-foreground">
          {MONTH_LABEL[current.month]} {current.year}
        </h3>
        <button
          type="button"
          disabled={monthIndex === monthRange.length - 1}
          onClick={() => onMonthChange(Math.min(monthRange.length - 1, monthIndex + 1))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next &rarr;
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs tracking-wide text-muted uppercase">
        {WEEKDAY_LABEL.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.flat().map((cell, i) => {
          if (!cell.date) {
            return <div key={i} className="aspect-square rounded-lg" />;
          }
          const date = cell.date;
          const game = gamesByDate.get(
            `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          );
          const isToday = isSameDate(date, today);
          const isPast = date < today && !isToday;

          return (
            <div
              key={i}
              className={`relative aspect-square overflow-hidden rounded-lg border ${
                isToday ? "border-accent ring-2 ring-accent" : "border-border"
              } ${isPast ? "bg-surface/50" : "bg-surface"}`}
            >
              <span
                className={`absolute top-1 left-1.5 z-10 text-xs font-medium ${
                  isPast ? "text-muted/60" : "text-muted"
                }`}
              >
                {date.getDate()}
              </span>

              {game && (
                <>
                  {game.opponentLogoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={game.opponentLogoUrl}
                      alt=""
                      className="pointer-events-none absolute inset-0 m-auto h-[68%] w-[68%] object-contain opacity-20"
                    />
                  )}
                  <span
                    className={`absolute right-1.5 bottom-1 z-10 text-[10px] font-semibold tracking-wide uppercase ${
                      isPast ? "text-muted/60" : "text-muted"
                    }`}
                  >
                    {game.isHome ? "vs" : "@"}
                  </span>

                  {game.won !== null && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                      <span
                        className={`text-2xl font-black ${
                          game.won ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {game.won ? "W" : "L"}
                      </span>
                      <span className="font-mono text-[10px] text-foreground">
                        {game.teamScore}-{game.opponentScore}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
