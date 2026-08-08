import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { scoreToCapFraction, computePerformanceScore } from "@/lib/valuation/playerValue";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { CAP_STATUS_LABEL, simplifyCapStatus } from "@/lib/cap/capStatusLabel";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import {
  FreeAgentBoard,
  type FreeAgentRow,
} from "@/components/freeagency/FreeAgentBoard";
import { Label, StatCell, Status } from "@/components/ui/primitives";

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

  const [freeAgents, ownRoster] = await Promise.all([
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
  ]);

  const rules = getSeasonCapRules(season);

  const capSheet = computeCapSheet({
    season,
    contracts: ownRoster
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({
        playerId: lp.playerId,
        salaryCents: lp.contract!.years[0].salaryCents,
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

  const rows: FreeAgentRow[] = freeAgents.map((fa) => {
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
    return {
      id: fa.id,
      fullName: fa.player.fullName,
      photoUrl: fa.player.photoUrl,
      position: fa.player.position,
      overallRating: fa.overallRating,
      valueTier: PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(fa.overallRating)],
      pointsPerGame: stat?.pointsPerGame ?? null,
      estimatedValue: estimatedValueCents ? formatCentsCompact(estimatedValueCents) : null,
      estimatedValueCents: estimatedValueCents ? estimatedValueCents.toString() : null,
      hasReSigningRights: fa.reSigningTeamId === league.userControlledTeamId,
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
