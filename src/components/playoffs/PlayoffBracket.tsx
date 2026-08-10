interface BracketTeam {
  city: string;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
}

export interface BracketSeries {
  id: string;
  higherSeedTeam: { team: BracketTeam };
  lowerSeedTeam: { team: BracketTeam };
  higherSeedTeamId: string;
  lowerSeedTeamId: string;
  higherSeedWins: number;
  lowerSeedWins: number;
  winnerTeamId: string | null;
}

export interface BracketGame {
  id: string;
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface PlayoffBracketProps {
  eastRounds: [BracketSeries[], BracketSeries[], BracketSeries[]];
  westRounds: [BracketSeries[], BracketSeries[], BracketSeries[]];
  finals: BracketSeries[];
  gamesBySeriesId: Map<string, BracketGame[]>;
  userTeamId: string | null;
}

// Short forms fit the compact per-round column headers; the full names
// ("Conference Semifinals" etc.) are still used elsewhere on the page.
const ROUND_LABELS = ["Round 1", "Conf. Semis", "Conf. Finals"];

// A round-N box always covers exactly the 2 round-(N-1) boxes that feed
// it (span doubles each round: 1, 2, 4, ...), so every later round's
// row-start/span is derived purely from this, not tracked separately -
// that's what keeps boxes and connector lines pixel-aligned with no
// manual height math, regardless of which teams actually advance.
function rowRange(roundIndex: number, slotIndex: number) {
  const span = 2 ** roundIndex;
  return { start: slotIndex * span + 1, span };
}

/**
 * Pads a round's series list out to `slotCount` (nulls render as "TBD" -
 * that round hasn't been reached yet). Callers pass series pre-sorted by
 * `bracketSlot`, so array position already is the slot index.
 */
function padRound(series: BracketSeries[], slotCount: number): (BracketSeries | null)[] {
  const padded: (BracketSeries | null)[] = Array(slotCount).fill(null);
  for (let i = 0; i < series.length && i < slotCount; i++) {
    padded[i] = series[i];
  }
  return padded;
}

const BOX_WIDTH = "w-24";
const CONNECTOR_WIDTH = "w-4";

export function PlayoffBracket({
  eastRounds,
  westRounds,
  finals,
  gamesBySeriesId,
  userTeamId,
}: PlayoffBracketProps) {
  const round1Count = eastRounds[0].length || 4;

  return (
    <div className="mt-10 overflow-x-auto pb-4">
      <div className="flex min-w-max items-stretch justify-center gap-0">
        <ConferenceBracket
          conference="EAST"
          rounds={eastRounds}
          round1Count={round1Count}
          gamesBySeriesId={gamesBySeriesId}
          userTeamId={userTeamId}
          mirrored={false}
        />

        <FinalsConnector />

        <div className="flex flex-col items-center justify-center gap-2 px-1">
          <p className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
            NBA Finals
          </p>
          {finals.length > 0 ? (
            <MatchupBox
              series={finals[0]}
              games={gamesBySeriesId.get(finals[0].id) ?? []}
              userTeamId={userTeamId}
            />
          ) : (
            <TbdBox />
          )}
        </div>

        <FinalsConnector />

        <ConferenceBracket
          conference="WEST"
          rounds={westRounds}
          round1Count={round1Count}
          gamesBySeriesId={gamesBySeriesId}
          userTeamId={userTeamId}
          mirrored
        />
      </div>
    </div>
  );
}

/**
 * A straight link from each conference's Conference Finals box into the
 * centered NBA Finals box - unlike the per-round connectors, this is
 * always a direct 1-to-1 join, so it doesn't need the elbow shape. Both
 * conference grids and this connector share the same flex row with
 * `items-stretch`, so a single line at the vertical midpoint of the full
 * shared height lines up with the Finals box (vertically centered in its
 * own column) and each conference's Conference Finals box (vertically
 * centered across its whole bracket) without any extra math.
 */
function FinalsConnector() {
  return (
    <div className={`relative ${CONNECTOR_WIDTH}`}>
      <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-border" />
    </div>
  );
}

function ConferenceBracket({
  conference,
  rounds,
  round1Count,
  gamesBySeriesId,
  userTeamId,
  mirrored,
}: {
  conference: "EAST" | "WEST";
  rounds: [BracketSeries[], BracketSeries[], BracketSeries[]];
  round1Count: number;
  gamesBySeriesId: Map<string, BracketGame[]>;
  userTeamId: string | null;
  mirrored: boolean;
}) {
  const padded = [
    padRound(rounds[0], round1Count),
    padRound(rounds[1], round1Count / 2),
    padRound(rounds[2], round1Count / 4),
  ];

  // Column order visually reverses for the West side, so both conferences
  // fan inward toward the Finals box in the center.
  const roundIndexOrder = mirrored ? [2, 1, 0] : [0, 1, 2];
  // Which edge of each connector cell the vertical spine sits on - the
  // side nearer the two boxes it's joining together.
  const connectorSide = mirrored ? "right" : "left";

  return (
    <div className="flex flex-col">
      <p
        className={`mb-2 text-[10px] font-semibold tracking-wide text-ink-muted uppercase ${mirrored ? "text-right" : ""}`}
      >
        {conference === "EAST" ? "East" : "West"}
      </p>
      <div className="mb-2 flex gap-2">
        {roundIndexOrder.map((roundIndex, col) => (
          <div key={roundIndex} className="flex items-center gap-2">
            <h3 className={`${BOX_WIDTH} text-center text-[9px] font-medium text-ink-muted`}>
              {ROUND_LABELS[roundIndex]}
            </h3>
            {col < roundIndexOrder.length - 1 && <div className={CONNECTOR_WIDTH} />}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 gap-x-2 gap-y-3"
        style={{ gridTemplateRows: `repeat(${round1Count}, minmax(60px, auto))` }}
      >
        {roundIndexOrder.map((roundIndex, col) => {
          const isLastRound = col === roundIndexOrder.length - 1;
          const boxColumn = col * 2 + 1;
          const connectorColumn = boxColumn + 1;
          return (
            <div key={roundIndex} style={{ display: "contents" }}>
              {padded[roundIndex].map((series, slotIndex) => {
                const { start, span } = rowRange(roundIndex, slotIndex);
                return (
                  <div
                    key={slotIndex}
                    className="flex h-full items-center"
                    style={{ gridRow: `${start} / span ${span}`, gridColumn: boxColumn }}
                  >
                    {series ? (
                      <MatchupBox
                        series={series}
                        games={gamesBySeriesId.get(series.id) ?? []}
                        userTeamId={userTeamId}
                      />
                    ) : (
                      <TbdBox />
                    )}
                  </div>
                );
              })}
              {!isLastRound &&
                padded[roundIndexOrder[col + 1]].map((_, slotIndex) => {
                  const nextRoundIndex = roundIndexOrder[col + 1];
                  const { start, span } = rowRange(nextRoundIndex, slotIndex);
                  return (
                    <RoundConnector
                      key={`connector-${slotIndex}`}
                      rowStart={start}
                      rowSpan={span}
                      gridColumn={connectorColumn}
                      side={connectorSide}
                    />
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Joins exactly two round-N boxes into the round-(N+1) box that follows
 * them: a vertical spine running between the two children's own vertical
 * centers (25%/75% of this cell, since a parent's cell always spans
 * exactly its 2 children), with three stubs - one into each child, one
 * into the parent - so it's unambiguous which two series feed which next
 * matchup, not just a floating line.
 */
function RoundConnector({
  rowStart,
  rowSpan,
  gridColumn,
  side,
}: {
  rowStart: number;
  rowSpan: number;
  gridColumn: number;
  side: "left" | "right";
}) {
  return (
    <div
      className={`relative ${CONNECTOR_WIDTH}`}
      style={{ gridRow: `${rowStart} / span ${rowSpan}`, gridColumn }}
    >
      <div
        className={`absolute w-px bg-border ${side === "left" ? "left-0" : "right-0"}`}
        style={{ top: "25%", bottom: "25%" }}
      />
      <div className="absolute inset-x-0 h-px bg-border" style={{ top: "25%" }} />
      <div className="absolute inset-x-0 h-px bg-border" style={{ top: "50%" }} />
      <div className="absolute inset-x-0 h-px bg-border" style={{ top: "75%" }} />
    </div>
  );
}

function TeamLine({
  team,
  wins,
  isWinner,
  isDecided,
  isUser,
}: {
  team: BracketTeam;
  wins: number | null;
  isWinner: boolean;
  isDecided: boolean;
  isUser: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1 rounded px-1 py-0.5 ${
        isDecided && isWinner ? "bg-foreground/[0.06]" : ""
      }`}
      title={`${team.city} ${team.name}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        {team.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" width={13} height={13} className="shrink-0" />
        )}
        <span
          className={`truncate ${
            isDecided && !isWinner
              ? "text-ink-muted/60"
              : isWinner
                ? "font-semibold text-ink"
                : "text-ink-muted"
          } ${isUser ? "text-team-accent" : ""}`}
        >
          {team.abbreviation}
        </span>
      </div>
      {wins !== null && (
        <span
          className={`shrink-0 font-mono ${isDecided && isWinner ? "font-semibold text-ink" : "text-ink-muted"}`}
        >
          {wins}
        </span>
      )}
    </div>
  );
}

function MatchupBox({
  series,
  games,
  userTeamId,
}: {
  series: BracketSeries;
  games: BracketGame[];
  userTeamId: string | null;
}) {
  const decided = Boolean(series.winnerTeamId);
  const higherWon = series.winnerTeamId === series.higherSeedTeamId;
  const involvesUser =
    series.higherSeedTeamId === userTeamId || series.lowerSeedTeamId === userTeamId;

  return (
    <div
      className={`${BOX_WIDTH} rounded-[2px] border p-1 text-[10px] ${
        involvesUser ? "border-team-accent bg-team-accent/5" : "border-rule bg-field"
      }`}
    >
      <TeamLine
        team={series.higherSeedTeam.team}
        wins={series.higherSeedWins}
        isWinner={higherWon}
        isDecided={decided}
        isUser={series.higherSeedTeamId === userTeamId}
      />
      <div className="my-0.5 border-t border-rule" />
      <TeamLine
        team={series.lowerSeedTeam.team}
        wins={series.lowerSeedWins}
        isWinner={!higherWon}
        isDecided={decided}
        isUser={series.lowerSeedTeamId === userTeamId}
      />
      {games.length > 0 && (
        <details className="mt-0.5">
          <summary className="cursor-pointer truncate text-[9px] text-ink-muted hover:text-ink">
            {decided ? "Final" : "In progress"} &middot; {games.length}g
          </summary>
          <ul className="mt-1 space-y-0.5 border-t border-rule pt-1">
            {games.map((g, i) => {
              const higherHome = g.homeLeagueTeamId === series.higherSeedTeamId;
              const higherScore = higherHome ? g.homeScore : g.awayScore;
              const lowerScore = higherHome ? g.awayScore : g.homeScore;
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between text-[9px] text-ink-muted"
                >
                  <span>G{i + 1}</span>
                  <span className="font-mono">
                    {higherScore}-{lowerScore}
                    {higherHome ? " (H)" : " (A)"}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {!decided && games.length === 0 && (
        <p className="mt-0.5 text-[9px] text-ink-muted">Not started</p>
      )}
    </div>
  );
}

function TbdBox() {
  return (
    <div className={`${BOX_WIDTH} rounded-[2px] border border-dashed border-rule p-1 text-[10px]`}>
      <p className="px-1 py-0.5 text-ink-muted">TBD</p>
      <div className="my-0.5 border-t border-rule" />
      <p className="px-1 py-0.5 text-ink-muted">TBD</p>
    </div>
  );
}
