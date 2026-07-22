-- CreateEnum
CREATE TYPE "MarketSize" AS ENUM ('LARGE', 'MID', 'SMALL');

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "fanHappiness" INTEGER NOT NULL DEFAULT 65;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "marketSize" "MarketSize" NOT NULL DEFAULT 'MID';

-- CreateTable
CREATE TABLE "fan_happiness_snapshots" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "fanHappiness" INTEGER NOT NULL,
    "attendancePct" DOUBLE PRECISION NOT NULL,
    "franchisePopularity" INTEGER NOT NULL,

    CONSTRAINT "fan_happiness_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fan_happiness_snapshots_leagueId_leagueTeamId_idx" ON "fan_happiness_snapshots"("leagueId", "leagueTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "fan_happiness_snapshots_leagueId_leagueTeamId_season_key" ON "fan_happiness_snapshots"("leagueId", "leagueTeamId", "season");

-- AddForeignKey
ALTER TABLE "fan_happiness_snapshots" ADD CONSTRAINT "fan_happiness_snapshots_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_happiness_snapshots" ADD CONSTRAINT "fan_happiness_snapshots_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
