-- CreateEnum
CREATE TYPE "AwardCategory" AS ENUM ('MVP', 'ROOKIE_OF_THE_YEAR', 'MOST_IMPROVED_PLAYER');

-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "retiredSeason" INTEGER;

-- CreateTable
CREATE TABLE "season_awards" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "category" "AwardCategory" NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "season_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "season_awards_leagueId_season_idx" ON "season_awards"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "season_awards_leagueId_season_category_key" ON "season_awards"("leagueId", "season", "category");

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
