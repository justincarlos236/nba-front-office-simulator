import type { LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * THE WIRE - the season as a spine.
 *
 * `LeaguePhase` gates six systems and, before the redesign, was never named
 * anywhere inside a save. The redesign named it; this makes it *spatial*.
 * A phase label tells you where you are. A ribbon tells you where you are in
 * the arc - what is behind you, what is coming, and how far through the
 * current stretch you have played.
 *
 * The progress fill is real: games played over games scheduled for the user's
 * own team. Outside the regular season there is no honest fraction to show,
 * so the active segment fills whole rather than inventing a percentage.
 */

const ORDER: { phase: LeaguePhase; label: string }[] = [
  { phase: "regular-season", label: "Regular season" },
  { phase: "playoffs-incomplete", label: "Playoffs" },
  { phase: "pre-draft", label: "Pre-draft" },
  { phase: "draft-incomplete", label: "Draft" },
  { phase: "ready", label: "Offseason" },
];

export function SeasonRibbon({
  phase,
  gamesPlayed = 0,
  gamesTotal = 0,
  className = "",
}: {
  phase: LeaguePhase;
  gamesPlayed?: number;
  gamesTotal?: number;
  className?: string;
}) {
  const activeIndex = ORDER.findIndex((s) => s.phase === phase);
  const inRegularSeason = phase === "regular-season" && gamesTotal > 0;
  const seasonPct = inRegularSeason
    ? Math.min(100, Math.round((gamesPlayed / gamesTotal) * 100))
    : 0;

  return (
    <div className={className}>
      <div className="flex items-stretch gap-px">
        {ORDER.map((stage, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <div key={stage.phase} className="min-w-0 flex-1">
              <div className="relative h-1.5 overflow-hidden bg-raised">
                {done && <div className="absolute inset-0 bg-rule" />}
                {active && (
                  <div
                    className="absolute inset-y-0 left-0 bg-team-accent"
                    style={{ width: inRegularSeason ? `${seasonPct}%` : "100%" }}
                  />
                )}
              </div>
              <p
                className={`mt-1.5 truncate text-[11px] font-semibold tracking-[0.09em] uppercase ${
                  active ? "text-team-accent" : done ? "text-ink-muted" : "text-rule"
                }`}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>

      {inRegularSeason && (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-ink-muted">
          {gamesPlayed} of {gamesTotal} played
        </p>
      )}
    </div>
  );
}
