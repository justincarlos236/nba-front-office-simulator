-- CreateEnum
CREATE TYPE "SponsorshipDealKind" AS ENUM ('JERSEY_PATCH', 'ARENA_NAMING_RIGHTS', 'APPAREL_PARTNER', 'INTERNATIONAL_PARTNERSHIP');

-- CreateEnum
CREATE TYPE "SponsorshipDealStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SPONSORSHIP_BET_ON_YOURSELF';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SPONSORSHIP_STAR_CLAUSE';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SPONSORSHIP_UNPOPULAR_MONEY';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SPONSORSHIP_EQUITY_SWAP';

-- AlterTable
ALTER TABLE "financial_snapshots" ADD COLUMN     "sponsorshipRevenueCents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sponsorship_deals" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "kind" "SponsorshipDealKind" NOT NULL,
    "label" TEXT NOT NULL,
    "annualValueCents" BIGINT NOT NULL,
    "startSeason" INTEGER NOT NULL,
    "endSeason" INTEGER NOT NULL,
    "conditionLeaguePlayerId" TEXT,
    "franchiseValueUpsideFraction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SponsorshipDealStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsorship_deals_leagueId_leagueTeamId_status_idx" ON "sponsorship_deals"("leagueId", "leagueTeamId", "status");

-- CreateIndex
CREATE INDEX "sponsorship_deals_conditionLeaguePlayerId_idx" ON "sponsorship_deals"("conditionLeaguePlayerId");

-- AddForeignKey
ALTER TABLE "sponsorship_deals" ADD CONSTRAINT "sponsorship_deals_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_deals" ADD CONSTRAINT "sponsorship_deals_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_deals" ADD CONSTRAINT "sponsorship_deals_conditionLeaguePlayerId_fkey" FOREIGN KEY ("conditionLeaguePlayerId") REFERENCES "league_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
