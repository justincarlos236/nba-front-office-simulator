import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { estimateAge } from "@/lib/players/age";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

const AWARD_LABELS: Record<string, string> = {
  MVP: "Most Valuable Player",
  ROOKIE_OF_THE_YEAR: "Rookie of the Year",
  MOST_IMPROVED_PLAYER: "Most Improved Player",
};

export default async function HistoryPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const [champions, awards, retirees] = await Promise.all([
    prisma.playoffSeries.findMany({
      where: { leagueId: id, round: 4, winnerTeamId: { not: null } },
      include: { winnerTeam: { include: { team: true } } },
      orderBy: { season: "desc" },
    }),
    prisma.seasonAward.findMany({
      where: { leagueId: id },
      include: { leaguePlayer: { include: { player: true } } },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId: id, retiredSeason: { not: null } },
      include: { player: true },
    }),
  ]);

  const awardsBySeason = new Map<number, typeof awards>();
  for (const award of awards) {
    const list = awardsBySeason.get(award.season) ?? [];
    list.push(award);
    awardsBySeason.set(award.season, list);
  }
  const retireesBySeason = new Map<number, typeof retirees>();
  for (const r of retirees) {
    const list = retireesBySeason.get(r.retiredSeason!) ?? [];
    list.push(r);
    retireesBySeason.set(r.retiredSeason!, list);
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
            &larr; Back to team
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">League History</h1>
        </div>
        <Link
          href={`/leagues/${league.id}/transactions`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          Transactions
        </Link>
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Champions, award winners, and retirees from every completed season in this franchise.
      </p>

      {champions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No season has been completed yet - crown a champion and advance to the offseason to
            start building history.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {champions.map((series) => {
            const season = series.season;
            const seasonAwards = awardsBySeason.get(season) ?? [];
            const seasonRetirees = retireesBySeason.get(season) ?? [];
            return (
              <section key={series.id} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-foreground">{seasonLabel(season)}</h2>
                  <div className="flex items-center gap-2">
                    {series.winnerTeam?.team.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={series.winnerTeam.team.logoUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="shrink-0"
                      />
                    )}
                    <p className="text-sm font-medium text-accent">
                      {series.winnerTeam
                        ? `${series.winnerTeam.team.city} ${series.winnerTeam.team.name}`
                        : "Unknown"}{" "}
                      <span className="text-muted">- NBA Champions</span>
                    </p>
                  </div>
                </div>

                {seasonAwards.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {seasonAwards.map((award) => (
                      <div key={award.id} className="rounded-lg border border-border p-3 text-sm">
                        <p className="text-xs tracking-wide text-muted uppercase">
                          {AWARD_LABELS[award.category] ?? award.category}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {award.leaguePlayer.player.fullName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {seasonRetirees.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs tracking-wide text-muted uppercase">
                      Retired this offseason
                    </p>
                    <div className="mt-2 space-y-1">
                      {seasonRetirees.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{r.player.fullName}</span>
                          <span className="text-muted">
                            Retired at {estimateAge(r.player.draftYear, season + 1)} &middot; final
                            rating {r.overallRating}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
