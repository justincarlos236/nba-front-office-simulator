import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deriveOverallRating } from "@/lib/league/ratingFromStats";

interface PageProps {
  params: Promise<{ abbreviation: string }>;
}

export async function generateStaticParams() {
  const teams = await prisma.team.findMany({ select: { abbreviation: true } });
  return teams.map((t) => ({ abbreviation: t.abbreviation }));
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { abbreviation } = await params;

  const team = await prisma.team.findUnique({
    where: { abbreviation: abbreviation.toUpperCase() },
    include: {
      players: {
        include: {
          seasonStats: { where: { season: 2023 } },
        },
      },
    },
  });

  if (!team) notFound();

  const roster = team.players
    .map((player) => {
      const stat = player.seasonStats[0];
      const rating = stat
        ? deriveOverallRating({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 })
        : null;
      return { player, stat, rating };
    })
    .sort((a, b) => (b.stat?.pointsPerGame ?? 0) - (a.stat?.pointsPerGame ?? 0));

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <Link href="/teams" className="text-sm text-muted transition hover:text-foreground">
        &larr; All teams
      </Link>

      <div
        className="mt-4 flex items-center gap-4 border-l-4 pl-4"
        style={{ borderLeftColor: team.primaryColor }}
      >
        <div>
          <p className="text-sm text-muted">
            {team.conference === "EAST" ? "Eastern" : "Western"} Conference &middot; {team.division}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {team.city} {team.name}
          </h1>
        </div>
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">GP</th>
              <th className="px-4 py-3 text-right">MPG</th>
              <th className="px-4 py-3 text-right">PPG</th>
              <th className="px-4 py-3 text-right">RPG</th>
              <th className="px-4 py-3 text-right">APG</th>
              <th className="px-4 py-3 text-right">TS%</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(({ player, stat, rating }) => (
              <tr key={player.id} className="border-t border-border hover:bg-surface/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/players/${player.id}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {player.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{player.position}</td>
                <td className="px-4 py-3 text-right font-mono text-accent">{rating ?? "-"}</td>
                <td className="px-4 py-3 text-right text-muted">{stat?.gamesPlayed ?? "-"}</td>
                <td className="px-4 py-3 text-right text-muted">
                  {stat?.minutesPerGame.toFixed(1) ?? "-"}
                </td>
                <td className="px-4 py-3 text-right text-foreground">
                  {stat?.pointsPerGame.toFixed(1) ?? "-"}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {stat?.reboundsPerGame.toFixed(1) ?? "-"}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {stat?.assistsPerGame.toFixed(1) ?? "-"}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {stat?.trueShootingPct ? `${(stat.trueShootingPct * 100).toFixed(1)}%` : "-"}
                </td>
              </tr>
            ))}
            {roster.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  No players seeded for this team yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
