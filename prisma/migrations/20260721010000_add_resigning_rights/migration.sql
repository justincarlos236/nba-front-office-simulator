-- AlterTable
ALTER TABLE "league_players" ADD COLUMN     "reSigningTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "league_players" ADD CONSTRAINT "league_players_reSigningTeamId_fkey" FOREIGN KEY ("reSigningTeamId") REFERENCES "league_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing rostered players hold their own current team's
-- re-signing rights (a reasonable default for saves that predate this
-- field - it only actually matters once their contract expires anyway).
UPDATE "league_players" SET "reSigningTeamId" = "leagueTeamId" WHERE "leagueTeamId" IS NOT NULL;
