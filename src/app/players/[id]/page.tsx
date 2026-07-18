import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { computePerformanceScore, scoreToCapFraction } from "@/lib/valuation/playerValue";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerDetailPage({ params }: PageProps) {
  const { id } = await params;

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      currentTeam: true,
      seasonStats: { where: { season: 2023 } },
    },
  });

  if (!player) notFound();

  const stat = player.seasonStats[0];
  const rules = getSeasonCapRules(2023);
  const performanceScore = stat
    ? computePerformanceScore({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 })
    : null;
  const estimatedMarketValueCents =
    performanceScore !== null
      ? BigInt(Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(performanceScore)))
      : null;

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      {player.currentTeam ? (
        <Link
          href={`/teams/${player.currentTeam.abbreviation}`}
          className="text-sm text-muted transition hover:text-foreground"
        >
          &larr; {player.currentTeam.city} {player.currentTeam.name}
        </Link>
      ) : (
        <Link href="/teams" className="text-sm text-muted transition hover:text-foreground">
          &larr; All teams
        </Link>
      )}

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">{player.fullName}</h1>
      <p className="mt-1 text-muted">
        {player.position}
        {player.heightInches
          ? ` · ${Math.floor(player.heightInches / 12)}'${player.heightInches % 12}"`
          : ""}
        {player.weightLbs ? ` · ${player.weightLbs} lbs` : ""}
        {player.draftYear ? ` · Drafted ${player.draftYear}` : ""}
      </p>

      {stat ? (
        <>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="PPG" value={stat.pointsPerGame.toFixed(1)} />
            <Stat label="RPG" value={stat.reboundsPerGame.toFixed(1)} />
            <Stat label="APG" value={stat.assistsPerGame.toFixed(1)} />
            <Stat
              label="TS%"
              value={stat.trueShootingPct ? `${(stat.trueShootingPct * 100).toFixed(1)}%` : "-"}
            />
          </div>

          <div className="mt-8 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-semibold text-foreground">Valuation model output</h2>
            <p className="mt-1 text-sm text-muted">
              Computed live from this real 2023-24 statline by the same engine that grades trades.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label="Performance score" value={`${performanceScore?.toFixed(1)} / 100`} />
              <Stat
                label="Est. market value (2023-24 cap)"
                value={
                  estimatedMarketValueCents ? formatCentsCompact(estimatedMarketValueCents) : "-"
                }
              />
            </div>
            <p className="mt-4 text-xs text-muted">
              Not age-adjusted here (real birth dates aren&apos;t available from the free bio API) -
              a league save applies the full age curve when generating a contract.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-10 text-muted">No 2023-24 season stats on record for this player.</p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg text-foreground">{value}</p>
    </div>
  );
}
