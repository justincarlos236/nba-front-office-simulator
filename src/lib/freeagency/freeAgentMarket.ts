import { computeCapSheet } from "@/lib/cap/capSheet";
import { veteranMinimumCents } from "@/lib/cap/veteranMinimum";
import { currentSeasonSalaryCents } from "@/lib/contracts/currentSeasonSalary";
import { contractQualityScore, priceContractCents } from "@/lib/contracts/priceContract";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { prisma } from "@/lib/prisma";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
import { computePerformanceScore, type PlayerValuationStats } from "@/lib/valuation/playerValue";
import { loadInSimPerformance } from "@/lib/valuation/inSimPerformance";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import { computeRivalInterest, type RivalTeam } from "./rivalInterest";
import { demandAdjustedPriceCents } from "./cpuFreeAgentPass";
import { evaluateFreeAgentOffer } from "./evaluateFreeAgentOffer";

/**
 * What a free agent costs, and the least he will sign for.
 *
 * **One function, because two of them disagreed.** The offer page quoted a
 * price and `signFreeAgentAction` enforced a different one, and a user who
 * typed the figure the page suggested was refused by the club he was standing
 * in. Three inputs differed:
 *
 *   - the page priced him on his in-sim production; the action passed
 *     `performanceScore: null, gamesPlayed: 0` and priced him on rating alone,
 *   - the action then moved the price for rival demand, which the quote never
 *     applied,
 *   - and the action finally compared against a *required* salary - the ask
 *     scaled by how many clubs are bidding - which the quote did not model at
 *     all.
 *
 * The page's own comment claimed "same pricing function, same inputs". The
 * function was the same; the inputs were not, and nothing checked. This is the
 * fourth defect of that exact shape found in this codebase - a display path
 * reading different data from the logic path beside it - and the reason the fix
 * is a shared function rather than two corrected copies.
 *
 * Everything the market needs is loaded here, including which season's
 * production to price off, so a caller cannot select the stat differently and
 * reintroduce the gap.
 */

/** The free agent as both callers already have him loaded. */
export interface FreeAgentForPricing {
  id: string;
  overallRating: number;
  player: {
    position: string;
    birthDate: Date | null;
    draftYear: number | null;
    /** Seeded real-world stats, used only when this save has no record of him. */
    seasonStats: (Omit<PlayerValuationStats, "trueShootingPct"> & {
      trueShootingPct: number | null;
      gamesPlayed: number;
      season: number;
    })[];
  };
}

export interface FreeAgentMarket {
  /** What he is worth before anyone else's interest is counted. */
  askingPriceCents: bigint;
  /** That price moved by how crowded the market is - what a rival club would pay. */
  demandAdjustedAskCents: bigint;
  /** Rival clubs with both the room and the motivation to sign him. */
  rivalSuitors: number;
  /**
   * The lowest offer he accepts. **This is the number to quote**: offering it
   * signs him, and offering a cent less does not.
   */
  requiredSalaryCents: bigint;
  /**
   * The production this price was read off, so a page can show the user the
   * same record the market used - and name the right season while doing it.
   * Null when he has no priceable sample and was valued on rating alone.
   */
  pricedOn: { pointsPerGame: number; gamesPlayed: number; season: number } | null;
}

export async function resolveFreeAgentMarket(input: {
  leagueId: string;
  season: number;
  /** Excluded from the suitor count - the question is who *else* wants him. */
  userLeagueTeamId: string;
  freeAgent: FreeAgentForPricing;
}): Promise<FreeAgentMarket> {
  const { leagueId, season, userLeagueTeamId, freeAgent } = input;

  const [rosterRows, inSim] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { not: null }, isActive: true },
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
    loadInSimPerformance(leagueId, season),
  ]);

  // In-sim production first, seeded real-world stats only as a fallback -
  // seasonStats never advances, so from a save's second season it is empty for
  // everyone. See docs/audits/CONTRACT_AUDIT.md C-P1-2.
  const inSimStat = inSim.get(freeAgent.id);
  const seededStat = freeAgent.player.seasonStats[0];
  const stat = inSimStat ?? seededStat;
  const pricedOn = stat
    ? {
        pointsPerGame: stat.pointsPerGame,
        gamesPlayed: stat.gamesPlayed,
        // An in-sim record is this save's current season; the fallback carries
        // the real-world season it was seeded from.
        season: inSimStat ? season : seededStat.season,
      }
    : null;
  const age = resolvePlayerAge(freeAgent.player, season);
  const yearsOfExperience = resolvePlayerExperience(freeAgent.player, season);

  const askingPriceCents = BigInt(
    priceContractCents({
      season,
      quality: contractQualityScore({
        overallRating: freeAgent.overallRating,
        performanceScore: stat
          ? computePerformanceScore({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 })
          : null,
        gamesPlayed: stat?.gamesPlayed ?? 0,
      }),
      age,
      yearsOfExperience,
      position: freeAgent.player.position,
    }),
  );

  const rosterByTeam = new Map<string, typeof rosterRows>();
  for (const row of rosterRows) {
    if (!row.leagueTeamId || row.leagueTeamId === userLeagueTeamId) continue;
    const list = rosterByTeam.get(row.leagueTeamId) ?? [];
    list.push(row);
    rosterByTeam.set(row.leagueTeamId, list);
  }

  const rivals: RivalTeam[] = [...rosterByTeam.entries()].map(([teamId, roster]) => ({
    leagueTeamId: teamId,
    // Never rendered from here; boards compute their own labels.
    abbreviation: teamId,
    capSpaceCents: computeCapSheet({
      season,
      contracts: roster
        .filter((lp) => lp.contract?.years[0])
        .map((lp) => ({
          playerId: lp.playerId,
          salaryCents: currentSeasonSalaryCents(lp.contract, season),
        })),
    }).capSpaceCents,
    needs: computeTeamNeeds(
      roster.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
    ),
    rosterCount: roster.length,
  }));

  const rivalSuitors = computeRivalInterest(
    {
      position: freeAgent.player.position,
      overallRating: freeAgent.overallRating,
      estimatedValueCents: askingPriceCents,
    },
    rivals,
  ).rivals.length;

  // Competition moves the ask by the same rule it moves it for a rival club.
  const demandAdjustedAskCents = demandAdjustedPriceCents(
    askingPriceCents,
    rivalSuitors,
    age,
    season,
    yearsOfExperience,
  );

  const { requiredSalaryCents } = evaluateFreeAgentOffer({
    askingPriceCents: demandAdjustedAskCents,
    // Only `requiredSalaryCents` is wanted here; acceptance is decided against
    // a real offer at the call site.
    offerSalaryCents: 0n,
    rivalSuitors,
    valueTier: getPlayerValueTier(freeAgent.overallRating),
    minimumSalaryCents: veteranMinimumCents(season, yearsOfExperience),
  });

  return { askingPriceCents, demandAdjustedAskCents, rivalSuitors, requiredSalaryCents, pricedOn };
}
