import { TeamLogo } from "@/components/teams/TeamLogo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolvePlayerAge } from "@/lib/players/age";
import { detectNotableMovement } from "@/lib/draft/lotteryPresentation";
import { PlayerChip } from "@/components/players/PlayerChip";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { BannerRafters } from "@/components/history/BannerRafters";
import { TrophyCabinet } from "@/components/history/TrophyCabinet";
import { MemoryTimeline } from "@/components/history/MemoryTimeline";
import { curateFranchiseMemory } from "@/lib/fans/franchiseMemory";
import { Label } from "@/components/ui/primitives";

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
  DEFENSIVE_PLAYER_OF_THE_YEAR: "Defensive Player of the Year",
  SIXTH_MAN_OF_THE_YEAR: "Sixth Man of the Year",
};

const STAFF_AWARD_LABELS: Record<string, string> = {
  COACH_OF_THE_YEAR: "Coach of the Year",
};

export default async function HistoryPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  // The rafters and the cabinet are *this franchise's*, not the league's -
  // the league-wide lists below already cover everyone else.
  const userLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);

  const [
    champions,
    awards,
    staffAwards,
    retirees,
    allStarWeekends,
    lotteryResults,
    memoryCandidates,
  ] = await Promise.all([
    prisma.playoffSeries.findMany({
      where: { leagueId: id, round: 4, winnerTeamId: { not: null } },
      include: { winnerTeam: { include: { team: true } } },
      orderBy: { season: "desc" },
    }),
    prisma.seasonAward.findMany({
      where: { leagueId: id },
      include: { leaguePlayer: { include: { player: true } } },
    }),
    prisma.staffAward.findMany({
      where: { leagueId: id },
      include: { staff: true },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId: id, retiredSeason: { not: null } },
      include: { player: true },
    }),
    prisma.allStarWeekend.findMany({
      where: { leagueId: id, status: "RESOLVED" },
      include: {
        game: true,
        participants: {
          where: { OR: [{ result: "CHAMPION" }, { result: { contains: "MVP" } }] },
        },
      },
      orderBy: { season: "desc" },
    }),
    prisma.lotteryResult.findMany({
      where: { leagueId: id },
      include: {
        currentOwner: { include: { team: true } },
        originalTeam: { include: { team: true } },
      },
      orderBy: [{ season: "desc" }, { resultPickNumber: "asc" }],
    }),
    // Candidates for the franchise-memory timeline. curateFranchiseMemory
    // applies its own allowlist and weighting; this only narrows to rows
    // involving the user's own team so a rival's blockbuster never lands in
    // this franchise's permanent record.
    league.userControlledTeamId
      ? prisma.leagueTransaction.findMany({
          where: {
            leagueId: id,
            importance: { in: ["MAJOR", "BREAKING"] },
            teamIds: { has: league.userControlledTeamId },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const allStarPlayerIds = new Set<string>();
  for (const w of allStarWeekends) {
    if (w.game) {
      allStarPlayerIds.add(w.game.teamACaptainId);
      allStarPlayerIds.add(w.game.teamBCaptainId);
      allStarPlayerIds.add(w.game.mvpLeaguePlayerId);
    }
    for (const p of w.participants) allStarPlayerIds.add(p.leaguePlayerId);
  }
  const allStarPlayers = await prisma.leaguePlayer.findMany({
    where: { id: { in: [...allStarPlayerIds] } },
    include: { player: true },
  });
  const allStarPlayerById = new Map(allStarPlayers.map((p) => [p.id, p]));

  const awardsBySeason = new Map<number, typeof awards>();
  for (const award of awards) {
    const list = awardsBySeason.get(award.season) ?? [];
    list.push(award);
    awardsBySeason.set(award.season, list);
  }
  const staffAwardsBySeason = new Map<number, typeof staffAwards>();
  for (const award of staffAwards) {
    const list = staffAwardsBySeason.get(award.season) ?? [];
    list.push(award);
    staffAwardsBySeason.set(award.season, list);
  }
  const retireesBySeason = new Map<number, typeof retirees>();
  for (const r of retirees) {
    const list = retireesBySeason.get(r.retiredSeason!) ?? [];
    list.push(r);
    retireesBySeason.set(r.retiredSeason!, list);
  }
  const allStarBySeason = new Map<number, (typeof allStarWeekends)[number]>();
  for (const w of allStarWeekends) allStarBySeason.set(w.season, w);
  const lotteryBySeason = new Map<number, typeof lotteryResults>();
  for (const r of lotteryResults) {
    const list = lotteryBySeason.get(r.season) ?? [];
    list.push(r);
    lotteryBySeason.set(r.season, list);
  }

  const EVENT_LABEL: Record<string, string> = {
    RISING_STARS: "Rising Stars MVP",
    THREE_POINT_CONTEST: "Three-Point Contest Champion",
    SLAM_DUNK_CONTEST: "Slam Dunk Contest Champion",
  };

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">League History</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Champions, award winners, and retirees from every completed season in this franchise.
      </p>

      {/* YOUR BUILDING. What this franchise has won, before the league-wide
          record below. Rafters render even when empty - a ceiling with nothing
          hanging is a fact about the franchise, and the motivation. */}
      {userLeagueTeam && (
        <>
          <BannerRafters
            className="mt-12"
            primaryColor={userLeagueTeam.team.primaryColor}
            secondaryColor={userLeagueTeam.team.secondaryColor}
            banners={champions.map((c) => ({
              season: c.season,
              teamLabel: c.winnerTeam ? `${c.winnerTeam.team.city} ${c.winnerTeam.team.name}` : "",
              isUserTeam: c.winnerTeamId === userLeagueTeam.id,
            }))}
          />

          <TrophyCabinet
            className="mt-16"
            awards={awards
              .filter((a) => a.leaguePlayer.leagueTeamId === userLeagueTeam.id)
              .map((a) => ({
                season: a.season,
                category: a.category,
                playerName: a.leaguePlayer.player.fullName,
              }))}
          />

          <MemoryTimeline
            className="mt-16"
            entries={curateFranchiseMemory(
              memoryCandidates.map((t) => ({
                id: t.id,
                season: t.season,
                type: t.type,
                description: t.description,
                importance: t.importance as "MINOR" | "STANDARD" | "MAJOR" | "BREAKING",
              })),
            )}
          />

          <div className="mt-16 border-t border-rule-strong pt-3">
            <Label tone="ink">Around the league</Label>
          </div>
        </>
      )}

      {champions.length === 0 ? (
        <div className="mt-10 rounded-[2px] border border-rule bg-field p-8 text-center">
          <p className="text-ink-muted">
            No season has been completed yet - crown a champion and advance to the offseason to
            start building history.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {champions.map((series) => {
            const season = series.season;
            const seasonAwards = awardsBySeason.get(season) ?? [];
            const seasonStaffAwards = staffAwardsBySeason.get(season) ?? [];
            const seasonRetirees = retireesBySeason.get(season) ?? [];
            const seasonAllStar = allStarBySeason.get(season);
            const seasonLottery = lotteryBySeason.get(season) ?? [];
            const { biggestJump, biggestFall } = detectNotableMovement(seasonLottery);
            const lotteryWinner = seasonLottery.find((r) => r.resultPickNumber === 1);
            return (
              <section key={series.id} className="rounded-[2px] border border-rule bg-field p-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-ink">{seasonLabel(season)}</h2>
                  <div className="flex items-center gap-2">
                    {series.winnerTeam?.team.logoUrl && (
                      <TeamLogo logoUrl={series.winnerTeam.team.logoUrl} size={24} />
                    )}
                    <p className="text-sm font-medium text-team-accent">
                      {series.winnerTeam
                        ? `${series.winnerTeam.team.city} ${series.winnerTeam.team.name}`
                        : "Unknown"}{" "}
                      <span className="text-ink-muted">- NBA Champions</span>
                    </p>
                  </div>
                </div>

                {(seasonAwards.length > 0 || seasonStaffAwards.length > 0) && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {seasonAwards.map((award) => (
                      <div key={award.id} className="rounded-[2px] border border-rule p-3 text-sm">
                        <p className="text-xs tracking-wide text-ink-muted uppercase">
                          {AWARD_LABELS[award.category] ?? award.category}
                        </p>
                        <p className="mt-1 font-semibold text-ink">
                          <PlayerChip
                            identity={{
                              kind: "league",
                              leagueId: league.id,
                              leaguePlayerId: award.leaguePlayerId,
                            }}
                            fullName={award.leaguePlayer.player.fullName}
                            photoUrl={award.leaguePlayer.player.photoUrl}
                          />
                        </p>
                      </div>
                    ))}
                    {seasonStaffAwards.map((award) => (
                      <div key={award.id} className="rounded-[2px] border border-rule p-3 text-sm">
                        <p className="text-xs tracking-wide text-ink-muted uppercase">
                          {STAFF_AWARD_LABELS[award.category] ?? award.category}
                        </p>
                        <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
                          <PlayerAvatar photoUrl={null} fullName={award.staff.fullName} size="xs" />
                          {award.staff.fullName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {seasonRetirees.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs tracking-wide text-ink-muted uppercase">
                      Retired this offseason
                    </p>
                    <div className="mt-2 space-y-1">
                      {seasonRetirees.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">
                            <PlayerChip
                              identity={{
                                kind: "league",
                                leagueId: league.id,
                                leaguePlayerId: r.id,
                              }}
                              fullName={r.player.fullName}
                              photoUrl={r.player.photoUrl}
                              size="xs"
                            />
                          </span>
                          <span className="text-ink-muted">
                            Retired at {resolvePlayerAge(r.player, season + 1)} &middot; final
                            rating {r.overallRating}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {seasonAllStar && (
                  <div className="mt-4 rounded-[2px] border border-rule/30 bg-raised p-3">
                    <p className="text-xs tracking-wide text-ink-muted uppercase">
                      All-Star Weekend
                    </p>
                    <div className="mt-2 space-y-1 text-sm">
                      {seasonAllStar.game && (
                        <p className="text-ink">
                          {allStarPlayerById.get(seasonAllStar.game.teamACaptainId)?.player
                            .fullName ?? "Team A"}{" "}
                          {seasonAllStar.game.teamAScore} &ndash; {seasonAllStar.game.teamBScore}{" "}
                          {allStarPlayerById.get(seasonAllStar.game.teamBCaptainId)?.player
                            .fullName ?? "Team B"}
                          <span className="ml-2 text-ink-muted">
                            MVP:{" "}
                            {allStarPlayerById.get(seasonAllStar.game.mvpLeaguePlayerId)?.player
                              .fullName ?? "Unknown"}
                          </span>
                        </p>
                      )}
                      {seasonAllStar.participants.map((p) => (
                        <p key={p.id} className="text-ink-muted">
                          {EVENT_LABEL[p.eventType] ?? p.eventType}:{" "}
                          <span className="text-ink">
                            {allStarPlayerById.get(p.leaguePlayerId)?.player.fullName ?? "Unknown"}
                          </span>
                        </p>
                      ))}
                    </div>
                    <Link
                      href={`/leagues/${league.id}/all-star?season=${season}`}
                      className="mt-2 inline-block text-xs text-team-accent hover:underline"
                    >
                      View full weekend &rarr;
                    </Link>
                  </div>
                )}

                {lotteryWinner && (
                  <div className="mt-4 rounded-[2px] border border-team-accent/30 bg-team-accent/5 p-3">
                    <p className="text-xs tracking-wide text-ink-muted uppercase">Draft Lottery</p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {lotteryWinner.currentOwner.team.logoUrl && (
                        <TeamLogo logoUrl={lotteryWinner.currentOwner.team.logoUrl} size={20} />
                      )}
                      <p className="text-ink">
                        <span className="font-semibold">
                          {lotteryWinner.currentOwner.team.city}{" "}
                          {lotteryWinner.currentOwner.team.name}
                        </span>{" "}
                        <span className="text-ink-muted">
                          won the No. 1 pick (
                          {(lotteryWinner.oddsForNumberOnePickPct * 100).toFixed(1)}% odds)
                        </span>
                      </p>
                    </div>
                    {biggestJump && (
                      <p className="mt-1 text-xs text-positive">
                        {biggestJump.team.currentOwner.team.city}{" "}
                        {biggestJump.team.currentOwner.team.name} jumped from a projected No.{" "}
                        {biggestJump.team.projectedSeed} to No. {biggestJump.team.resultPickNumber}
                      </p>
                    )}
                    {biggestFall && (
                      <p className="mt-1 text-xs text-negative">
                        {biggestFall.team.currentOwner.team.city}{" "}
                        {biggestFall.team.currentOwner.team.name} fell from a projected No.{" "}
                        {biggestFall.team.projectedSeed} to No. {biggestFall.team.resultPickNumber}
                      </p>
                    )}
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
