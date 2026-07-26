-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'DRAFT_LOTTERY';

-- CreateTable
CREATE TABLE "lottery_results" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "originalTeamId" TEXT NOT NULL,
    "currentOwnerId" TEXT NOT NULL,
    "projectedSeed" INTEGER NOT NULL,
    "resultPickNumber" INTEGER NOT NULL,
    "oddsForNumberOnePickPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "lottery_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lottery_results_leagueId_season_idx" ON "lottery_results"("leagueId", "season");

-- AddForeignKey
ALTER TABLE "lottery_results" ADD CONSTRAINT "lottery_results_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_results" ADD CONSTRAINT "lottery_results_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_results" ADD CONSTRAINT "lottery_results_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
