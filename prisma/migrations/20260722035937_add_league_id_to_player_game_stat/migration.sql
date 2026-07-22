-- AlterTable (nullable first - backfilled below, then made required)
ALTER TABLE "player_game_stats" ADD COLUMN     "leagueId" TEXT;

-- Backfill from the related LeaguePlayer, which already has the real leagueId
UPDATE "player_game_stats" pgs
SET "leagueId" = lp."leagueId"
FROM "league_players" lp
WHERE lp.id = pgs."leaguePlayerId";

-- AlterTable (now safe to require)
ALTER TABLE "player_game_stats" ALTER COLUMN "leagueId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "player_game_stats_leagueId_season_idx" ON "player_game_stats"("leagueId", "season");

-- AddForeignKey
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
