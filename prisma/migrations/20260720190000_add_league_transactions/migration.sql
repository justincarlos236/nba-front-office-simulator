
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TRADE', 'SIGNING', 'RETIREMENT');

-- CreateTable
CREATE TABLE "league_transactions" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "league_transactions_leagueId_createdAt_idx" ON "league_transactions"("leagueId", "createdAt");

-- AddForeignKey
ALTER TABLE "league_transactions" ADD CONSTRAINT "league_transactions_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

