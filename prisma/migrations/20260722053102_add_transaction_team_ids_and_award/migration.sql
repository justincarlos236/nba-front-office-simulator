-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'AWARD';

-- AlterTable
ALTER TABLE "league_transactions" ADD COLUMN     "teamIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
