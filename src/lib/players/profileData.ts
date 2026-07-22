import { prisma } from "@/lib/prisma";
import { estimateAge, estimateExperience } from "@/lib/players/age";
import { computePerformanceScore, scoreToCapFraction } from "@/lib/valuation/playerValue";
import { getSeasonCapRules } from "@/lib/cap/constants";
import type {
  Position,
  InjuryStatus,
  ContractOptionType,
  ExceptionUsed,
} from "@/generated/prisma/client";

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
}

const PROFILE_SEASON = 2023;

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
    },
  });
  if (!leaguePlayer || leaguePlayer.leagueId !== leagueId) return null;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { currentSeason: true },
  });
  const season = league?.currentSeason ?? PROFILE_SEASON;

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
  };
}
