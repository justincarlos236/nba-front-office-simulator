-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'ROTATION_CHANGE';

-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "rotationSlot" INTEGER,
ADD COLUMN     "targetMinutesPerGame" INTEGER;
