-- CreateEnum
CREATE TYPE "BusinessDecisionKind" AS ENUM ('SPONSOR_PULLOUT', 'ARENA_SYSTEMS_FAILURE', 'TICKETING_SCANDAL', 'LEAGUE_REVENUE_DOWNTURN', 'INTERNATIONAL_PRESEASON_GAME', 'DOCUMENTARY_CREW', 'JERSEY_REDESIGN', 'MERCHANDISE_PUSH');

-- CreateEnum
CREATE TYPE "BusinessDecisionStatus" AS ENUM ('PENDING', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BusinessLedgerCategory" AS ENUM ('EVENT_INCOME', 'EVENT_EXPENSE');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'BUSINESS_DECISION';

-- AlterTable
ALTER TABLE "financial_snapshots" ADD COLUMN     "otherExpenseCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "otherIncomeCents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "business_decisions" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "kind" "BusinessDecisionKind" NOT NULL,
    "severity" "NewsImportance" NOT NULL,
    "status" "BusinessDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "defaultOptionId" TEXT NOT NULL,
    "deadlineDayIndex" INTEGER NOT NULL,
    "resolvedOptionId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_ledger_entries" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "category" "BusinessLedgerCategory" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "businessDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_decisions_leagueId_leagueTeamId_status_idx" ON "business_decisions"("leagueId", "leagueTeamId", "status");

-- CreateIndex
CREATE INDEX "business_ledger_entries_leagueId_leagueTeamId_season_idx" ON "business_ledger_entries"("leagueId", "leagueTeamId", "season");

-- AddForeignKey
ALTER TABLE "business_decisions" ADD CONSTRAINT "business_decisions_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_decisions" ADD CONSTRAINT "business_decisions_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ledger_entries" ADD CONSTRAINT "business_ledger_entries_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ledger_entries" ADD CONSTRAINT "business_ledger_entries_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ledger_entries" ADD CONSTRAINT "business_ledger_entries_businessDecisionId_fkey" FOREIGN KEY ("businessDecisionId") REFERENCES "business_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
