-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AwardCategory" ADD VALUE 'DEFENSIVE_PLAYER_OF_THE_YEAR';
ALTER TYPE "AwardCategory" ADD VALUE 'SIXTH_MAN_OF_THE_YEAR';
