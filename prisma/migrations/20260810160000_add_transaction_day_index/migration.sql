-- The day of the season a story belongs to, matching games.day_index.
--
-- Additive and nullable on purpose: rows written before this column existed
-- keep NULL, as does every story with no game day (offseason moves, the
-- draft, finance reports). Nothing is backfilled - inventing a day for a
-- historical row would be fabricating when it happened.
--
-- Needed because created_at cannot group stories by day: simulation writes
-- hundreds of rows in one createMany, so they share a timestamp.
ALTER TABLE "league_transactions" ADD COLUMN "dayIndex" INTEGER;

CREATE INDEX "league_transactions_leagueId_season_dayIndex_idx"
  ON "league_transactions"("leagueId", "season", "dayIndex");
