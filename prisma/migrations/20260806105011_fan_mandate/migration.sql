-- CreateEnum
CREATE TYPE "FanMandateKind" AS ENUM ('BE_PATIENT_WITH_THE_KIDS', 'SHOW_ME_PROGRESS', 'WIN_NOW', 'CHAMPIONSHIP_OR_BUST', 'GIVE_US_A_REASON_TO_CARE');

-- CreateTable
CREATE TABLE "fan_mandates" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "primary" "FanMandateKind" NOT NULL,
    "keepOurGuy" BOOLEAN NOT NULL DEFAULT false,
    "keepOurGuyPlayerId" TEXT,
    "satisfaction" INTEGER NOT NULL DEFAULT 50,
    "lastRecomputedSeason" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fan_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fan_mandates_leagueTeamId_key" ON "fan_mandates"("leagueTeamId");

-- CreateIndex
CREATE INDEX "fan_mandates_leagueId_idx" ON "fan_mandates"("leagueId");

-- AddForeignKey
ALTER TABLE "fan_mandates" ADD CONSTRAINT "fan_mandates_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_mandates" ADD CONSTRAINT "fan_mandates_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_mandates" ADD CONSTRAINT "fan_mandates_keepOurGuyPlayerId_fkey" FOREIGN KEY ("keepOurGuyPlayerId") REFERENCES "league_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
