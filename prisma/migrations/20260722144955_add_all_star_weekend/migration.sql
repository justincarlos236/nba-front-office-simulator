-- CreateEnum
CREATE TYPE "AllStarWeekendStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AllStarRole" AS ENUM ('STARTER', 'RESERVE', 'INJURY_REPLACEMENT');

-- CreateEnum
CREATE TYPE "AllStarPositionGroup" AS ENUM ('GUARD', 'FRONTCOURT');

-- CreateEnum
CREATE TYPE "AllStarEventType" AS ENUM ('RISING_STARS', 'THREE_POINT_CONTEST', 'SLAM_DUNK_CONTEST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'ALL_STAR_SELECTION';
ALTER TYPE "TransactionType" ADD VALUE 'ALL_STAR_SNUB';
ALTER TYPE "TransactionType" ADD VALUE 'ALL_STAR_RESULT';

-- CreateTable
CREATE TABLE "all_star_weekends" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "status" "AllStarWeekendStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredAtDayIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "all_star_weekends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "all_star_selections" (
    "id" TEXT NOT NULL,
    "allStarWeekendId" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "conference" "Conference" NOT NULL,
    "positionGroup" "AllStarPositionGroup" NOT NULL,
    "role" "AllStarRole" NOT NULL,
    "performanceScore" DOUBLE PRECISION NOT NULL,
    "pointsPerGame" DOUBLE PRECISION NOT NULL,
    "reboundsPerGame" DOUBLE PRECISION NOT NULL,
    "assistsPerGame" DOUBLE PRECISION NOT NULL,
    "teamWinPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "all_star_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "all_star_event_participants" (
    "id" TEXT NOT NULL,
    "allStarWeekendId" TEXT NOT NULL,
    "eventType" "AllStarEventType" NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "all_star_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "all_star_games" (
    "id" TEXT NOT NULL,
    "allStarWeekendId" TEXT NOT NULL,
    "teamACaptainId" TEXT NOT NULL,
    "teamBCaptainId" TEXT NOT NULL,
    "teamAScore" INTEGER NOT NULL,
    "teamBScore" INTEGER NOT NULL,
    "mvpLeaguePlayerId" TEXT NOT NULL,

    CONSTRAINT "all_star_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "all_star_game_stats" (
    "id" TEXT NOT NULL,
    "allStarGameId" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "minutesPlayed" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "rebounds" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "steals" INTEGER NOT NULL,
    "blocks" INTEGER NOT NULL,
    "turnovers" INTEGER NOT NULL,
    "fgMade" INTEGER NOT NULL,
    "fgAttempted" INTEGER NOT NULL,
    "fg3Made" INTEGER NOT NULL,
    "fg3Attempted" INTEGER NOT NULL,
    "ftMade" INTEGER NOT NULL,
    "ftAttempted" INTEGER NOT NULL,

    CONSTRAINT "all_star_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "all_star_weekends_leagueId_season_key" ON "all_star_weekends"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "all_star_selections_allStarWeekendId_leaguePlayerId_key" ON "all_star_selections"("allStarWeekendId", "leaguePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "all_star_event_participants_allStarWeekendId_eventType_leag_key" ON "all_star_event_participants"("allStarWeekendId", "eventType", "leaguePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "all_star_games_allStarWeekendId_key" ON "all_star_games"("allStarWeekendId");

-- AddForeignKey
ALTER TABLE "all_star_weekends" ADD CONSTRAINT "all_star_weekends_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_selections" ADD CONSTRAINT "all_star_selections_allStarWeekendId_fkey" FOREIGN KEY ("allStarWeekendId") REFERENCES "all_star_weekends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_selections" ADD CONSTRAINT "all_star_selections_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_event_participants" ADD CONSTRAINT "all_star_event_participants_allStarWeekendId_fkey" FOREIGN KEY ("allStarWeekendId") REFERENCES "all_star_weekends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_event_participants" ADD CONSTRAINT "all_star_event_participants_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_games" ADD CONSTRAINT "all_star_games_allStarWeekendId_fkey" FOREIGN KEY ("allStarWeekendId") REFERENCES "all_star_weekends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_game_stats" ADD CONSTRAINT "all_star_game_stats_allStarGameId_fkey" FOREIGN KEY ("allStarGameId") REFERENCES "all_star_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "all_star_game_stats" ADD CONSTRAINT "all_star_game_stats_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
