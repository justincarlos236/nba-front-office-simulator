-- CreateEnum
CREATE TYPE "FanSentimentKind" AS ENUM ('TRADE', 'SIGNING', 'WIN_STREAK', 'LOSS_STREAK', 'INJURY', 'INJURY_RECOVERY', 'STAFF_CHANGE', 'ROTATION_CHANGE', 'AWARD', 'ALL_STAR_SELECTION', 'ALL_STAR_SNUB', 'ALL_STAR_RESULT', 'DRAFT_LOTTERY', 'ICON_DEPARTURE', 'BUSINESS_DECISION', 'DISTRESSED_FINANCING', 'SEASON_RESULT');

-- CreateTable
CREATE TABLE "fan_sentiment_events" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL DEFAULT 0,
    "kind" "FanSentimentKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "leaguePlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fan_sentiment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fan_sentiment_events_leagueId_leagueTeamId_season_idx" ON "fan_sentiment_events"("leagueId", "leagueTeamId", "season");

-- CreateIndex
CREATE INDEX "fan_sentiment_events_leagueId_leagueTeamId_season_dayIndex_idx" ON "fan_sentiment_events"("leagueId", "leagueTeamId", "season", "dayIndex");

-- AddForeignKey
ALTER TABLE "fan_sentiment_events" ADD CONSTRAINT "fan_sentiment_events_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_sentiment_events" ADD CONSTRAINT "fan_sentiment_events_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_sentiment_events" ADD CONSTRAINT "fan_sentiment_events_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
