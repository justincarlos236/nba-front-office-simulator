-- CreateEnum
CREATE TYPE "ProspectPathway" AS ENUM ('POWER_CONFERENCE', 'MID_MAJOR', 'INTERNATIONAL_PROFESSIONAL', 'DEVELOPMENT_PATHWAY');

-- AlterTable
ALTER TABLE "draft_prospects" ADD COLUMN     "pathway" "ProspectPathway",
ADD COLUMN     "resolvedHiddenTraits" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "pathway" "ProspectPathway";
