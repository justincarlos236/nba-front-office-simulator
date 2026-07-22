-- CreateEnum
CREATE TYPE "NewsImportance" AS ENUM ('MINOR', 'STANDARD', 'MAJOR', 'BREAKING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'GAME_MILESTONE';
ALTER TYPE "TransactionType" ADD VALUE 'WIN_STREAK';
ALTER TYPE "TransactionType" ADD VALUE 'GAME_RESULT';

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "league_transactions" ADD COLUMN     "importance" "NewsImportance" NOT NULL DEFAULT 'STANDARD';
