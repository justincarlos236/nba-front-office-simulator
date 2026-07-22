-- CreateTable
CREATE TABLE "player_game_stats" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "gameType" "GameType" NOT NULL,
    "minutesPlayed" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "rebounds" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "steals" INTEGER NOT NULL,
    "blocks" INTEGER NOT NULL,
    "turnovers" INTEGER NOT NULL,
    "fgMade" INTEGER NOT NULL,
    "fgAttempted" INTEGER NOT NULL,
    "fg3Made" INTEGER NOT NULL,
    "fg3Attempted" INTEGER NOT NULL,
    "ftMade" INTEGER NOT NULL,
    "ftAttempted" INTEGER NOT NULL,

    CONSTRAINT "player_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_game_stats_leaguePlayerId_season_idx" ON "player_game_stats"("leaguePlayerId", "season");

-- CreateIndex
CREATE INDEX "player_game_stats_gameId_idx" ON "player_game_stats"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_stats_gameId_leaguePlayerId_key" ON "player_game_stats"("gameId", "leaguePlayerId");

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
