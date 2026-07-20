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

// Round-1 slot count anchors the whole grid's row units - every later
// round's row-start/span is derived from it (span doubles each round, so a
// round-2 box always covers exactly the 2 round-1 rows that feed it, etc).
// Fixed at 4 for this app's 8-team-per-conference bracket, but computed
// rather than hardcoded so this still works if that ever changes.
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

export function PlayoffBracket({
  eastRounds,
  westRounds,
  finals,
  gamesBySeriesId,
  userTeamId,
}: PlayoffBracketProps) {
  const round1Count = eastRounds[0].length || 4;

  return (
    <div className="mt-10 flex items-stretch justify-center gap-2">
      <ConferenceBracket
        conference="EAST"
        rounds={eastRounds}
        round1Count={round1Count}
        gamesBySeriesId={gamesBySeriesId}
        userTeamId={userTeamId}
        mirrored={false}
      />

      <div className="flex flex-col items-center justify-center gap-2 px-1">
        <p className="text-[10px] tracking-wide text-muted uppercase">Finals</p>
        {finals.length > 0 ? (
          <MatchupBox
            series={finals[0]}
            games={gamesBySeriesId.get(finals[0].id) ?? []}
            userTeamId={userTeamId}
            width="w-24"
          />
        ) : (
          <TbdBox width="w-24" />
        )}
      </div>

      <ConferenceBracket
        conference="WEST"
        rounds={westRounds}
        round1Count={round1Count}
        gamesBySeriesId={gamesBySeriesId}
        userTeamId={userTeamId}
        mirrored
      />
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
  const connectorSide = mirrored ? "right" : "left";

  return (
    <div className="flex flex-col">
      <p
        className={`mb-2 text-[10px] tracking-wide text-muted uppercase ${mirrored ? "text-right" : ""}`}
      >
        {conference === "EAST" ? "East" : "West"}
      </p>
      <div className="mb-1 flex gap-1">
        {roundIndexOrder.map((roundIndex, col) => (
          <div key={roundIndex} className="flex items-center gap-1">
            <h3 className="w-20 text-center text-[9px] font-medium text-muted">
              {ROUND_LABELS[roundIndex]}
            </h3>
            {col < roundIndexOrder.length - 1 && <div className="w-3" />}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 gap-x-1 gap-y-1"
        style={{ gridTemplateRows: `repeat(${round1Count}, minmax(40px, auto))` }}
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
                    style={{ gridRow: `${start} / span ${span}`, gridColumn: boxColumn }}
                  >
                    {series ? (
                      <MatchupBox
                        series={series}
                        games={gamesBySeriesId.get(series.id) ?? []}
                        userTeamId={userTeamId}
                        width="w-20"
                      />
                    ) : (
                      <TbdBox width="w-20" />
                    )}
                  </div>
                );
              })}
              {!isLastRound &&
                padded[roundIndexOrder[col + 1]].map((_, slotIndex) => {
                  const nextRoundIndex = roundIndexOrder[col + 1];
                  const { start, span } = rowRange(nextRoundIndex, slotIndex);
                  return (
                    <div
                      key={`connector-${slotIndex}`}
                      className="relative w-3"
                      style={{ gridRow: `${start} / span ${span}`, gridColumn: connectorColumn }}
                    >
                      <div
                        className={`absolute inset-y-0 w-px bg-border ${
                          connectorSide === "left" ? "left-0" : "right-0"
                        }`}
                      />
                      <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-border" />
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamLine({
  team,
  wins,
  isWinner,
  isUser,
}: {
  team: BracketTeam;
  wins: number | null;
  isWinner: boolean;
  isUser: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-1" title={`${team.city} ${team.name}`}>
      <div className="flex min-w-0 items-center gap-1">
        {team.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" width={12} height={12} className="shrink-0" />
        )}
        <span
          className={`truncate ${isWinner ? "font-semibold text-foreground" : "text-muted"} ${
            isUser ? "text-accent" : ""
          }`}
        >
          {team.abbreviation}
        </span>
      </div>
      {wins !== null && <span className="shrink-0 font-mono text-muted">{wins}</span>}
    </div>
  );
}

function MatchupBox({
  series,
  games,
  userTeamId,
  width,
}: {
  series: BracketSeries;
  games: BracketGame[];
  userTeamId: string | null;
  width: string;
}) {
  const decided = Boolean(series.winnerTeamId);
  const higherWon = series.winnerTeamId === series.higherSeedTeamId;
  const involvesUser =
    series.higherSeedTeamId === userTeamId || series.lowerSeedTeamId === userTeamId;

  return (
    <div
      className={`${width} rounded-md border p-1.5 text-[10px] ${
        involvesUser ? "border-accent bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <TeamLine
        team={series.higherSeedTeam.team}
        wins={series.higherSeedWins}
        isWinner={decided && higherWon}
        isUser={series.higherSeedTeamId === userTeamId}
      />
      <div className="my-0.5 border-t border-border" />
      <TeamLine
        team={series.lowerSeedTeam.team}
        wins={series.lowerSeedWins}
        isWinner={decided && !higherWon}
        isUser={series.lowerSeedTeamId === userTeamId}
      />
      {games.length > 0 && (
        <details className="mt-0.5">
          <summary className="cursor-pointer truncate text-[9px] text-muted hover:text-foreground">
            {games.length}g played
          </summary>
          <ul className="mt-1 space-y-0.5 border-t border-border pt-1">
            {games.map((g, i) => {
              const higherHome = g.homeLeagueTeamId === series.higherSeedTeamId;
              const higherScore = higherHome ? g.homeScore : g.awayScore;
              const lowerScore = higherHome ? g.awayScore : g.homeScore;
              return (
                <li key={g.id} className="flex items-center justify-between text-[9px] text-muted">
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
    </div>
  );
}

function TbdBox({ width }: { width: string }) {
  return (
    <div className={`${width} rounded-md border border-dashed border-border p-1.5 text-[10px]`}>
      <p className="text-muted">TBD</p>
      <div className="my-0.5 border-t border-border" />
      <p className="text-muted">TBD</p>
    </div>
  );
}
