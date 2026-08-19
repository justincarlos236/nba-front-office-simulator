"use server";

import { DATASET_ROSTER_SEASON } from "@/lib/data-sources/datasetSeasons";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { planLeaguePlayer } from "@/lib/league/planLeaguePlayer";
import { generateRoundRobinSchedule } from "@/lib/simulation/generateSchedule";
import { estimateExperience, estimateExperienceFromAge, resolvePlayerAge } from "@/lib/players/age";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { computePayrollTier } from "@/lib/gm/payrollTier";
import { computeExpectationLevel } from "@/lib/gm/expectationLevel";
import { buildFuturePickRows, FUTURE_PICK_WINDOW_YEARS } from "@/lib/draft/futurePicks";
import { pickRandomGmPersonality } from "@/lib/gm/gmPersonality";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { ensureStaffGenerated } from "@/lib/actions/staffGeneration";
import { generatePersonalityProfile } from "@/lib/morale/generatePersonality";
import {
  computeFranchiseValue,
  startingCashReserveCents,
  pickCpuTicketPosture,
} from "@/lib/finances/finances";
import { computeFranchisePopularity } from "@/lib/fans/fanHappiness";
import { rollOwnerArchetype } from "@/lib/gm/ownerArchetype";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "@/lib/data-sources/rosterConstruction";
import { consumeRateLimit } from "@/lib/rateLimit/rateLimit";
import { LEAGUE_CREATION_POLICY } from "@/lib/rateLimit/policy";
import {
  computeStrengthByTeam,
  computeStrengthPercentiles,
  computeJobOffer,
  JOB_SITUATION_LABEL,
} from "@/lib/gm/jobMarket";

// The season a new league starts in - the season the imported NBA dataset
// describes (2026 => the 2026-27 season). See src/lib/data-sources/.
//
// Must track the dataset's own `manifest.seasonYear`. During an offseason that
// is a season AHEAD of the stats the ratings came from, which is intended:
// `import-dataset.ts` builds 2026-27 rosters from 2025-26 production because
// the upcoming season has not been played.
// The season the seeded rosters represent, so a new save opens on the data
// it was built from rather than a literal that has to be remembered.
const SEASON = DATASET_ROSTER_SEASON;

/**
 * Bootstraps a brand-new League from the current imported NBA dataset: clones
 * all 30 teams and every player in the dataset onto their real current roster
 * (trimmed to a legal 15-man roster, surplus to free agency), with each
 * player's imported *seed* rating as their starting overall and a contract
 * generated from their real season stats, and puts the user in charge of one
 * team. Users can run multiple independent franchises (up to
 * `MAX_LEAGUES_PER_USER`) and switch between them from `/leagues`.
 */
export async function createLeagueAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const teamId = formData.get("teamId");
  if (typeof teamId !== "string" || !teamId) {
    throw new Error("Missing teamId");
  }

  // only ACTIVE franchises count toward the cap;
  // an ended (fired/retired) league is a permanent record, not a live save, so
  // it must never block taking a new job.
  const existingCount = await prisma.league.count({
    where: { ownerId: session.user.id, endedAt: null },
  });
  if (existingCount >= MAX_LEAGUES_PER_USER) {
    throw new Error(`You've reached the ${MAX_LEAGUES_PER_USER}-franchise limit.`);
  }

  // The cap above bounds how many leagues one account HOLDS; this bounds how
  // fast it can create them, which is what a create-delete-create loop would
  // otherwise use to churn storage without ever exceeding the cap.
  const limit = await consumeRateLimit(LEAGUE_CREATION_POLICY, session.user.id);
  if (!limit.allowed) {
    throw new Error(LEAGUE_CREATION_POLICY.message);
  }

  const [teams, players, chosenTeam, user] = await Promise.all([
    prisma.team.findMany(),
    // Exactly the current imported NBA dataset: `seedOverallRating` is set only
    // on those rows (see prisma/seed.ts). This filter excludes both the
    // fictional draft-generated prospects (externalId null) - created per-league
    // by that league's own draft and never to be swept into a different new
    // league's bootstrap - and any legacy/older-dataset rows a prior seed left
    // behind. Each player's most recent real season line comes along (2025-26,
    // or a prior season for an injured-all-season player the import fell back
    // to). Player is shared global reference data, so this scoping is essential.
    prisma.player.findMany({
      where: { seedOverallRating: { not: null } },
      include: {
        seasonStats: { orderBy: { season: "desc" }, take: 1 },
        // Real contracts, when the dataset carried them. Ordered so
        // `planLeaguePlayer` sees the deal in season order.
        seedContractYears: { orderBy: { season: "asc" } },
      },
    }),
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { gmReputation: true } }),
  ]);
  if (!chosenTeam) throw new Error("Unknown team");

  // the reputation gate. Rank all 30 teams by real
  // roster strength (same derivation the job-market page shows), and refuse the
  // job if the user's reputation doesn't clear the chosen team's situation.
  // Never trust the client - the gate is authoritative here. The job's
  // situation also sets the starting owner confidence (the "leash").
  const gmReputation = user?.gmReputation ?? 50;
  const teamRatings = players
    .filter((p) => p.currentTeamId && p.seedOverallRating != null)
    .map((p) => ({ teamId: p.currentTeamId, overallRating: p.seedOverallRating! }));
  const strengthByTeam = computeStrengthByTeam(teamRatings);
  const percentiles = computeStrengthPercentiles(strengthByTeam);
  const jobOffer = computeJobOffer(percentiles.get(chosenTeam.id) ?? 0.5, gmReputation);
  if (!jobOffer.available) {
    throw new Error(
      `The ${chosenTeam.city} ${chosenTeam.name} won't hire you yet - a ${JOB_SITUATION_LABEL[jobOffer.situation]} needs a GM reputation of at least ${jobOffer.reputationRequired}. Build your reputation with a more modest job first.`,
    );
  }

  const league = await prisma.league.create({
    data: {
      name: `${chosenTeam.city} ${chosenTeam.name}`,
      ownerId: session.user.id,
      currentSeason: SEASON,
      // the leash: a contender job starts you on a
      // shorter one (lower owner confidence) than a rebuild.
      ownerConfidence: jobOffer.startingOwnerConfidence,
    },
  });

  // a persistent per-team front-office
  // philosophy, seeded deterministically per league+team so the same
  // league always reproduces the same personalities.
  const leagueTeams = await prisma.leagueTeam.createManyAndReturn({
    data: teams.map((team) => {
      // Franchise Finances - a market-scaled starting balance sheet so a
      // brand-new franchise begins with a believable cash cushion and value,
      // before season 1's P&L lands. Recomputed for real at each season
      // boundary (src/lib/actions/offseason.ts).
      const startingCash = startingCashReserveCents(team.marketSize);
      const startingValue = computeFranchiseValue({
        marketSize: team.marketSize,
        franchisePopularity: computeFranchisePopularity(65, null, team.marketSize),
        playoffOutcomeIndex: 0,
        cashReserveCents: startingCash,
        priorValueCents: 0,
      });
      return {
        leagueId: league.id,
        teamId: team.id,
        gmPersonality: pickRandomGmPersonality(
          createSeededRandom(`${league.id}-${team.id}-personality`),
        ),
        cashReserveCents: BigInt(Math.round(startingCash)),
        franchiseValueCents: BigInt(Math.round(startingValue)),
        // CPU teams get a market-based pricing posture for revenue variety;
        // the user's own team starts neutral so the lever is their choice.
        ticketPricingPosture:
          team.id === teamId ? "STANDARD" : pickCpuTicketPosture(team.marketSize),
        // Phase 6 - every team gets its own rolled owner personality from day
        // one, including CPU teams.
        ownerArchetype: rollOwnerArchetype(
          createSeededRandom(`${league.id}-${team.id}-owner-archetype`),
        ),
        ownerArchetypeSince: SEASON,
      };
    }),
  });
  const teamIdToLeagueTeamId = new Map(leagueTeams.map((lt) => [lt.teamId, lt.id]));

  // every team starts with an algorithmically
  // generated Head Coach, Player Development Coach, and Medical Staff (no
  // real-world data sourced - see docs/SYSTEMS.md's Data sourcing
  // section for why, same reasoning as generated contracts), plus a small
  // unemployed pool per role the user can hire from immediately. Shared with
  // the lazy backfill the Staff page runs for leagues created before this
  // phase shipped - see ensureStaffGenerated.
  await ensureStaffGenerated(league.id, SEASON);

  await prisma.league.update({
    where: { id: league.id },
    data: { userControlledTeamId: teamIdToLeagueTeamId.get(teamId) },
  });

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const schedule = generateRoundRobinSchedule(
    leagueTeams.map((lt) => {
      const team = teamById.get(lt.teamId)!;
      return { leagueTeamId: lt.id, conference: team.conference, division: team.division };
    }),
    league.id,
    league.currentSeason,
  );
  await prisma.game.createMany({
    data: schedule.map((game) => ({
      leagueId: league.id,
      season: SEASON,
      gameNumber: game.gameNumber,
      dayIndex: game.dayIndex,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
    })),
  });

  // a
  // rolling window of [SEASON, SEASON + FUTURE_PICK_WINDOW_YEARS], kept
  // one season further out each time `advanceSeasonAction` runs.
  // `overallPickNumber` stays null until that season's own draft actually
  // starts (`runDraftLotteryAction`), which updates these same rows in place
  // rather than creating new ones - so a pick traded before its draft
  // happens keeps whichever `currentOwnerId` the trade left it with.
  await prisma.draftPick.createMany({
    data: buildFuturePickRows(
      league.id,
      leagueTeams.map((lt) => lt.id),
      Array.from({ length: FUTURE_PICK_WINDOW_YEARS + 1 }, (_, i) => SEASON + i),
    ).map((row) => ({ ...row, overallPickNumber: null })),
  });

  // Each player's plan drives their generated contract; the LeaguePlayer's
  // starting overall/potential come from the imported seed ratings, not the
  // contract model. Age comes from the real birth date when available (the
  // current dataset carries it), falling back to the draft-year estimate.
  const enriched = players.map((player) => {
    const stat = player.seasonStats[0];
    const realTeamLeagueTeamId = player.currentTeamId
      ? (teamIdToLeagueTeamId.get(player.currentTeamId) ?? null)
      : null;
    const age = resolvePlayerAge(player, SEASON);
    const yearsOfExperience = player.draftYear
      ? estimateExperience(player.draftYear, SEASON)
      : estimateExperienceFromAge(age);
    const plan = stat
      ? planLeaguePlayer({
          season: SEASON,
          age,
          yearsOfExperience,
          stats: { ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 },
          gamesPlayed: stat.gamesPlayed,
          seedOverallRating: player.seedOverallRating,
          seedPotentialRating: player.seedPotentialRating,
          position: player.position,
          seededContract:
            player.seedContractYears.length > 0
              ? {
                  years: player.seedContractYears.map((y) => ({
                    season: y.season,
                    salaryCents: Number(y.salaryCents),
                  })),
                }
              : null,
          seed: player.id,
        })
      : null;
    return {
      player,
      realTeamLeagueTeamId,
      plan,
      // `planLeaguePlayer` already resolves the seed rating, and priced the
      // contract off the result - reading it back from the plan is what keeps
      // the rating shown and the rating paid from being two different numbers.
      overallRating: plan?.overallRating ?? player.seedOverallRating ?? 50,
      potentialRating: plan?.potentialRating ?? player.seedPotentialRating ?? 50,
    };
  });

  // Roster trim: each team keeps its top 15 by seed rating; the surplus
  // (deep-bench / two-way caliber) enters the league as free agents, so free
  // agency has real content and every roster is a legal, playable size. Shared
  // with the dataset validator (src/lib/data-sources/rosterConstruction.ts) so
  // what's validated is exactly what's built.
  const { rostered } = selectTopPerTeam(
    enriched,
    (e) => e.realTeamLeagueTeamId,
    (e) => e.overallRating,
    DEFAULT_MAX_ROSTER_SIZE,
  );

  const plans = enriched.map((e) => ({
    player: e.player,
    plan: e.plan,
    overallRating: e.overallRating,
    potentialRating: e.potentialRating,
    leagueTeamId: rostered.has(e) ? e.realTeamLeagueTeamId : null,
  }));

  const createdLeaguePlayers = await prisma.leaguePlayer.createManyAndReturn({
    data: plans.map(({ player, leagueTeamId, overallRating, potentialRating }) => ({
      leagueId: league.id,
      playerId: player.id,
      leagueTeamId,
      reSigningTeamId: leagueTeamId,
      overallRating,
      potentialRating,
      // Franchise Finances (Phase D) - real players start on their team as of
      // the league's first season (tenure counts from here); homegrown is
      // false since the sim has no draft history for the real roster.
      joinedTeamSeason: leagueTeamId ? SEASON : null,
    })),
  });
  const playerIdToLeaguePlayerId = new Map(createdLeaguePlayers.map((lp) => [lp.playerId, lp.id]));

  // Player Morale & Personality System - every player in the league starts
  // with a persistent personality from day one, same "no special bootstrap
  // case" instinct as SeasonExpectation below.
  await prisma.playerPersonalityProfile.createMany({
    data: createdLeaguePlayers.map((lp) => ({
      leaguePlayerId: lp.id,
      ...generatePersonalityProfile(lp.id),
    })),
  });

  const rosteredPlans = plans.filter((p) => p.plan && p.leagueTeamId);

  const contractInputs = rosteredPlans.map((p) => ({
    leaguePlayerId: playerIdToLeaguePlayerId.get(p.player.id)!,
    leagueTeamId: p.leagueTeamId!,
    signedSeason: SEASON,
    startSeason: p.plan!.contract.startSeason,
    endSeason: p.plan!.contract.endSeason,
  }));
  const createdContracts = await prisma.contract.createManyAndReturn({ data: contractInputs });
  const leaguePlayerIdToContractId = new Map(createdContracts.map((c) => [c.leaguePlayerId, c.id]));

  const contractYearInputs = rosteredPlans.flatMap((p) => {
    const leaguePlayerId = playerIdToLeaguePlayerId.get(p.player.id)!;
    const contractId = leaguePlayerIdToContractId.get(leaguePlayerId)!;
    return p.plan!.contract.years.map((year) => ({
      contractId,
      season: year.season,
      salaryCents: year.salaryCents,
      guaranteedCents: year.guaranteedCents,
    }));
  });
  await prisma.contractYear.createMany({ data: contractYearInputs });

  // GM accountability starts from day one, not just from the
  // first offseason - otherwise advanceSeasonAction would need a special
  // "no expectation exists yet" bootstrap case every league would hit
  // exactly once. Setting it here means there's only ever one place that
  // creates a SeasonExpectation for a season that hasn't been evaluated
  // yet: here for season 1, advanceSeasonAction for every season after.
  const userLeagueTeamId = teamIdToLeagueTeamId.get(teamId)!;
  const userRosteredPlans = rosteredPlans.filter((p) => p.leagueTeamId === userLeagueTeamId);
  const userCapSheet = computeCapSheet({
    deadMoneyCents: 0n, // a league being created has no released players yet
    season: SEASON,
    contracts: userRosteredPlans.map((p) => ({
      playerId: p.player.id,
      salaryCents: p.plan!.contract.years.find((y) => y.season === SEASON)!.salaryCents,
    })),
  });
  const userTeamStrength = computeTeamStrength(userRosteredPlans.map((p) => p.overallRating));
  await prisma.seasonExpectation.create({
    data: {
      leagueId: league.id,
      season: SEASON,
      expectationLevel: computeExpectationLevel(
        computePayrollTier(userCapSheet.apronLevel),
        userTeamStrength,
      ),
    },
  });

  revalidatePath("/leagues");
  redirect(`/leagues/${league.id}`);
}

/**
 * Permanently deletes a league and everything in it. `Contract`,
 * `DraftPick`, `TradeException`, and `TradeAsset` all have a `RESTRICT`
 * (not cascade) foreign key into `LeagueTeam` - a plain `league.delete()`
 * fails with a constraint violation unless those four are cleared first,
 * in dependency order (discovered the hard way cleaning up accumulated
 * e2e test data).
 * Everything else (`LeagueTeam`, `LeaguePlayer`, `Game`, `PlayoffSeries`,
 * `Trade`, `SeasonAward`, `LeagueTransaction`, `SeasonExpectation`,
 * `DraftProspect`, `AssistantThread`/`AssistantMessage`) cascades cleanly
 * once those four are gone.
 */
export async function deleteLeagueAction(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  await prisma.tradeAsset.deleteMany({ where: { trade: { leagueId } } });
  await prisma.contract.deleteMany({ where: { leagueTeam: { leagueId } } });
  await prisma.staffContract.deleteMany({ where: { leagueTeam: { leagueId } } });
  await prisma.draftPick.deleteMany({ where: { leagueId } });
  await prisma.tradeException.deleteMany({ where: { leagueId } });
  await prisma.league.delete({ where: { id: leagueId } });

  revalidatePath("/leagues");
}
