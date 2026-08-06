-- CreateEnum
CREATE TYPE "ClassCharacter" AS ENUM ('TOP_HEAVY', 'DEEP_BUT_FLAT', 'INTERNATIONAL_HEAVY', 'INJURY_RIDDLED', 'WEAK_CLASS', 'BALANCED');

-- AlterTable
ALTER TABLE "draft_prospects" ADD COLUMN     "classCharacter" "ClassCharacter" NOT NULL DEFAULT 'BALANCED';
