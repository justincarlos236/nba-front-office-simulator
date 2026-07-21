-- CreateEnum
CREATE TYPE "GmPersonality" AS ENUM ('AGGRESSIVE', 'CONSERVATIVE', 'WIN_NOW', 'PROSPECT_LOVER', 'PICK_HOARDER', 'SALARY_CONSCIOUS', 'BALANCED');

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "gmPersonality" "GmPersonality" NOT NULL DEFAULT 'BALANCED';

-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "careerGamesMissedToInjury" INTEGER NOT NULL DEFAULT 0;

