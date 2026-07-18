import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { formatCentsCompact } from "@/lib/money";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function LeagueDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });

  // Authz: 404 instead of 403 so a non-owner can't even tell the league exists.
  if (!league || league.ownerId !== session.user.id) notFound();

  const userLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!userLeagueTeam) notFound();

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: userLeagueTeam.id },
    include: {
      player: true,
      contract: { include: { years: { where: { season: league.currentSeason } } } },
    },
    orderBy: { overallRating: "desc" },
  });

  const capSheet = computeCapSheet({
    season: league.currentSeason,
    contracts: leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({
        playerId: lp.playerId,
        salaryCents: lp.contract!.years[0].salaryCents,
      })),
  });

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <div
        className="flex items-center justify-between gap-4 border-l-4 pl-4"
        style={{ borderLeftColor: userLeagueTeam.team.primaryColor }}
      >
        <div>
          <p className="text-sm text-muted">
            {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} season
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {userLeagueTeam.team.city} {userLeagueTeam.team.name}
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/leagues/${league.id}/free-agents`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Free agents
          </Link>
          <Link
            href={`/leagues/${league.id}/trades/new`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Propose a trade
          </Link>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CapStat
          label="Committed salary"
          value={formatCentsCompact(capSheet.committedSalaryCents)}
        />
        <CapStat label="Cap space" value={formatCentsCompact(capSheet.capSpaceCents)} />
        <CapStat label="Apron status" value={capSheet.apronLevel.replaceAll("_", " ")} />
        <CapStat label="Roster size" value={String(leaguePlayers.length)} />
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">Potential</th>
              <th className="px-4 py-3 text-right">Salary ({league.currentSeason})</th>
              <th className="px-4 py-3 text-right">Contract thru</th>
            </tr>
          </thead>
          <tbody>
            {leaguePlayers.map((lp) => (
              <tr key={lp.id} className="border-t border-border hover:bg-surface/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/players/${lp.playerId}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {lp.player.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{lp.player.position}</td>
                <td className="px-4 py-3 text-right font-mono text-accent">{lp.overallRating}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{lp.potentialRating}</td>
                <td className="px-4 py-3 text-right text-foreground">
                  {lp.contract?.years[0]
                    ? formatCentsCompact(lp.contract.years[0].salaryCents)
                    : "-"}
                </td>
                <td className="px-4 py-3 text-right text-muted">{lp.contract?.endSeason ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function CapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg text-foreground capitalize">{value}</p>
    </div>
  );
}
