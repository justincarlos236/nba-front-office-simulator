-- CreateEnum
CREATE TYPE "CareerEndReason" AS ENUM ('FIRED', 'RETIRED');

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "totalPayrollPaidCents" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "endReason" "CareerEndReason",
ADD COLUMN     "endedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gmReputation" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "career_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT,
    "teamLabel" TEXT NOT NULL,
    "seasons" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "championships" INTEGER NOT NULL,
    "playoffAppearances" INTEGER NOT NULL,
    "bestPlayoffFinish" TEXT NOT NULL,
    "careerEarningsCents" BIGINT NOT NULL,
    "notableTradeDescription" TEXT,
    "endReason" "CareerEndReason" NOT NULL,
    "finalOwnerConfidence" INTEGER NOT NULL,
    "reputationDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_records_userId_idx" ON "career_records"("userId");

-- AddForeignKey
ALTER TABLE "career_records" ADD CONSTRAINT "career_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_records" ADD CONSTRAINT "career_records_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
