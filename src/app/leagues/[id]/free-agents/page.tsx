import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { computePerformanceScore } from "@/lib/valuation/playerValue";
import { loadInSimPerformance } from "@/lib/valuation/inSimPerformance";
import { contractQualityScore, priceContractCents } from "@/lib/contracts/priceContract";
import { currentSeasonSalaryCents } from "@/lib/contracts/currentSeasonSalary";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { CAP_STATUS_LABEL, simplifyCapStatus } from "@/lib/cap/capStatusLabel";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { computeRivalInterest, type RivalTeam } from "@/lib/freeagency/rivalInterest";
import { FreeAgentBoard, type FreeAgentRow } from "@/components/freeagency/FreeAgentBoard";
import { Label, StatCell, Status } from "@/components/ui/primitives";
import { loadDeadMoneyCents } from "@/lib/cap/deadMoney";
import { loadDeadMoneyByTeam } from "@/lib/cap/deadMoney";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * THE WIRE - Ledger archetype. See DESIGN.md.
 *
 * The audit's sharpest working-memory finding lived here: the board showed a
 * player's estimated value while the cap space that makes it meaningful was
 * only on the dashboard, so "can I afford this?" was unanswerable without
 * navigating away. Your own position is now pinned above the board.
 */
export default async function FreeAgentsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const season = league.currentSeason;

  const [freeAgents, ownRoster, rivalRosters, leagueTeams] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId: league.id, leagueTeamId: null, isActive: true },
      include: {
        player: { include: { seasonStats: { where: { season } } } },
      },
      orderBy: { overallRating: "desc" },
    }),
    league.userControlledTeamId
      ? prisma.leaguePlayer.findMany({
          where: { leagueTeamId: league.userControlledTeamId, isActive: true },
          include: {
            player: true,
            contract: { include: { years: { where: { season } } } },
          },
        })
      : Promise.resolve([]),
    // Every rostered player in the league, in one query rather than 29 - the
    // rival-interest model needs each club's cap space and roster holes, and
    // fetching those per team would be thirty round trips on a page load.
    prisma.leaguePlayer.findMany({
      where: {
        leagueId: league.id,
        isActive: true,
        leagueTeamId: { not: null },
        ...(league.userControlledTeamId
          ? { NOT: { leagueTeamId: league.userControlledTeamId } }
          : {}),
      },
      select: {
        leagueTeamId: true,
        playerId: true,
        overallRating: true,
        player: { select: { position: true } },
        contract: {
          select: { years: { where: { season }, select: { season: true, salaryCents: true } } },
        },
      },
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId: league.id },
      select: { id: true, team: { select: { abbreviation: true } } },
    }),
  ]);

  const deadMoneyCents = await loadDeadMoneyCents(league.userControlledTeamId ?? "", season);
  const capSheet = computeCapSheet({
    deadMoneyCents: deadMoneyCents,
    season,
    contracts: ownRoster
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({
        playerId: lp.playerId,
        salaryCents: currentSeasonSalaryCents(lp.contract, season),
      })),
  });

  const needs = computeTeamNeeds(
    ownRoster.map((lp) => ({
      position: lp.player.position,
      overallRating: lp.overallRating,
    })),
  );
  // computeTeamNeeds returns semantic needs (STAR_SCORER, RIM_PROTECTOR...),
  // not position codes. Map each to the positions that would actually fill it
  // so the board can mark those filter pills.
  const NEED_POSITIONS: Record<string, string[]> = {
    POINT_GUARD: ["PG"],
    RIM_PROTECTOR: ["C"],
    WING_DEFENDER: ["SF", "SG"],
    STAR_SCORER: [],
    BENCH_DEPTH: [],
  };
  const needPositions = [...new Set(needs.flatMap((need) => NEED_POSITIONS[need] ?? []))];

  // Each rival's cap space and roster holes, so the board can say who else is
  // circling. Built once here and reused across every free agent, rather than
  // recomputed per row.
  const abbreviationByTeamId = new Map(leagueTeams.map((lt) => [lt.id, lt.team.abbreviation]));
  const rosterByTeamId = new Map<string, typeof rivalRosters>();
  for (const lp of rivalRosters) {
    if (!lp.leagueTeamId) continue;
    const list = rosterByTeamId.get(lp.leagueTeamId) ?? [];
    list.push(lp);
    rosterByTeamId.set(lp.leagueTeamId, list);
  }

  const deadMoneyByTeam = await loadDeadMoneyByTeam(league.id, season);
  const rivals: RivalTeam[] = [...rosterByTeamId.entries()].map(([teamId, roster]) => ({
    leagueTeamId: teamId,
    abbreviation: abbreviationByTeamId.get(teamId) ?? "???",
    capSpaceCents: computeCapSheet({
      deadMoneyCents: deadMoneyByTeam.get(teamId) ?? 0n,
      season,
      contracts: roster
        .filter((lp) => lp.contract?.years[0])
        .map((lp) => ({
          playerId: lp.playerId,
          salaryCents: currentSeasonSalaryCents(lp.contract, season),
        })),
    }).capSpaceCents,
    needs: computeTeamNeeds(
      roster.map((lp) => ({
        position: lp.player.position,
        overallRating: lp.overallRating,
      })),
    ),
    rosterCount: roster.length,
  }));

  // What this player has actually done in THIS save, which is what a real
  // market prices. Falls back to the seeded real-world line for anyone who has
  // not played enough in-sim games yet - see inSimPerformance.ts.
  const inSim = await loadInSimPerformance(league.id, season);

  const rows: FreeAgentRow[] = freeAgents.map((fa) => {
    const stat = inSim.get(fa.id) ?? fa.player.seasonStats[0];
    // Priced through `priceContractCents`, the same function the free-agent
    // detail page quotes, a rival club pays, and `signFreeAgentAction` holds
    // the user to.
    //
    // This used to run a raw performance score through `scoreToCapFraction`
    // and fall back to null when a player had no stats for the current season
    // - and `seasonStats` is seeded real data that never advances, so from a
    // save's SECOND season onward that was every free agent in the league. The
    // board showed no price and, because rival interest needs a price to
    // compare cap space against, no interest either. See
    // docs/audits/CONTRACT_AUDIT.md C-P1-2 and C-P1-3.
    //
    // `contractQualityScore` is anchored to `overallRating`, so a missing
    // performance score costs accuracy rather than producing nothing.
    const estimatedValueCents = BigInt(
      priceContractCents({
        season,
        quality: contractQualityScore({
          overallRating: fa.overallRating,
          performanceScore: stat
            ? computePerformanceScore({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 })
            : null,
          gamesPlayed: stat?.gamesPlayed ?? 0,
        }),
        age: resolvePlayerAge(fa.player, season),
        yearsOfExperience: resolvePlayerExperience(fa.player, season),
        position: fa.player.position,
      }),
    );
    return {
      id: fa.id,
      fullName: fa.player.fullName,
      photoUrl: fa.player.photoUrl,
      position: fa.player.position,
      overallRating: fa.overallRating,
      valueTier: PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(fa.overallRating)],
      pointsPerGame: stat?.pointsPerGame ?? null,
      estimatedValue: formatCentsCompact(estimatedValueCents),
      estimatedValueCents: estimatedValueCents.toString(),
      hasReSigningRights: fa.reSigningTeamId === league.userControlledTeamId,
      // Who else is circling. Every free agent now has a price to compare a
      // rival's cap space against, so this is always computed - it used to be
      // skipped for anyone without current-season stats, which was the whole
      // league from a save's second season on.
      ...(() => {
        const interest = computeRivalInterest(
          {
            position: fa.player.position,
            overallRating: fa.overallRating,
            estimatedValueCents,
          },
          rivals,
        );
        return {
          interestLevel: interest.level,
          // Only the motivated bidders are named: a team with spare room is not
          // news, and listing twenty abbreviations would bury the two that matter.
          interestedTeams: interest.rivals
            .filter((r) => r.reason === "fills a need")
            .map((r) => r.abbreviation),
        };
      })(),
    };
  });

  const capStatus = simplifyCapStatus(capSheet.apronLevel);

  return (
    <main className="mx-auto max-w-350 flex-1 px-6 pt-12 pb-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule-strong pb-6">
        <div>
          <Label tone="accent">The market</Label>
          <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
            Free agents
          </h1>
          <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-ink-muted">
            Any team can always sign a player to a Minimum Contract; bigger offers need cap space or
            a Signing Exception - unless you hold that player&apos;s Re-Signing Rights, in which
            case you can exceed the cap to keep them.
          </p>
        </div>

        {/* YOUR POSITION. The number the whole board is judged against. */}
        <div className="flex shrink-0 items-start gap-8">
          <StatCell
            label="Your cap space"
            value={formatCentsCompact(capSheet.capSpaceCents)}
            size="display"
            tone={capSheet.capSpaceCents > 0n ? "accent" : "ink"}
          />
          <div>
            <Label>Standing</Label>
            <p className="mt-2">
              <Status tone={capStatus === "LUXURY_TAX" ? "caution" : "neutral"}>
                {CAP_STATUS_LABEL[capStatus]}
              </Status>
            </p>
            <p className="mt-3 font-mono text-[15px] tabular-nums text-ink-muted">
              {ownRoster.length} on roster
            </p>
          </div>
        </div>
      </div>

      <FreeAgentBoard
        rows={rows}
        leagueId={league.id}
        capSpaceCents={capSheet.capSpaceCents.toString()}
        needPositions={needPositions}
      />
    </main>
  );
}
