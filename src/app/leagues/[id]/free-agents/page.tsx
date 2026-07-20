import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { scoreToCapFraction, computePerformanceScore } from "@/lib/valuation/playerValue";
import { getSeasonCapRules } from "@/lib/cap/constants";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FreeAgentsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const freeAgents = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, leagueTeamId: null, isActive: true },
    include: {
      player: { include: { seasonStats: { where: { season: league.currentSeason } } } },
    },
    orderBy: { overallRating: "desc" },
  });

  const rules = getSeasonCapRules(league.currentSeason);

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
        &larr; Back to your team
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Free agents</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {freeAgents.length} unsigned players, real 2023-24 stats. Any team can always sign a player
        to a veteran-minimum deal; bigger offers are gated by your cap space or mid-level exception,
        checked live against the same cap engine as everything else.
      </p>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">PPG</th>
              <th className="px-4 py-3 text-right">Est. value</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {freeAgents.map((fa) => {
              const stat = fa.player.seasonStats[0];
              const estimatedValueCents = stat
                ? BigInt(
                    Math.round(
                      Number(rules.salaryCapCents) *
                        scoreToCapFraction(
                          computePerformanceScore({
                            ...stat,
                            trueShootingPct: stat.trueShootingPct ?? 0.56,
                          }),
                        ),
                    ),
                  )
                : null;
              return (
                <tr key={fa.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3 font-medium text-foreground">{fa.player.fullName}</td>
                  <td className="px-4 py-3 text-muted">{fa.player.position}</td>
                  <td className="px-4 py-3 text-right font-mono text-accent">{fa.overallRating}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {stat?.pointsPerGame.toFixed(1) ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {estimatedValueCents ? formatCentsCompact(estimatedValueCents) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/leagues/${league.id}/free-agents/${fa.id}`}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
                    >
                      Offer contract
                    </Link>
                  </td>
                </tr>
              );
            })}
            {freeAgents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No free agents available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
