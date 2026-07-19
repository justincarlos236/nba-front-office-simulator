-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('REGULAR_SEASON', 'PLAY_IN', 'PLAYOFF');

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "type" "GameType" NOT NULL DEFAULT 'REGULAR_SEASON';

-- CreateTable
CREATE TABLE "playoff_series" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "conference" "Conference",
    "higherSeedTeamId" TEXT NOT NULL,
    "lowerSeedTeamId" TEXT NOT NULL,
    "winsNeeded" INTEGER NOT NULL DEFAULT 4,
    "higherSeedWins" INTEGER NOT NULL DEFAULT 0,
    "lowerSeedWins" INTEGER NOT NULL DEFAULT 0,
    "winnerTeamId" TEXT,

    CONSTRAINT "playoff_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playoff_series_leagueId_season_round_idx" ON "playoff_series"("leagueId", "season", "round");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "playoff_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_higherSeedTeamId_fkey" FOREIGN KEY ("higherSeedTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_lowerSeedTeamId_fkey" FOREIGN KEY ("lowerSeedTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "league_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
