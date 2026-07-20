
-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'INJURY';

-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "injuryReturnsAtGamesPlayed" INTEGER;

