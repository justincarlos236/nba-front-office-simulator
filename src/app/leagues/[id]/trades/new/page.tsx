import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { ApronLevel } from "@/lib/cap/apron";
import { prisma } from "@/lib/prisma";
import { TradeBuilder } from "@/components/trades/TradeBuilder";
import {
  tradesAreClosed,
  tradeDeadlineDayIndex,
  dayIndexToDate,
} from "@/lib/calendar/seasonCalendar";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds, TEAM_NEED_LABEL } from "@/lib/gm/teamNeeds";
import { formatCentsCompact } from "@/lib/money";
import { DataTable, Label, Td, Th } from "@/components/ui/primitives";
import { resolvePlayerAge } from "@/lib/players/age";

/** Short enough for a table cell; the full phrasing lives on the cap page. */
const APRON_LABEL: Record<ApronLevel, string> = {
  [ApronLevel.UNDER_CAP]: "Under cap",
  [ApronLevel.BETWEEN_CAP_AND_TAX]: "Over cap",
  [ApronLevel.TAXPAYER]: "Luxury tax",
  [ApronLevel.FIRST_APRON]: "1st apron",
  [ApronLevel.SECOND_APRON]: "2nd apron",
};

/** Only the aprons are a warning - being over the cap is the norm. */
const APRON_TONE: Record<ApronLevel, "positive" | "muted" | "caution"> = {
  [ApronLevel.UNDER_CAP]: "positive",
  [ApronLevel.BETWEEN_CAP_AND_TAX]: "muted",
  [ApronLevel.TAXPAYER]: "muted",
  [ApronLevel.FIRST_APRON]: "caution",
  [ApronLevel.SECOND_APRON]: "caution",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}

async function loadRoster(leagueTeamId: string, season: number) {
  const [leaguePlayers, sponsorshipClausePlayers] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId },
      include: {
        player: true,
        contract: { include: { years: { where: { season } } } },
      },
      orderBy: { overallRating: "desc" },
    }),
    // Finances as a Gameplay Pillar (Phase 2) - which of this team's
    // players currently hold a "star clause" on an active sponsorship
    // deal, for the trade builder's non-blocking warning. Only ever
    // non-empty for the user's own team.
    prisma.sponsorshipDeal.findMany({
      where: { leagueTeamId, status: "ACTIVE", conditionLeaguePlayerId: { not: null } },
      select: { conditionLeaguePlayerId: true },
    }),
  ]);
  const clausePlayerIds = new Set(sponsorshipClausePlayers.map((d) => d.conditionLeaguePlayerId));

  const capSheet = computeCapSheet({
    season,
    contracts: leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });

  const players = leaguePlayers
    .filter((lp) => lp.contract?.years[0])
    .map((lp) => ({
      leaguePlayerId: lp.id,
      fullName: lp.player.fullName,
      photoUrl: lp.player.photoUrl,
      position: lp.player.position,
      overallRating: lp.overallRating,
      potentialRating: lp.potentialRating,
      age: resolvePlayerAge(lp.player, season),
      salaryCents: lp.contract!.years[0].salaryCents.toString(),
      noTradeClause: lp.contract!.noTradeClause,
      injuryStatus: lp.injuryStatus,
      careerGamesMissedToInjury: lp.careerGamesMissedToInjury,
      hasSponsorshipClause: clausePlayerIds.has(lp.id),
    }));

  // Team identity/needs (Phase 11b/11c) - active roster, not just the
  // subset with a valid current-season contract the trade UI itself uses.
  const activeRoster = leaguePlayers.filter((lp) => lp.isActive);
  const avgAge =
    activeRoster.length > 0
      ? activeRoster.reduce((sum, lp) => sum + resolvePlayerAge(lp.player, season), 0) /
        activeRoster.length
      : 27;
  const needs = computeTeamNeeds(
    activeRoster.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
  );

  return { players, capSheet, avgAge, needs };
}

/** Every pick this team currently owns and hasn't used yet - tradeable regardless of whether that season's own draft has happened. */
async function loadTradeablePicks(leagueTeamId: string) {
  const picks = await prisma.draftPick.findMany({
    where: { currentOwnerId: leagueTeamId, selectedProspectId: null },
    orderBy: [{ season: "asc" }, { round: "asc" }],
  });
  return picks;
}

/**
 * Future seasons this team currently owns its OWN round-1 pick for - the
 * Stepien-rule input `validateTrade` needs. Deliberately scoped to the
 * team's own original pick (not others it holds via trade), since the rule
 * is about not leaving a team without a first-rounder of its own in
 * back-to-back years.
 */
async function loadOwnedFutureFirstRoundSeasons(leagueTeamId: string, currentSeason: number) {
  const picks = await prisma.draftPick.findMany({
    where: {
      originalTeamId: leagueTeamId,
      currentOwnerId: leagueTeamId,
      round: 1,
      selectedProspectId: null,
      season: { gte: currentSeason },
    },
    select: { season: true },
  });
  return picks.map((p) => p.season);
}

export default async function NewTradePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { with: otherLeagueTeamId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        include: { team: true },
        // Postgres doesn't guarantee row order without an explicit
        // orderBy - this list is directly user-visible, so it needs a
        // deterministic order rather than incidental physical row order.
        orderBy: [
          { team: { conference: "asc" } },
          { team: { division: "asc" } },
          { team: { city: "asc" } },
        ],
      },
    },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!myLeagueTeam) notFound();

  if (!otherLeagueTeamId) {
    const otherTeams = league.teams.filter((lt) => lt.id !== myLeagueTeam.id);

    // THE WIRE - Ledger. The audit found this as 29 identical cards showing
    // only a division label: no cap space, no needs, no sense of who might
    // want what you have. Finding a plausible partner was trial and error at
    // two clicks per attempt. Every figure below already existed; none of it
    // was being shown.
    const rosters = await prisma.leaguePlayer.findMany({
      where: {
        leagueTeamId: { in: otherTeams.map((lt) => lt.id) },
        isActive: true,
      },
      include: {
        player: { select: { position: true } },
        contract: { include: { years: { where: { season: league.currentSeason } } } },
      },
    });

    const byTeam = new Map<string, typeof rosters>();
    for (const lp of rosters) {
      if (!lp.leagueTeamId) continue;
      const list = byTeam.get(lp.leagueTeamId) ?? [];
      list.push(lp);
      byTeam.set(lp.leagueTeamId, list);
    }

    const partners = otherTeams.map((lt) => {
      const roster = byTeam.get(lt.id) ?? [];
      const capSheet = computeCapSheet({
        season: league.currentSeason,
        contracts: roster
          .filter((lp) => lp.contract?.years[0])
          .map((lp) => ({
            playerId: lp.playerId,
            salaryCents: lp.contract!.years[0].salaryCents,
          })),
      });
      return {
        id: lt.id,
        label: `${lt.team.city} ${lt.team.name}`,
        conference: lt.team.conference,
        record: `${lt.wins}-${lt.losses}`,
        // "Cap space" alone read $0 for 27 of 30 teams, because `capSpaceCents`
        // is floored at zero once a team is over the cap - which most are, here
        // as in the real NBA. Payroll and apron status are what actually govern
        // what a deal with this team can look like.
        payroll: formatCentsCompact(capSheet.totalSalaryCents),
        capSpace: capSheet.capSpaceCents > 0n ? formatCentsCompact(capSheet.capSpaceCents) : null,
        hasSpace: capSheet.capSpaceCents > 0n,
        apronLabel: APRON_LABEL[capSheet.apronLevel],
        apronTone: APRON_TONE[capSheet.apronLevel],
        // Room before the first apron is the real constraint on aggregating
        // salary; below it a team can still absorb, above it the rules bite.
        roomToFirstApron:
          capSheet.distanceToFirstApronCents > 0n
            ? formatCentsCompact(capSheet.distanceToFirstApronCents)
            : null,
        rosterCount: roster.length,
        needs: computeTeamNeeds(
          roster.map((lp) => ({
            position: lp.player.position,
            overallRating: lp.overallRating,
          })),
        )
          .slice(0, 2)
          .map((n) => TEAM_NEED_LABEL[n]),
      };
    });

    return (
      <main className="mx-auto max-w-350 flex-1 px-6 pt-12 pb-24 sm:px-8">
        <div className="border-b border-rule-strong pb-6">
          <Label tone="accent">Work the phones</Label>
          <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
            Who are you calling?
          </h1>
          <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-ink-muted">
            Every team&apos;s cap position and what their roster is thin at. A team with space can
            absorb salary; a team with a need may pay above value to fill it.
          </p>
        </div>

        <DataTable className="mt-8">
          <thead>
            <tr>
              <Th>Team</Th>
              <Th>Conf</Th>
              <Th numeric>Record</Th>
              <Th numeric>Payroll</Th>
              <Th>Standing</Th>
              <Th numeric>Room to 1st apron</Th>
              <Th numeric>Roster</Th>
              <Th>Looking for</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-raised">
                <Td className="font-semibold text-ink">{p.label}</Td>
                <Td className="text-ink-muted">{p.conference === "EAST" ? "East" : "West"}</Td>
                <Td numeric className="text-ink-muted">
                  {p.record}
                </Td>
                <Td numeric className="text-ink">
                  {p.payroll}
                </Td>
                <Td
                  className={
                    p.apronTone === "positive"
                      ? "text-positive"
                      : p.apronTone === "caution"
                        ? "text-caution"
                        : "text-ink-muted"
                  }
                >
                  {p.apronLabel}
                  {p.capSpace && <span className="text-ink-muted"> · {p.capSpace} space</span>}
                </Td>
                <Td numeric className="text-ink-muted">
                  {p.roomToFirstApron ?? "—"}
                </Td>
                <Td numeric className="text-ink-muted">
                  {p.rosterCount}
                </Td>
                <Td className="text-[15px] text-ink-muted">
                  {p.needs.length > 0 ? p.needs.join(", ") : "Nothing obvious"}
                </Td>
                <Td numeric>
                  <Link
                    href={`/leagues/${league.id}/trades/new?with=${p.id}`}
                    className="inline-flex rounded-[2px] border border-rule px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition-colors duration-120 hover:bg-raised"
                  >
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </main>
    );
  }

  const otherLeagueTeam = league.teams.find((lt) => lt.id === otherLeagueTeamId);
  if (!otherLeagueTeam) notFound();

  const teamLabelById = new Map(
    league.teams.map((lt) => [lt.id, `${lt.team.city} ${lt.team.name}`]),
  );

  const [
    mine,
    theirs,
    minePicks,
    theirPicks,
    mineOwnedFirstRoundSeasons,
    theirOwnedFirstRoundSeasons,
    competitivenessPercentiles,
    seasonGames,
  ] = await Promise.all([
    loadRoster(myLeagueTeam.id, league.currentSeason),
    loadRoster(otherLeagueTeam.id, league.currentSeason),
    loadTradeablePicks(myLeagueTeam.id),
    loadTradeablePicks(otherLeagueTeam.id),
    loadOwnedFutureFirstRoundSeasons(myLeagueTeam.id, league.currentSeason),
    loadOwnedFutureFirstRoundSeasons(otherLeagueTeam.id, league.currentSeason),
    computeCompetitivenessPercentiles(league.teams),
    prisma.game.findMany({
      where: { leagueId: league.id, season: league.currentSeason, type: "REGULAR_SEASON" },
      select: { dayIndex: true, playedAt: true },
    }),
  ]);

  const deadlinePassed = tradesAreClosed(league.currentSeason, seasonGames);
  const deadlineDate = dayIndexToDate(
    league.currentSeason,
    tradeDeadlineDayIndex(league.currentSeason),
  ).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const myIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(myLeagueTeam.id) ?? 0.5,
    mine.avgAge,
  );
  const theirIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(otherLeagueTeam.id) ?? 0.5,
    theirs.avgAge,
  );

  const toPickDTO = (picks: Awaited<ReturnType<typeof loadTradeablePicks>>) =>
    picks.map((p) => ({
      draftPickId: p.id,
      season: p.season,
      round: p.round,
      overallPickNumber: p.overallPickNumber,
      originalTeamCompetitivenessPercentile:
        competitivenessPercentiles.get(p.originalTeamId) ?? 0.5,
      originalTeamLabel:
        p.originalTeamId === p.currentOwnerId
          ? null
          : (teamLabelById.get(p.originalTeamId) ?? null),
    }));

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link
        href={`/leagues/${league.id}/trades/new`}
        className="text-sm text-ink-muted hover:text-ink"
      >
        &larr; Choose a different team
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">
        {myLeagueTeam.team.name} &harr; {otherLeagueTeam.team.name}
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Select players and draft picks on each side - every offer is checked live, in plain
        language, against real salary-matching, no-trade, and draft-pick rules. You&apos;ll always
        see why a trade is legal or not, never a raw rulebook.{" "}
        <HowDoesThisWork topic="trades" className="underline hover:text-ink" />
      </p>

      {deadlinePassed && (
        // Said before a deal is built, not after. The server refuses either
        // way, but discovering a hard date only at the confirm step means
        // assembling a whole trade for nothing.
        <div className="mt-8 rounded-[2px] border border-caution/40 bg-caution/5 p-4">
          <p className="text-sm font-semibold text-ink">The trade deadline has passed.</p>
          <p className="mt-1 text-sm text-ink-muted">
            It was {deadlineDate}. Nothing can be traded until the regular season ends - simulate
            to the playoffs and the market reopens.
          </p>
        </div>
      )}

      <div className="mt-10">
        <TradeBuilder
          deadlinePassed={deadlinePassed}
          season={league.currentSeason}
          leagueId={league.id}
          myTeam={{
            leagueTeamId: myLeagueTeam.id,
            name: `${myLeagueTeam.team.city} ${myLeagueTeam.team.name}`,
            primaryColor: myLeagueTeam.team.primaryColor,
            apronLevel: mine.capSheet.apronLevel,
            capSpaceCents: mine.capSheet.capSpaceCents.toString(),
            players: mine.players,
            picks: toPickDTO(minePicks),
            ownedFutureFirstRoundPickSeasons: mineOwnedFirstRoundSeasons,
            identity: myIdentity,
            needs: mine.needs,
            personality: myLeagueTeam.gmPersonality,
            roster: mine.players.map((p) => ({ overallRating: p.overallRating, age: p.age })),
            analyticsLevel: myLeagueTeam.analyticsLevel,
          }}
          theirTeam={{
            leagueTeamId: otherLeagueTeam.id,
            name: `${otherLeagueTeam.team.city} ${otherLeagueTeam.team.name}`,
            primaryColor: otherLeagueTeam.team.primaryColor,
            apronLevel: theirs.capSheet.apronLevel,
            capSpaceCents: theirs.capSheet.capSpaceCents.toString(),
            players: theirs.players,
            picks: toPickDTO(theirPicks),
            ownedFutureFirstRoundPickSeasons: theirOwnedFirstRoundSeasons,
            identity: theirIdentity,
            needs: theirs.needs,
            personality: otherLeagueTeam.gmPersonality,
            roster: theirs.players.map((p) => ({ overallRating: p.overallRating, age: p.age })),
          }}
        />
      </div>
    </main>
  );
}
