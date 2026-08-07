"use client";

import Link from "next/link";
import type { LiveGameResult, LiveTeamInfo } from "@/components/playoffs/LiveGameExperience";

export function PostgameSummary({
  leagueId,
  seriesId,
  result,
  homeTeam,
  awayTeam,
  userTeamId,
}: {
  leagueId: string;
  seriesId: string;
  result: LiveGameResult;
  homeTeam: LiveTeamInfo;
  awayTeam: LiveTeamInfo;
  userTeamId: string;
}) {
  const winner = result.homeWon ? homeTeam : awayTeam;
  const loser = result.homeWon ? awayTeam : homeTeam;

  const higherSeedLabel = result.higherSeedTeamId === homeTeam.id ? homeTeam.label : awayTeam.label;
  const lowerSeedLabel = result.higherSeedTeamId === homeTeam.id ? awayTeam.label : homeTeam.label;

  const seriesDecided = Boolean(result.seriesWinnerTeamId);
  const seriesWinnerLabel =
    result.seriesWinnerTeamId === homeTeam.id
      ? homeTeam.label
      : result.seriesWinnerTeamId === awayTeam.id
        ? awayTeam.label
        : null;

  const userIsHigherSeed = result.higherSeedTeamId === userTeamId;
  const userWins = userIsHigherSeed ? result.seriesHigherSeedWins : result.seriesLowerSeedWins;
  const opponentWins = userIsHigherSeed ? result.seriesLowerSeedWins : result.seriesHigherSeedWins;
  const opponentLabel = userTeamId === homeTeam.id ? awayTeam.label : homeTeam.label;

  const homeLines = result.boxScore
    .filter((l) => l.leagueTeamId === result.homeTeamId)
    .sort((a, b) => b.points - a.points);
  const awayLines = result.boxScore
    .filter((l) => l.leagueTeamId === result.awayTeamId)
    .sort((a, b) => b.points - a.points);

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-xs font-semibold tracking-wide text-accent uppercase">Final</p>
        <p className="mt-2 text-3xl font-black text-foreground">
          {winner.label} {result.homeWon ? result.finalHomeScore : result.finalAwayScore} -{" "}
          {result.homeWon ? result.finalAwayScore : result.finalHomeScore} {loser.label}
        </p>
        <p className="mt-3 text-sm text-muted">
          {seriesDecided
            ? `${seriesWinnerLabel} wins the series ${Math.max(result.seriesHigherSeedWins, result.seriesLowerSeedWins)}-${Math.min(result.seriesHigherSeedWins, result.seriesLowerSeedWins)}.`
            : userWins === opponentWins
              ? `Series tied ${userWins}-${opponentWins} against ${opponentLabel}.`
              : userWins > opponentWins
                ? `You lead ${userWins}-${opponentWins} against ${opponentLabel}.`
                : `${opponentLabel} leads ${opponentWins}-${userWins}.`}
        </p>
        <p className="mt-1 text-xs text-muted">
          {higherSeedLabel} vs {lowerSeedLabel}
        </p>
      </div>

      {result.champion && (
        <div className="rounded-xl border border-accent bg-accent/10 p-6 text-center">
          <p className="text-sm tracking-wide text-muted uppercase">League Champion</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{seriesWinnerLabel}</p>
          <Link
            href={`/leagues/${leagueId}/offseason`}
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Continue to the offseason &rarr;
          </Link>
        </div>
      )}

      {result.news.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Storylines</p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {result.news.map((n, i) => (
              <li key={i}>{n.description}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BoxScoreTable label={homeTeam.label} lines={homeLines} />
        <BoxScoreTable label={awayTeam.label} lines={awayLines} />
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
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Play next game &rarr;
          </a>
        )}
        <Link
          href={`/leagues/${leagueId}/playoffs`}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-surface-2"
        >
          Back to playoffs
        </Link>
      </div>
    </div>
  );
}

function BoxScoreTable({ label, lines }: { label: string; lines: LiveGameResult["boxScore"] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted">
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
              <tr key={l.leaguePlayerId} className="border-t border-border">
                <td className="py-1 pr-2 font-sans text-foreground">{l.playerName}</td>
                <td className="px-1 py-1 text-right text-foreground">{l.points}</td>
                <td className="px-1 py-1 text-right text-muted">{l.rebounds}</td>
                <td className="px-1 py-1 text-right text-muted">{l.assists}</td>
                <td className="px-1 py-1 text-right text-muted">{l.steals}</td>
                <td className="px-1 py-1 text-right text-muted">{l.blocks}</td>
                <td className="py-1 pl-1 text-right text-muted">{l.turnovers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
