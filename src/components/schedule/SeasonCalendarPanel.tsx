import { seasonCalendarEvents, type CalendarEvent } from "@/lib/calendar/seasonCalendar";

interface SeasonCalendarPanelProps {
  season: number;
  /** The day the league is currently on, or null once the regular season is done. */
  currentDayIndex: number | null;
  /** Last day of the generated schedule - the loop can overrun its target, so this is read, not assumed. */
  regularSeasonEndDayIndex: number;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * How far away an event is, in the terms a GM actually thinks in. Deliberately
 * not a raw day count for everything - "today" and "passed" are the two states
 * that change what the user can do, so they get said plainly.
 */
function countdown(event: CalendarEvent, currentDayIndex: number | null): string | null {
  if (event.dayIndex === null || currentDayIndex === null) return null;
  const days = event.dayIndex - currentDayIndex;
  if (days < 0) return "passed";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function SeasonCalendarPanel({
  season,
  currentDayIndex,
  regularSeasonEndDayIndex,
}: SeasonCalendarPanelProps) {
  const events = seasonCalendarEvents(season, regularSeasonEndDayIndex);
  const dated = events.filter((e) => e.dateDriven);
  const chained = events.filter((e) => !e.dateDriven);

  const isPast = (e: CalendarEvent) =>
    currentDayIndex !== null && e.dayIndex !== null && e.dayIndex < currentDayIndex;
  const isToday = (e: CalendarEvent) => currentDayIndex !== null && e.dayIndex === currentDayIndex;

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <h2 className="text-lg font-semibold text-ink">Season Calendar</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {currentDayIndex === null
          ? "The regular season is complete. What follows unlocks in order."
          : "Fixed dates on the league calendar, then the postseason chain."}
      </p>

      <ul className="mt-5 flex flex-col gap-px bg-rule/30">
        {dated.map((event) => {
          const when = countdown(event, currentDayIndex);
          const past = isPast(event);
          const today = isToday(event);
          return (
            <li
              key={event.kind}
              className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-field px-3 py-3 ${
                past ? "opacity-45" : ""
              }`}
            >
              <div className="flex min-w-0 flex-col">
                <span
                  className={`text-sm font-semibold ${today ? "text-team-accent" : "text-ink"}`}
                >
                  {event.label}
                </span>
                <span className="text-xs text-ink-muted">{event.detail}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-sm tabular-nums text-ink">
                  {event.date ? formatDate(event.date) : "-"}
                </span>
                {when && (
                  <span
                    className={`text-xs tabular-nums ${today ? "text-team-accent" : "text-ink-muted"}`}
                  >
                    {when}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Unlocks in order
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        These have no fixed date - each one opens when the stage before it finishes, the same way a
        real postseason moves.
      </p>
      <ul className="mt-3 flex flex-col gap-px bg-rule/30">
        {chained.map((event) => (
          <li
            key={event.kind}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-field px-3 py-2"
          >
            <span className="text-sm text-ink">{event.label}</span>
            <span className="text-xs text-ink-muted">{event.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
