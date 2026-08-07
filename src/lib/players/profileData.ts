import { prisma } from "@/lib/prisma";
import { estimateAge, estimateExperience } from "@/lib/players/age";
import { computePerformanceScore, scoreToCapFraction } from "@/lib/valuation/playerValue";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { computeCareerHighs, isTripleDouble, scoringMilestone } from "@/lib/stats/milestones";
import {
  generatePersonalityProfile,
  describePersonalityLabel,
} from "@/lib/morale/generatePersonality";
import {
  getMoraleLevel,
  MORALE_LEVEL_LABEL,
  MORALE_LEVEL_DESCRIPTION,
} from "@/lib/morale/moraleLevel";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  computeFranchiseIconScore,
  getFranchiseIconLevel,
  FRANCHISE_ICON_LABEL,
} from "@/lib/finances/franchiseIcon";
import type {
  Position,
  InjuryStatus,
  ContractOptionType,
  ExceptionUsed,
} from "@/generated/prisma/client";
import type { ProspectPathway } from "@/lib/draft/prospectBio";

/** Which player to load a profile for, and how much context is available. */
export type PlayerProfileIdentity =
  | { kind: "league"; leagueId: string; leaguePlayerId: string }
  | { kind: "reference"; playerId: string };

export interface PlayerProfileData {
  identity: {
    playerId: string;
    fullName: string;
    photoUrl: string | null;
    position: Position;
    heightInches: number | null;
    weightLbs: number | null;
    draftYear: number | null;
    draftRound: number | null;
    draftPick: number | null;
    /** Scouting Pillar Redesign (Phase 4) - how this player entered the draft. Null for real imported historical players, which have no pathway on file. */
    pathway: ProspectPathway | null;
    age: number;
    experience: number;
    currentTeam: {
      abbreviation: string;
      city: string;
      name: string;
      primaryColor: string;
      logoUrl: string | null;
    } | null;
  };
  /** Only present within a league context - a bare reference player (team-browse) never has this. */
  leagueContext: {
    leaguePlayerId: string;
    overallRating: number;
    potentialRating: number;
    injuryStatus: InjuryStatus;
    injuryReturnsAtGamesPlayed: number | null;
    careerGamesMissedToInjury: number;
    isActive: boolean;
    retiredSeason: number | null;
    /** Player Morale & Personality System - always present alongside the rest of leagueContext (backfilled lazily on read if somehow missing). */
    morale: {
      score: number;
      level: string;
      levelDescription: string;
      tradeRequestActive: boolean;
      personality: {
        competitiveness: number;
        roleSensitivity: number;
        loyalty: number;
        financialMotivation: number;
        label: string;
        description: string;
      };
      /** This player's own PLAYER_MORALE news, most recent first - the "why" behind the score, not a chart. */
      recentNews: { description: string; season: number }[];
    };
    /** Franchise Finances (Phase D) - derived franchise-icon status: how iconic this player has become to THIS franchise (star power + tenure + homegrown + awards). Null for a free agent / no current team. */
    icon: {
      score: number;
      level: string;
      label: string;
      tenureSeasons: number;
      homegrown: boolean;
    } | null;
  } | null;
  contract: {
    signedSeason: number;
    startSeason: number;
    endSeason: number;
    noTradeClause: boolean;
    signedUsing: ExceptionUsed;
    years: {
      season: number;
      salaryCents: string;
      guaranteedCents: string;
      optionType: ContractOptionType;
    }[];
  } | null;
  seasonStats: {
    season: number;
    team: string;
    gamesPlayed: number;
    minutesPerGame: number;
    pointsPerGame: number;
    reboundsPerGame: number;
    assistsPerGame: number;
    stealsPerGame: number;
    blocksPerGame: number;
    turnoversPerGame: number;
    trueShootingPct: number | null;
  }[];
  /** A live-computed estimate, same engine that grades trades - always available for any real player with a real stat line. */
  valuation: {
    performanceScore: number;
    estimatedMarketValueCents: string;
  } | null;
  awards: { season: number; category: string }[];
  /**
   * All-Star Weekend career honors - real selections/contest results/MVPs
   * from this league's own AllStarWeekend rows (see
   * src/lib/actions/allStarWeekend.ts), empty for a bare reference profile
   * the same way `awards` is.
   */
  allStarHonors: { season: number; label: string }[];
  /**
   * Real, simulated per-game performances from this league's own box-score
   * engine (see src/lib/simulation/boxScore.ts) - only present for a league
   * identity, and only once this league has actually simulated games with
   * this player on a roster. Distinct from `seasonStats` above, which is
   * always the frozen real-world 2023-24 baseline regardless of context.
   */
  gameLog: {
    recentGames: {
      gameId: string;
      season: number;
      opponent: string;
      minutesPlayed: number;
      points: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
      turnovers: number;
      fgMade: number;
      fgAttempted: number;
      fg3Made: number;
      fg3Attempted: number;
      ftMade: number;
      ftAttempted: number;
      isTripleDouble: boolean;
      scoringMilestone: 40 | 50 | 60 | null;
    }[];
    /** This league's current season, aggregated from every game played so far - moves as more games simulate. */
    currentSeasonAverage: {
      season: number;
      gamesPlayed: number;
      minutesPerGame: number;
      pointsPerGame: number;
      reboundsPerGame: number;
      assistsPerGame: number;
      stealsPerGame: number;
      blocksPerGame: number;
      turnoversPerGame: number;
      fgPct: number | null;
      fg3Pct: number | null;
      ftPct: number | null;
    } | null;
    /** Best single-game value in each category across every game this league has on record for this player. */
    careerHighs: {
      points: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
    } | null;
  } | null;
}

/** The fixed real-world season every real player's seeded stat baseline comes from. */
export const PROFILE_SEASON = 2023;

function teamDTO(
  team: {
    abbreviation: string;
    city: string;
    name: string;
    primaryColor: string;
    logoUrl: string | null;
  } | null,
) {
  if (!team) return null;
  return {
    abbreviation: team.abbreviation,
    city: team.city,
    name: team.name,
    primaryColor: team.primaryColor,
    logoUrl: team.logoUrl,
  };
}

/** Reference-context profile (team-browse pages, no league save involved). */
export async function loadReferencePlayerProfile(
  playerId: string,
): Promise<PlayerProfileData | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { currentTeam: true, seasonStats: { orderBy: { season: "desc" } } },
  });
  if (!player) return null;

  const stat = player.seasonStats.find((s) => s.season === PROFILE_SEASON) ?? player.seasonStats[0];
  const valuation = stat
    ? (() => {
        const performanceScore = computePerformanceScore({
          ...stat,
          trueShootingPct: stat.trueShootingPct ?? 0.56,
        });
        const rules = getSeasonCapRules(PROFILE_SEASON);
        const estimatedMarketValueCents = BigInt(
          Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(performanceScore)),
        );
        return {
          performanceScore,
          estimatedMarketValueCents: estimatedMarketValueCents.toString(),
        };
      })()
    : null;

  return {
    identity: {
      playerId: player.id,
      fullName: player.fullName,
      photoUrl: player.photoUrl,
      position: player.position,
      heightInches: player.heightInches,
      weightLbs: player.weightLbs,
      draftYear: player.draftYear,
      draftRound: player.draftRound,
      draftPick: player.draftPick,
      pathway: player.pathway,
      age: estimateAge(player.draftYear, PROFILE_SEASON),
      experience: estimateExperience(player.draftYear, PROFILE_SEASON),
      currentTeam: teamDTO(player.currentTeam),
    },
    leagueContext: null,
    contract: null,
    seasonStats: player.seasonStats.map((s) => ({
      season: s.season,
      team: s.team,
      gamesPlayed: s.gamesPlayed,
      minutesPerGame: s.minutesPerGame,
      pointsPerGame: s.pointsPerGame,
      reboundsPerGame: s.reboundsPerGame,
      assistsPerGame: s.assistsPerGame,
      stealsPerGame: s.stealsPerGame,
      blocksPerGame: s.blocksPerGame,
      turnoversPerGame: s.turnoversPerGame,
      trueShootingPct: s.trueShootingPct,
    })),
    valuation,
    awards: [],
    allStarHonors: [],
    gameLog: null,
  };
}

/** League-context profile - the rich case, everything the sim knows about this player within one save. */
export async function loadLeaguePlayerProfile(
  leagueId: string,
  leaguePlayerId: string,
): Promise<PlayerProfileData | null> {
  const leaguePlayer = await prisma.leaguePlayer.findUnique({
    where: { id: leaguePlayerId },
    include: {
      player: { include: { currentTeam: true, seasonStats: { orderBy: { season: "desc" } } } },
      leagueTeam: { include: { team: true } },
      contract: { include: { years: { orderBy: { season: "asc" } } } },
      seasonAwards: { orderBy: { season: "desc" } },
      personalityProfile: true,
    },
  });
  if (!leaguePlayer || leaguePlayer.leagueId !== leagueId) return null;

  // Player Morale & Personality System - defensive backfill for any
  // LeaguePlayer somehow still missing a profile (the primary backfill is
  // scripts/backfill-player-personalities.ts, run once against existing
  // saves; this is just a safety net, not the main mechanism).
  const personalityProfile =
    leaguePlayer.personalityProfile ??
    (await prisma.playerPersonalityProfile.create({
      data: { leaguePlayerId: leaguePlayer.id, ...generatePersonalityProfile(leaguePlayer.id) },
    }));

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { currentSeason: true },
  });
  const season = league?.currentSeason ?? PROFILE_SEASON;

  const [
    recentGameStats,
    allGameStats,
    seasonAgg,
    allStarSelections,
    allStarEventResults,
    allStarGameMvps,
  ] = await Promise.all([
    prisma.playerGameStat.findMany({
      where: { leaguePlayerId },
      orderBy: { game: { gameNumber: "desc" } },
      take: 10,
      include: {
        game: {
          include: {
            homeTeam: { include: { team: true } },
            awayTeam: { include: { team: true } },
          },
        },
      },
    }),
    prisma.playerGameStat.findMany({
      where: { leaguePlayerId },
      select: { points: true, rebounds: true, assists: true, steals: true, blocks: true },
    }),
    prisma.playerGameStat.aggregate({
      where: { leaguePlayerId, season },
      _avg: {
        minutesPlayed: true,
        points: true,
        rebounds: true,
        assists: true,
        steals: true,
        blocks: true,
        turnovers: true,
      },
      _sum: {
        fgMade: true,
        fgAttempted: true,
        fg3Made: true,
        fg3Attempted: true,
        ftMade: true,
        ftAttempted: true,
      },
      _count: { _all: true },
    }),
    prisma.allStarSelection.findMany({
      where: { leaguePlayerId },
      select: { role: true, allStarWeekend: { select: { season: true } } },
    }),
    prisma.allStarEventParticipant.findMany({
      where: {
        leaguePlayerId,
        OR: [{ result: "CHAMPION" }, { result: { contains: "MVP" } }],
      },
      select: { eventType: true, result: true, allStarWeekend: { select: { season: true } } },
    }),
    prisma.allStarGame.findMany({
      where: { mvpLeaguePlayerId: leaguePlayerId },
      select: { allStarWeekend: { select: { season: true } } },
    }),
  ]);

  const gamesPlayed = seasonAgg._count._all;

  const ALL_STAR_ROLE_LABEL: Record<string, string> = {
    STARTER: "All-Star Starter",
    RESERVE: "All-Star",
    INJURY_REPLACEMENT: "All-Star (Injury Replacement)",
  };
  const allStarHonors = [
    ...allStarSelections.map((s) => ({
      season: s.allStarWeekend.season,
      label: ALL_STAR_ROLE_LABEL[s.role] ?? "All-Star",
    })),
    ...allStarEventResults.map((r) => ({
      season: r.allStarWeekend.season,
      label:
        r.eventType === "RISING_STARS"
          ? "Rising Stars MVP"
          : r.eventType === "THREE_POINT_CONTEST"
            ? "Three-Point Contest Champion"
            : "Slam Dunk Contest Champion",
    })),
    ...allStarGameMvps.map((g) => ({
      season: g.allStarWeekend.season,
      label: "All-Star Game MVP",
    })),
  ].sort((a, b) => b.season - a.season);
  const gameLog = {
    recentGames: recentGameStats.map((g) => ({
      gameId: g.gameId,
      season: g.season,
      opponent:
        g.leagueTeamId === g.game.homeLeagueTeamId
          ? g.game.awayTeam.team.abbreviation
          : g.game.homeTeam.team.abbreviation,
      minutesPlayed: g.minutesPlayed,
      points: g.points,
      rebounds: g.rebounds,
      assists: g.assists,
      steals: g.steals,
      blocks: g.blocks,
      turnovers: g.turnovers,
      fgMade: g.fgMade,
      fgAttempted: g.fgAttempted,
      fg3Made: g.fg3Made,
      fg3Attempted: g.fg3Attempted,
      ftMade: g.ftMade,
      ftAttempted: g.ftAttempted,
      isTripleDouble: isTripleDouble(g),
      scoringMilestone: scoringMilestone(g.points),
    })),
    careerHighs: computeCareerHighs(allGameStats),
    currentSeasonAverage:
      gamesPlayed > 0
        ? {
            season,
            gamesPlayed,
            minutesPerGame: seasonAgg._avg.minutesPlayed ?? 0,
            pointsPerGame: seasonAgg._avg.points ?? 0,
            reboundsPerGame: seasonAgg._avg.rebounds ?? 0,
            assistsPerGame: seasonAgg._avg.assists ?? 0,
            stealsPerGame: seasonAgg._avg.steals ?? 0,
            blocksPerGame: seasonAgg._avg.blocks ?? 0,
            turnoversPerGame: seasonAgg._avg.turnovers ?? 0,
            fgPct:
              seasonAgg._sum.fgAttempted && seasonAgg._sum.fgAttempted > 0
                ? (seasonAgg._sum.fgMade ?? 0) / seasonAgg._sum.fgAttempted
                : null,
            fg3Pct:
              seasonAgg._sum.fg3Attempted && seasonAgg._sum.fg3Attempted > 0
                ? (seasonAgg._sum.fg3Made ?? 0) / seasonAgg._sum.fg3Attempted
                : null,
            ftPct:
              seasonAgg._sum.ftAttempted && seasonAgg._sum.ftAttempted > 0
                ? (seasonAgg._sum.ftMade ?? 0) / seasonAgg._sum.ftAttempted
                : null,
          }
        : null,
  };

  // Player Morale & Personality System - this player's own news, the "why"
  // behind the score, not a separate chart/history table (see the
  // Out of scope section of the feature request).
  const moraleNews = await prisma.leagueTransaction.findMany({
    where: { leagueId, subjectLeaguePlayerId: leaguePlayerId, type: "PLAYER_MORALE" },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { description: true, season: true },
  });

  const stat =
    leaguePlayer.player.seasonStats.find((s) => s.season === PROFILE_SEASON) ??
    leaguePlayer.player.seasonStats[0];
  const valuation = stat
    ? (() => {
        const performanceScore = computePerformanceScore({
          ...stat,
          trueShootingPct: stat.trueShootingPct ?? 0.56,
        });
        const rules = getSeasonCapRules(PROFILE_SEASON);
        const estimatedMarketValueCents = BigInt(
          Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(performanceScore)),
        );
        return {
          performanceScore,
          estimatedMarketValueCents: estimatedMarketValueCents.toString(),
        };
      })()
    : null;

  return {
    identity: {
      playerId: leaguePlayer.player.id,
      fullName: leaguePlayer.player.fullName,
      photoUrl: leaguePlayer.player.photoUrl,
      position: leaguePlayer.player.position,
      heightInches: leaguePlayer.player.heightInches,
      weightLbs: leaguePlayer.player.weightLbs,
      draftYear: leaguePlayer.player.draftYear,
      draftRound: leaguePlayer.player.draftRound,
      draftPick: leaguePlayer.player.draftPick,
      pathway: leaguePlayer.player.pathway,
      age: estimateAge(leaguePlayer.player.draftYear, season),
      experience: estimateExperience(leaguePlayer.player.draftYear, season),
      currentTeam: teamDTO(leaguePlayer.leagueTeam?.team ?? null),
    },
    leagueContext: {
      leaguePlayerId: leaguePlayer.id,
      overallRating: leaguePlayer.overallRating,
      potentialRating: leaguePlayer.potentialRating,
      injuryStatus: leaguePlayer.injuryStatus,
      injuryReturnsAtGamesPlayed: leaguePlayer.injuryReturnsAtGamesPlayed,
      careerGamesMissedToInjury: leaguePlayer.careerGamesMissedToInjury,
      isActive: leaguePlayer.isActive,
      retiredSeason: leaguePlayer.retiredSeason,
      morale: (() => {
        const level = getMoraleLevel(leaguePlayer.morale);
        const label = describePersonalityLabel(personalityProfile);
        return {
          score: leaguePlayer.morale,
          level: MORALE_LEVEL_LABEL[level],
          levelDescription: MORALE_LEVEL_DESCRIPTION[level],
          tradeRequestActive: leaguePlayer.tradeRequestActive,
          personality: {
            competitiveness: personalityProfile.competitiveness,
            roleSensitivity: personalityProfile.roleSensitivity,
            loyalty: personalityProfile.loyalty,
            financialMotivation: personalityProfile.financialMotivation,
            label: label.label,
            description: label.description,
          },
          recentNews: moraleNews.map((n) => ({ description: n.description, season: n.season })),
        };
      })(),
      icon: (() => {
        if (!leaguePlayer.leagueTeamId) return null;
        const tenureSeasons =
          leaguePlayer.joinedTeamSeason != null
            ? Math.max(0, season - leaguePlayer.joinedTeamSeason)
            : 0;
        const score = computeFranchiseIconScore({
          starTier: getPlayerValueTier(leaguePlayer.overallRating),
          tenureSeasons,
          homegrown: leaguePlayer.homegrown,
          careerAwards: leaguePlayer.seasonAwards.length,
        });
        return {
          score,
          level: getFranchiseIconLevel(score),
          label: FRANCHISE_ICON_LABEL[getFranchiseIconLevel(score)],
          tenureSeasons,
          homegrown: leaguePlayer.homegrown,
        };
      })(),
    },
    contract: leaguePlayer.contract
      ? {
          signedSeason: leaguePlayer.contract.signedSeason,
          startSeason: leaguePlayer.contract.startSeason,
          endSeason: leaguePlayer.contract.endSeason,
          noTradeClause: leaguePlayer.contract.noTradeClause,
          signedUsing: leaguePlayer.contract.signedUsing,
          years: leaguePlayer.contract.years.map((y) => ({
            season: y.season,
            salaryCents: y.salaryCents.toString(),
            guaranteedCents: y.guaranteedCents.toString(),
            optionType: y.optionType,
          })),
        }
      : null,
    seasonStats: leaguePlayer.player.seasonStats.map((s) => ({
      season: s.season,
      team: s.team,
      gamesPlayed: s.gamesPlayed,
      minutesPerGame: s.minutesPerGame,
      pointsPerGame: s.pointsPerGame,
      reboundsPerGame: s.reboundsPerGame,
      assistsPerGame: s.assistsPerGame,
      stealsPerGame: s.stealsPerGame,
      blocksPerGame: s.blocksPerGame,
      turnoversPerGame: s.turnoversPerGame,
      trueShootingPct: s.trueShootingPct,
    })),
    valuation,
    awards: leaguePlayer.seasonAwards.map((a) => ({ season: a.season, category: a.category })),
    allStarHonors,
    gameLog,
  };
}
