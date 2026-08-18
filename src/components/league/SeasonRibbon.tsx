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
 *
 * The basketball marks the frontier of that fill, across the whole arc rather
 * than within one segment - so it keeps travelling through the playoffs, the
 * draft and the offseason instead of resetting after game 82. It is a readout
 * of existing state and nothing else: every number it uses is already on the
 * page, and it changes no season logic.
 */

const ORDER: { phase: LeaguePhase; label: string }[] = [
  { phase: "regular-season", label: "Regular season" },
  { phase: "playoffs-incomplete", label: "Playoffs" },
  { phase: "pre-draft", label: "Pre-draft" },
  { phase: "draft-incomplete", label: "Draft" },
  { phase: "ready", label: "Offseason" },
];

/**
 * Degrees the ball turns across the full arc.
 *
 * A ball that rolled true would spin many times over this distance, which at
 * this size reads as a spinning icon rather than a marker moving. Half a turn
 * across a whole season is enough to register as rolling when it advances and
 * invisible when it sits still.
 */
const ROLL_DEGREES = 180;

/** The seams, at a size where only the four main ones survive. */
function Basketball({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.6" className="fill-field stroke-team-accent" strokeWidth="1.6" />
      <g className="stroke-team-accent" strokeWidth="1.05" fill="none" strokeLinecap="round">
        <path d="M8 1.4V14.6" />
        <path d="M1.4 8H14.6" />
        <path d="M3.5 3.1C5.3 5.2 5.3 10.8 3.5 12.9" />
        <path d="M12.5 3.1C10.7 5.2 10.7 10.8 12.5 12.9" />
      </g>
    </svg>
  );
}

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

  // Where the fill ends, measured across the whole ribbon rather than within
  // one segment. The segments are equal `flex-1` widths, so each is worth
  // 1/ORDER.length of the track - which is what lets the ball carry on through
  // the later phases on the same scale it used for the regular season.
  //
  // Outside the regular season the active segment fills whole, for the reason
  // in the docstring, so the frontier is that segment's trailing edge.
  const arcFraction = inRegularSeason ? seasonPct / 100 : 1;
  const markerPct =
    activeIndex < 0 ? null : ((activeIndex + arcFraction) / ORDER.length) * 100;

  return (
    <div className={className}>
      {/* `relative` so the marker can be placed against the full track. The
          segments keep their own `overflow-hidden`; the ball is a sibling, so
          it is free to sit proud of the line without being clipped. */}
      <div className="relative">
        <div className="flex items-stretch gap-px">
          {ORDER.map((stage, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <div key={stage.phase} className="min-w-0 flex-1">
                {/* Thicker than a rule on purpose - at 1.5px this read as a
                    divider rather than as progress. */}
                <div className="relative h-2.5 overflow-hidden bg-raised">
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

        {markerPct !== null && (
          <Basketball
            className="season-ribbon-ball pointer-events-none absolute top-1.25 size-3.5"
            style={{
              left: `${markerPct}%`,
              transform: `translate(-50%, -50%) rotate(${(markerPct / 100) * ROLL_DEGREES}deg)`,
            }}
          />
        )}
      </div>

      {inRegularSeason && (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-ink-muted">
          {gamesPlayed} of {gamesTotal} played
        </p>
      )}
    </div>
  );
}
