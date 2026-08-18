"use client";

import Link from "next/link";
import type { LiveGameResult } from "@/components/playoffs/LiveGameExperience";

export function PostgameSummary({
  leagueId,
  seriesId,
  result,
  userTeamId,
}: {
  leagueId: string;
  seriesId: string;
  result: LiveGameResult;
  userTeamId: string;
}) {
  /**
   * Every label here comes off `result`, never off the `homeTeam`/`awayTeam`
   * props.
   *
   * **Home court alternates between games of a series.** The props describe
   * the fixture the page is currently pointed at, which after a completed game
   * is the *next* one - so their home/away assignment is the reverse of the
   * game whose box score this component is rendering. Labelling this result
   * with them printed the winner's score beside the loser's name and put each
   * club's players under the other club's heading, which read as the user
   * winning a game they had lost.
   *
   * `playLiveSeriesGameAction` returns `homeTeamLabel`/`awayTeamLabel` for the
   * game it actually played, alongside the ids the box score is keyed by. That
   * is the only self-consistent source, so it is the one used.
   */
  const homeLabel = result.homeTeamLabel;
  const awayLabel = result.awayTeamLabel;

  const winner = result.homeWon ? homeLabel : awayLabel;
  const loser = result.homeWon ? awayLabel : homeLabel;

  const higherSeedIsHome = result.higherSeedTeamId === result.homeTeamId;
  const higherSeedLabel = higherSeedIsHome ? homeLabel : awayLabel;
  const lowerSeedLabel = higherSeedIsHome ? awayLabel : homeLabel;

  const seriesDecided = Boolean(result.seriesWinnerTeamId);
  const seriesWinnerLabel =
    result.seriesWinnerTeamId === result.homeTeamId
      ? homeLabel
      : result.seriesWinnerTeamId === result.awayTeamId
        ? awayLabel
        : null;

  const userIsHigherSeed = result.higherSeedTeamId === userTeamId;
  const userWins = userIsHigherSeed ? result.seriesHigherSeedWins : result.seriesLowerSeedWins;
  const opponentWins = userIsHigherSeed ? result.seriesLowerSeedWins : result.seriesHigherSeedWins;
  const opponentLabel = userTeamId === result.homeTeamId ? awayLabel : homeLabel;

  const homeLines = result.boxScore
    .filter((l) => l.leagueTeamId === result.homeTeamId)
    .sort((a, b) => b.points - a.points);
  const awayLines = result.boxScore
    .filter((l) => l.leagueTeamId === result.awayTeamId)
    .sort((a, b) => b.points - a.points);

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-[2px] border border-rule bg-field p-6 text-center">
        <p className="text-xs font-semibold tracking-wide text-team-accent uppercase">Final</p>
        <p className="mt-2 text-3xl font-black text-ink">
          {winner} {result.homeWon ? result.finalHomeScore : result.finalAwayScore} -{" "}
          {result.homeWon ? result.finalAwayScore : result.finalHomeScore} {loser}
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          {seriesDecided
            ? `${seriesWinnerLabel} wins the series ${Math.max(result.seriesHigherSeedWins, result.seriesLowerSeedWins)}-${Math.min(result.seriesHigherSeedWins, result.seriesLowerSeedWins)}.`
            : userWins === opponentWins
              ? `Series tied ${userWins}-${opponentWins} against ${opponentLabel}.`
              : userWins > opponentWins
                ? `You lead ${userWins}-${opponentWins} against ${opponentLabel}.`
                : `${opponentLabel} leads ${opponentWins}-${userWins}.`}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {higherSeedLabel} vs {lowerSeedLabel}
        </p>
      </div>

      {result.champion && (
        <div className="rounded-[2px] border border-team-accent bg-team-accent/10 p-6 text-center">
          <p className="text-sm tracking-wide text-ink-muted uppercase">League Champion</p>
          <p className="mt-1 text-2xl font-bold text-ink">{seriesWinnerLabel}</p>
          <Link
            href={`/leagues/${leagueId}/offseason`}
            className="mt-4 inline-block rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
          >
            Continue to the offseason &rarr;
          </Link>
        </div>
      )}

      {result.news.length > 0 && (
        <div className="rounded-[2px] border border-rule bg-field p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Storylines</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {result.news.map((n, i) => (
              <li key={i}>{n.description}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BoxScoreTable label={homeLabel} lines={homeLines} />
        <BoxScoreTable label={awayLabel} lines={awayLines} />
      </div>

      <div className="flex justify-center gap-3 pt-2">
        {!seriesDecided && (
          // A plain anchor, not next/link - the URL is identical to the
          // page we're already on (only the series' win counts changed,
          // not the seriesId in the path), so a client-side Link would skip
          // re-running the server component entirely and leave the next
          // game's home/away, rotation, and game-number props stuck on
          // this game's stale values. A full reload guarantees they're
          // recomputed fresh for the next game in the series.
          <a
            href={`/leagues/${leagueId}/playoffs/live/${seriesId}`}
            className="rounded-[2px] bg-team-accent px-5 py-2.5 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
          >
            Play next game &rarr;
          </a>
        )}
        <Link
          href={`/leagues/${leagueId}/playoffs`}
          className="rounded-[2px] border border-rule px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-raised"
        >
          Back to playoffs
        </Link>
      </div>
    </div>
  );
}

function BoxScoreTable({ label, lines }: { label: string; lines: LiveGameResult["boxScore"] }) {
  return (
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-muted">
              <th className="py-1 pr-2 font-medium">Player</th>
              <th className="px-1 py-1 text-right font-medium">PTS</th>
              <th className="px-1 py-1 text-right font-medium">REB</th>
              <th className="px-1 py-1 text-right font-medium">AST</th>
              <th className="px-1 py-1 text-right font-medium">STL</th>
              <th className="px-1 py-1 text-right font-medium">BLK</th>
              <th className="pl-1 py-1 text-right font-medium">TO</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {lines.map((l) => (
              <tr key={l.leaguePlayerId} className="border-t border-rule">
                <td className="py-1 pr-2 font-sans text-ink">{l.playerName}</td>
                <td className="px-1 py-1 text-right text-ink">{l.points}</td>
                <td className="px-1 py-1 text-right text-ink-muted">{l.rebounds}</td>
                <td className="px-1 py-1 text-right text-ink-muted">{l.assists}</td>
                <td className="px-1 py-1 text-right text-ink-muted">{l.steals}</td>
                <td className="px-1 py-1 text-right text-ink-muted">{l.blocks}</td>
                <td className="py-1 pl-1 text-right text-ink-muted">{l.turnovers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
