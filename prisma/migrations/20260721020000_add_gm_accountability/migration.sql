
-- CreateEnum
CREATE TYPE "ExpectationLevel" AS ENUM ('DEVELOP_YOUNG_PLAYERS', 'COMPETE_FOR_PLAY_IN', 'MAKE_PLAYOFFS', 'WIN_PLAYOFF_SERIES', 'DEEP_PLAYOFF_RUN', 'CHAMPIONSHIP_CONTENTION');

-- CreateEnum
CREATE TYPE "EvaluationVerdict" AS ENUM ('EXCEEDED', 'MET', 'FELL_SHORT', 'DRASTICALLY_FELL_SHORT');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'OWNERSHIP_MESSAGE';

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "ownerConfidence" INTEGER NOT NULL DEFAULT 65,
ADD COLUMN     "payrollDirectiveSeason" INTEGER,
ADD COLUMN     "payrollReductionTargetCents" BIGINT;

-- CreateTable
CREATE TABLE "season_expectations" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "expectationLevel" "ExpectationLevel" NOT NULL,
    "actualResultLabel" TEXT,
    "verdict" "EvaluationVerdict",
    "ownerConfidenceDelta" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_expectations_leagueId_season_key" ON "season_expectations"("leagueId", "season");

-- AddForeignKey
ALTER TABLE "season_expectations" ADD CONSTRAINT "season_expectations_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

