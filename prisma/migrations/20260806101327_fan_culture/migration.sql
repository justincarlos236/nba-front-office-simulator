-- CreateTable
CREATE TABLE "fan_cultures" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "patience" INTEGER NOT NULL DEFAULT 50,
    "expectationCeiling" INTEGER NOT NULL DEFAULT 50,
    "loyalty" INTEGER NOT NULL DEFAULT 50,
    "lastRecomputedSeason" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fan_cultures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fan_cultures_leagueTeamId_key" ON "fan_cultures"("leagueTeamId");

-- CreateIndex
CREATE INDEX "fan_cultures_leagueId_idx" ON "fan_cultures"("leagueId");

-- AddForeignKey
ALTER TABLE "fan_cultures" ADD CONSTRAINT "fan_cultures_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_cultures" ADD CONSTRAINT "fan_cultures_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
