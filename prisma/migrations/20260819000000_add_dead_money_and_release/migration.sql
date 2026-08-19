-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_RELEASE';

-- CreateTable
CREATE TABLE "dead_money" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "playerName" TEXT NOT NULL,
    "waivedSeason" INTEGER NOT NULL,

    CONSTRAINT "dead_money_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dead_money_leagueTeamId_season_idx" ON "dead_money"("leagueTeamId", "season");

-- CreateIndex
CREATE INDEX "dead_money_leagueId_season_idx" ON "dead_money"("leagueId", "season");

-- AddForeignKey
ALTER TABLE "dead_money" ADD CONSTRAINT "dead_money_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

