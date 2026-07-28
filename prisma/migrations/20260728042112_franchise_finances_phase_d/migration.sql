-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "homegrown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinedTeamSeason" INTEGER;

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "financialMandateSeason" INTEGER;
