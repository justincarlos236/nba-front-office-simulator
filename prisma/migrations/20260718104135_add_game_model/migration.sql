-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "homeLeagueTeamId" TEXT NOT NULL,
    "awayLeagueTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_leagueId_season_idx" ON "games"("leagueId", "season");

-- CreateIndex
CREATE INDEX "games_leagueId_playedAt_idx" ON "games"("leagueId", "playedAt");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_homeLeagueTeamId_fkey" FOREIGN KEY ("homeLeagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_awayLeagueTeamId_fkey" FOREIGN KEY ("awayLeagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
