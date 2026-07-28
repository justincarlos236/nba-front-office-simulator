-- CreateEnum
CREATE TYPE "TicketPricingPosture" AS ENUM ('FAN_FRIENDLY', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "InvestmentLevel" AS ENUM ('MINIMAL', 'STANDARD', 'PREMIUM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'FINANCIAL_REPORT';
ALTER TYPE "TransactionType" ADD VALUE 'FRANCHISE_MILESTONE';

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "cashReserveCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "facilitiesInvestment" "InvestmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "franchiseValueCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "medicalInvestment" "InvestmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "ticketPricingPosture" "TicketPricingPosture" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "ticketRevenueCents" BIGINT NOT NULL,
    "mediaRevenueCents" BIGINT NOT NULL,
    "playoffRevenueCents" BIGINT NOT NULL,
    "leagueRevenueCents" BIGINT NOT NULL,
    "payrollExpenseCents" BIGINT NOT NULL,
    "luxuryTaxExpenseCents" BIGINT NOT NULL,
    "staffExpenseCents" BIGINT NOT NULL,
    "investmentExpenseCents" BIGINT NOT NULL,
    "operatingExpenseCents" BIGINT NOT NULL,
    "netIncomeCents" BIGINT NOT NULL,
    "cashReserveCents" BIGINT NOT NULL,
    "franchiseValueCents" BIGINT NOT NULL,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_snapshots_leagueId_leagueTeamId_idx" ON "financial_snapshots"("leagueId", "leagueTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_snapshots_leagueId_leagueTeamId_season_key" ON "financial_snapshots"("leagueId", "leagueTeamId", "season");

-- AddForeignKey
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
