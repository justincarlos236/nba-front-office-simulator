import { computeCapSheet } from "@/lib/cap/capSheet";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { financialSpendingResistance } from "@/lib/finances/finances";
import { computePerformanceScore, type PlayerValuationStats } from "@/lib/valuation/playerValue";
import {
  contractQualityScore,
  pickContractLength,
  priceContractCents,
} from "@/lib/contracts/priceContract";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
import { computeRivalInterest, type RivalTeam } from "./rivalInterest";
import { runCpuFreeAgentPass, type CpuSigning, type PursuableFreeAgent } from "./cpuFreeAgentPass";
import type { GmPersonality } from "@/lib/gm/gmPersonality";

/**
 * Assembles league state into the shape the pure free-agent pass needs, runs
 * it, and hands back the signings for the caller to persist.
 *
 * Split out of `advanceSeasonAction` deliberately: that function is already
 * over two thousand lines and is the single most critical path in the product.
 * The gathering here is mechanical, and keeping it separate means the season
 * advance gains one call rather than eighty lines.
 *
 * Reads state; writes nothing. Persistence stays with the caller, inside its
 * existing transaction ordering.
 */

interface MarketInput {
  leagueId: string;
  newSeason: number;
  userTeamId: string | null;
  /** Every active player, as loaded at the top of the season advance. */
  leaguePlayers: {
    id: string;
    leagueTeamId: string | null;
    overallRating: number;
    potentialRating: number;
    careerGamesMissedToInjury: number;
    playerId: string;
    player: {
      position: string;
      draftYear: number | null;
      birthDate: Date | null;
      /** `trueShootingPct` is nullable in the database; defaulted below. */
      seasonStats?: (Omit<PlayerValuationStats, "trueShootingPct"> & {
        trueShootingPct: number | null;
        gamesPlayed: number;
      })[];
    };
    contract: { years: { salaryCents: bigint }[] } | null;
  }[];
  /** The development pass's pending updates - the source of truth for who is
   *  where *after* retirements and the re-signing pass, which have already run. */
  playerUpdates: {
    id: string;
    leagueTeamId: string | null;
    retiredSeason: number | null;
    overallRating: number;
  }[];
  teamById: Map<
    string,
    { id: string; wins: number; losses: number; gmPersonality: string; cashReserveCents: bigint }
  >;
}

const VALID_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type ValidPosition = (typeof VALID_POSITIONS)[number];

function asPosition(position: string): ValidPosition | null {
  const upper = position.toUpperCase();
  return (VALID_POSITIONS as readonly string[]).includes(upper) ? (upper as ValidPosition) : null;
}

export async function runCpuFreeAgentMarket(input: MarketInput): Promise<CpuSigning[]> {
  const { newSeason, userTeamId, leaguePlayers, playerUpdates, teamById } = input;

  // Post-re-signing state: who is on which roster once retirements and the
  // re-signing pass have been decided. Reading `playerUpdates` rather than the
  // database is what makes this see the market as it actually stands.
  const updateById = new Map(playerUpdates.map((u) => [u.id, u]));
  const playerById = new Map(leaguePlayers.map((lp) => [lp.id, lp]));

  const rosterByTeam = new Map<string, typeof leaguePlayers>();
  const freeAgentIds: string[] = [];

  for (const update of playerUpdates) {
    if (update.retiredSeason !== null) continue;
    const lp = playerById.get(update.id);
    if (!lp) continue;

    if (update.leagueTeamId === null) {
      freeAgentIds.push(update.id);
      continue;
    }
    const list = rosterByTeam.get(update.leagueTeamId) ?? [];
    list.push(lp);
    rosterByTeam.set(update.leagueTeamId, list);
  }

  if (freeAgentIds.length === 0) return [];

  const percentileByTeam = await computeCompetitivenessPercentiles(
    [...teamById.values()].map((t) => ({ id: t.id, wins: t.wins, losses: t.losses })),
  );

  // Every CPU club's room, holes and appetite. The user's own team is excluded
  // throughout - the point of the market is that rivals compete with the user,
  // not that the game signs players on their behalf.
  const rivals: RivalTeam[] = [];
  const pursuers = new Map<string, ReturnType<typeof buildPursuer>>();

  function buildPursuer(teamId: string, roster: typeof leaguePlayers) {
    const ratingOf = (lp: (typeof leaguePlayers)[number]) =>
      updateById.get(lp.id)?.overallRating ?? lp.overallRating;

    const capSheet = computeCapSheet({
      season: newSeason,
      contracts: roster
        .filter((lp) => lp.contract?.years[0])
        .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
    });
    const avgAge =
      roster.length > 0
        ? roster.reduce((sum, lp) => sum + resolvePlayerAge(lp.player, newSeason), 0) /
          roster.length
        : 27;
    // Players whose position code is not one of the five are skipped rather
    // than coerced - a bad code must not silently become a point guard.
    const needs = computeTeamNeeds(
      roster.flatMap((lp) => {
        const position = asPosition(lp.player.position);
        return position ? [{ position, overallRating: ratingOf(lp) }] : [];
      }),
    );
    return {
      leagueTeamId: teamId,
      identity: computeTeamIdentity(percentileByTeam.get(teamId) ?? 0.5, avgAge),
      needs,
      personality: (teamById.get(teamId)?.gmPersonality ?? "BALANCED") as GmPersonality,
      rosterSize: roster.length,
      capSpaceCents: capSheet.capSpaceCents,
      financialThresholdMultiplier: financialSpendingResistance(
        Number(teamById.get(teamId)?.cashReserveCents ?? 0n),
      ),
    };
  }

  for (const [teamId, roster] of rosterByTeam) {
    if (teamId === userTeamId) continue;
    const pursuer = buildPursuer(teamId, roster);
    pursuers.set(teamId, pursuer);
    rivals.push({
      leagueTeamId: teamId,
      // The market never renders these, so an abbreviation would be dead
      // weight; the board computes its own labels for display.
      abbreviation: teamId,
      capSpaceCents: pursuer.capSpaceCents,
      needs: pursuer.needs,
      rosterCount: pursuer.rosterSize,
    });
  }

  if (rivals.length === 0) return [];

  const pursuable: PursuableFreeAgent[] = [];
  for (const id of freeAgentIds) {
    const lp = playerById.get(id);
    if (!lp) continue;
    const position = asPosition(lp.player.position);
    if (!position) continue;

    const rating = updateById.get(id)?.overallRating ?? lp.overallRating;

    // Priced through `priceContractCents`, the same function that prices every
    // other path, so what the user was quoted is what a rival pays. This used
    // to run a raw performance score through the cap curve with no age term and
    // no rating anchor, which is how a player could be shown as a 79 and
    // pursued as an 88 - see docs/CONTRACT_AUDIT.md, C-P1-3 and C-P0-4.
    //
    // A player with no season on record is priced off his rating alone rather
    // than skipped: an in-sim drafted rookie has no `seasonStats` at all, and
    // dropping him meant every homegrown player was invisible to the market
    // for as long as he stayed unproven (C-P2-5).
    const stats = lp.player.seasonStats?.[0];
    const age = resolvePlayerAge(lp.player, newSeason);
    const yearsOfExperience = resolvePlayerExperience(lp.player, newSeason);
    const estimatedValueCents = BigInt(
      priceContractCents({
        season: newSeason,
        quality: contractQualityScore({
          overallRating: rating,
          performanceScore: stats
            ? computePerformanceScore({ ...stats, trueShootingPct: stats.trueShootingPct ?? 0.56 })
            : null,
          gamesPlayed: stats?.gamesPlayed ?? 0,
        }),
        age,
        yearsOfExperience,
      }),
    );
    if (estimatedValueCents <= 0n) continue;

    const interest = computeRivalInterest(
      { position, overallRating: rating, estimatedValueCents },
      rivals,
    );
    if (interest.rivals.length === 0) continue;

    pursuable.push({
      leaguePlayerId: id,
      position,
      overallRating: rating,
      potentialRating: lp.potentialRating,
      age,
      careerGamesMissedToInjury: lp.careerGamesMissedToInjury,
      estimatedValueCents,
      years: pickContractLength(rating, age, createSeededRandom(`${id}:${newSeason}`)),
      // Same ordering the board renders, so the club the user was warned about
      // is the club that signs him.
      interestedTeamIds: interest.rivals.map((r) => r.leagueTeamId),
    });
  }

  return runCpuFreeAgentPass(pursuable, [...pursuers.values()], newSeason);
}
