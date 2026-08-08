-- Trade outcome surface: immutable evidence of an executed trade.

-- Frozen cap evidence, written once at execution. Cap sheets are otherwise
-- always computed live from current league state, so a revisit years later
-- would silently report today's cap as though it were the cap at trade time.
ALTER TABLE "trades" ADD COLUMN "capSnapshot" JSONB;

-- Links the narrative rows a trade generated (fan sentiment, icon departures,
-- the headline) back to the trade, so the outcome surface can reconstruct the
-- story. SetNull: deleting a trade must never destroy league news.
ALTER TABLE "league_transactions" ADD COLUMN "tradeId" TEXT;

ALTER TABLE "league_transactions"
  ADD CONSTRAINT "league_transactions_tradeId_fkey"
  FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "league_transactions_tradeId_idx" ON "league_transactions"("tradeId");
