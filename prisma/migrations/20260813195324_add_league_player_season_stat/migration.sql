-- CreateTable
CREATE TABLE "league_player_season_stats" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "gameType" "GameType" NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
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
    "highPoints" INTEGER NOT NULL,
    "highRebounds" INTEGER NOT NULL,
    "highAssists" INTEGER NOT NULL,
    "highSteals" INTEGER NOT NULL,
    "highBlocks" INTEGER NOT NULL,

    CONSTRAINT "league_player_season_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "league_player_season_stats_leagueId_season_idx" ON "league_player_season_stats"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "league_player_season_stats_leaguePlayerId_season_gameType_key" ON "league_player_season_stats"("leaguePlayerId", "season", "gameType");

-- AddForeignKey
ALTER TABLE "league_player_season_stats" ADD CONSTRAINT "league_player_season_stats_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_player_season_stats" ADD CONSTRAINT "league_player_season_stats_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
