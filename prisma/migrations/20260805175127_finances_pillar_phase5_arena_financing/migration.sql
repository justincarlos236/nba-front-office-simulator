-- CreateEnum
CREATE TYPE "NegotiationKind" AS ENUM ('ARENA_FUNDING', 'RELOCATION_DECISION');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CapitalProjectKind" AS ENUM ('ARENA_RENOVATION', 'ARENA_NEW_BUILD', 'GLEAGUE_AFFILIATE', 'INTERNATIONAL_ACADEMY', 'PRACTICE_FACILITY', 'REAL_ESTATE_MEDIA');

-- CreateEnum
CREATE TYPE "CapitalProjectStatus" AS ENUM ('IN_PROGRESS', 'COMPLETE', 'ABANDONED');

-- AlterEnum
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'NEGOTIATION_ROUND';

-- AlterTable
ALTER TABLE "business_decisions" ADD COLUMN     "negotiationId" TEXT;

-- AlterTable
ALTER TABLE "financial_snapshots" ADD COLUMN     "interestExpenseCents" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "arenaAgeSeasons" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "arenaLeaseExpiresSeason" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "arenaQualityIndex" INTEGER NOT NULL DEFAULT 65,
ADD COLUMN     "debtCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "failedArenaNegotiations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "marketSizeOverride" "MarketSize",
ADD COLUMN     "relocatedAtSeason" INTEGER,
ADD COLUMN     "relocatedCityName" TEXT;

-- CreateTable
CREATE TABLE "negotiations" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "kind" "NegotiationKind" NOT NULL,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "season" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "totalRounds" INTEGER NOT NULL,
    "cityWillingness" INTEGER NOT NULL DEFAULT 50,
    "outcome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_projects" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "kind" "CapitalProjectKind" NOT NULL,
    "status" "CapitalProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startSeason" INTEGER NOT NULL,
    "completionSeason" INTEGER NOT NULL,
    "totalCostCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "negotiations_leagueId_leagueTeamId_status_idx" ON "negotiations"("leagueId", "leagueTeamId", "status");

-- CreateIndex
CREATE INDEX "capital_projects_leagueId_leagueTeamId_status_idx" ON "capital_projects"("leagueId", "leagueTeamId", "status");

-- AddForeignKey
ALTER TABLE "business_decisions" ADD CONSTRAINT "business_decisions_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_projects" ADD CONSTRAINT "capital_projects_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_projects" ADD CONSTRAINT "capital_projects_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
