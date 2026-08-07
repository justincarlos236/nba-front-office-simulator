import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { scoreToCapFraction, computePerformanceScore } from "@/lib/valuation/playerValue";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { PlayerChip } from "@/components/players/PlayerChip";

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
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Free agents</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {freeAgents.length} unsigned players, real 2023-24 stats. Any team can always sign a player
        to a Minimum Contract; bigger offers need Cap Space or a Signing Exception - unless you hold
        that player&apos;s Re-Signing Rights, in which case you can exceed the cap to keep them.
      </p>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3">Value Tier</th>
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
                  <td className="px-4 py-3 font-medium text-foreground">
                    <PlayerChip
                      identity={{ kind: "league", leagueId: league.id, leaguePlayerId: fa.id }}
                      fullName={fa.player.fullName}
                      photoUrl={fa.player.photoUrl}
                      className="align-middle"
                    />
                    {fa.reSigningTeamId === league.userControlledTeamId && (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400 uppercase">
                        Re-Signing Rights
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{fa.player.position}</td>
                  <td className="px-4 py-3 text-right font-mono text-accent">{fa.overallRating}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(fa.overallRating)]}
                  </td>
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
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
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
