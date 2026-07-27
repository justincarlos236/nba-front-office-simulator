-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_MORALE';

-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "morale" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "tradeRequestActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tradeRequestSince" INTEGER;

-- AlterTable
ALTER TABLE "league_transactions" ADD COLUMN     "subjectLeaguePlayerId" TEXT;

-- CreateTable
CREATE TABLE "player_personality_profiles" (
    "id" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "competitiveness" INTEGER NOT NULL,
    "roleSensitivity" INTEGER NOT NULL,
    "loyalty" INTEGER NOT NULL,
    "financialMotivation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_personality_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_personality_profiles_leaguePlayerId_key" ON "player_personality_profiles"("leaguePlayerId");

-- CreateIndex
CREATE INDEX "league_transactions_subjectLeaguePlayerId_idx" ON "league_transactions"("subjectLeaguePlayerId");

-- AddForeignKey
ALTER TABLE "player_personality_profiles" ADD CONSTRAINT "player_personality_profiles_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
