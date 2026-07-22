import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlayerChip } from "@/components/players/PlayerChip";
import { ResolveWeekendButton } from "@/components/allstar/ResolveWeekendButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  STARTER: "Starter",
  RESERVE: "Reserve",
  INJURY_REPLACEMENT: "Injury Replacement",
};

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

/** Rising Stars participant rows encode side/MVP as "<captainLeaguePlayerId>[_MVP]" - see generateAllStarWeekend. */
function risingStarsSide(result: string): string | null {
  if (result === "DID_NOT_PLAY") return null;
  return result.replace(/_MVP$/, "");
}

interface SelectionRow {
  id: string;
  leaguePlayerId: string;
  role: string;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  leaguePlayer: {
    player: { fullName: string; photoUrl: string | null };
    leagueTeam: { team: { primaryColor: string } } | null;
  };
}

function RosterColumn({
  leagueId,
  title,
  selections,
}: {
  leagueId: string;
  title: string;
  selections: SelectionRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {(["STARTER", "RESERVE", "INJURY_REPLACEMENT"] as const).map((role) => {
        const players = selections.filter((s) => s.role === role);
        if (players.length === 0) return null;
        return (
          <div key={role} className="mt-3">
            <p className="text-xs tracking-wide text-muted uppercase">{ROLE_LABEL[role]}</p>
            <div className="mt-2 space-y-2">
              {players.map((s) => (
                <div key={s.leaguePlayerId} className="flex items-center justify-between text-sm">
                  <PlayerChip
                    identity={{ kind: "league", leagueId, leaguePlayerId: s.leaguePlayerId }}
                    fullName={s.leaguePlayer.player.fullName}
                    photoUrl={s.leaguePlayer.player.photoUrl}
                    teamPrimaryColor={s.leaguePlayer.leagueTeam?.team.primaryColor}
                    size="sm"
                  />
                  <span className="font-mono text-xs text-muted">
                    {s.pointsPerGame.toFixed(1)}/{s.reboundsPerGame.toFixed(1)}/
                    {s.assistsPerGame.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ParticipantRow {
  id: string;
  leaguePlayerId: string;
  result: string;
  score: number;
  leaguePlayer: { player: { fullName: string; photoUrl: string | null } };
}

function ContestSection({
  leagueId,
  title,
  participants,
}: {
  leagueId: string;
  title: string;
  participants: ParticipantRow[];
}) {
  const champion = participants.find((p) => p.result === "CHAMPION");
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <div className="space-y-2">
          {[...participants]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <PlayerChip
                  identity={{ kind: "league", leagueId, leaguePlayerId: p.leaguePlayerId }}
                  fullName={p.leaguePlayer.player.fullName}
                  photoUrl={p.leaguePlayer.player.photoUrl}
                  size="sm"
                />
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{p.score} pts</span>
                  {p.result === "CHAMPION" && (
                    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                      Champion
                    </span>
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
      {champion && (
        <p className="mt-2 text-sm text-muted">
          Champion: <span className="text-foreground">{champion.leaguePlayer.player.fullName}</span>
        </p>
      )}
    </section>
  );
}

export default async function AllStarWeekendPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const season = seasonParam ? Number(seasonParam) : league.currentSeason;

  const [weekend, snubNews] = await Promise.all([
    prisma.allStarWeekend.findUnique({
      where: { leagueId_season: { leagueId: id, season } },
      include: {
        selections: {
          include: {
            leaguePlayer: { include: { player: true, leagueTeam: { include: { team: true } } } },
          },
        },
        participants: {
          include: { leaguePlayer: { include: { player: true } } },
          orderBy: { seed: "asc" },
        },
        game: { include: { stats: { include: { leaguePlayer: { include: { player: true } } } } } },
      },
    }),
    prisma.leagueTransaction.findMany({
      where: { leagueId: id, season, type: "ALL_STAR_SNUB" },
    }),
  ]);

  if (!weekend) {
    return (
      <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
        <Link
          href={`/leagues/${id}/standings`}
          className="text-sm text-muted hover:text-foreground"
        >
          &larr; Back to standings
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">All-Star Weekend</h1>
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No All-Star Weekend has happened yet in {seasonLabel(season)} - keep simulating toward
            the break.
          </p>
        </div>
      </main>
    );
  }

  const eastSelections = weekend.selections.filter((s) => s.conference === "EAST");
  const westSelections = weekend.selections.filter((s) => s.conference === "WEST");

  const risingStars = weekend.participants.filter((p) => p.eventType === "RISING_STARS");
  const threePoint = weekend.participants.filter((p) => p.eventType === "THREE_POINT_CONTEST");
  const dunk = weekend.participants.filter((p) => p.eventType === "SLAM_DUNK_CONTEST");

  const risingStarsBySide = new Map<string, typeof risingStars>();
  for (const p of risingStars) {
    const side = risingStarsSide(p.result);
    if (!side) continue;
    const list = risingStarsBySide.get(side) ?? [];
    list.push(p);
    risingStarsBySide.set(side, list);
  }
  const risingStarsSides = [...risingStarsBySide.entries()];
  const risingStarsMvp = risingStars.find((p) => p.result.endsWith("_MVP"));

  const game = weekend.game;
  const mvpStat = game?.stats.find((s) => s.leaguePlayerId === game.mvpLeaguePlayerId);

  return (
    <main className="mx-auto max-w-5xl flex-1 px-6 py-16">
      <Link href={`/leagues/${id}/standings`} className="text-sm text-muted hover:text-foreground">
        &larr; Back to standings
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {seasonLabel(season)} All-Star Weekend
        </h1>
        {weekend.status === "PENDING" && <ResolveWeekendButton leagueId={id} />}
      </div>
      {weekend.status === "PENDING" && (
        <p className="mt-2 text-sm text-accent">
          The season is paused here until you continue - explore the weekend below, or jump ahead
          whenever you&apos;re ready.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">All-Star Rosters</h2>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RosterColumn leagueId={id} title="Eastern Conference" selections={eastSelections} />
          <RosterColumn leagueId={id} title="Western Conference" selections={westSelections} />
        </div>
        {snubNews.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <p className="text-xs tracking-wide text-muted uppercase">Notable snubs</p>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {snubNews.map((n) => (
                <p key={n.id}>{n.description}</p>
              ))}
            </div>
          </div>
        )}
      </section>

      {risingStars.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Rising Stars</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {risingStarsSides.map(([side, players]) => (
              <div key={side} className="rounded-xl border border-border bg-surface p-4">
                <div className="space-y-2">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <PlayerChip
                        identity={{
                          kind: "league",
                          leagueId: id,
                          leaguePlayerId: p.leaguePlayerId,
                        }}
                        fullName={p.leaguePlayer.player.fullName}
                        photoUrl={p.leaguePlayer.player.photoUrl}
                        size="sm"
                      />
                      <span className="font-mono text-xs text-muted">{p.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {risingStarsMvp && (
            <p className="mt-3 text-sm text-foreground">
              Rising Stars MVP:{" "}
              <span className="font-semibold">{risingStarsMvp.leaguePlayer.player.fullName}</span>
            </p>
          )}
        </section>
      )}

      {threePoint.length > 0 && (
        <ContestSection leagueId={id} title="Three-Point Contest" participants={threePoint} />
      )}
      {dunk.length > 0 && (
        <ContestSection leagueId={id} title="Slam Dunk Contest" participants={dunk} />
      )}

      {game && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">All-Star Game</h2>
          <div className="mt-4 rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-2xl font-bold text-foreground">
              {game.teamAScore} - {game.teamBScore}
            </p>
            <p className="mt-1 text-sm text-muted">Captains&apos; draft exhibition final</p>
            {mvpStat && (
              <p className="mt-3 text-sm text-foreground">
                MVP: <span className="font-semibold">{mvpStat.leaguePlayer.player.fullName}</span>
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[game.teamACaptainId, game.teamBCaptainId].map((captainId, i) => {
              const sideStats = game.stats.filter((s) => s.side === captainId);
              return (
                <div key={captainId} className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-3 py-2">{i === 0 ? "Team A" : "Team B"}</th>
                        <th className="px-3 py-2 text-right">MIN</th>
                        <th className="px-3 py-2 text-right">PTS</th>
                        <th className="px-3 py-2 text-right">REB</th>
                        <th className="px-3 py-2 text-right">AST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...sideStats]
                        .sort((a, b) => b.points - a.points)
                        .map((s) => (
                          <tr key={s.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <PlayerChip
                                identity={{
                                  kind: "league",
                                  leagueId: id,
                                  leaguePlayerId: s.leaguePlayerId,
                                }}
                                fullName={s.leaguePlayer.player.fullName}
                                photoUrl={s.leaguePlayer.player.photoUrl}
                                size="xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-muted">{s.minutesPlayed}</td>
                            <td className="px-3 py-2 text-right font-mono text-foreground">
                              {s.points}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted">
                              {s.rebounds}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted">
                              {s.assists}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
