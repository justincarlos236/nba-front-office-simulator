-- CreateEnum
CREATE TYPE "FanNarrativeKind" AS ENUM ('ICON_DEPARTURE_FALLOUT', 'REBUILD_PROGRESS_WATCH', 'CHAMPIONSHIP_WINDOW_WATCH');

-- CreateEnum
CREATE TYPE "FanNarrativeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "fan_narratives" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "kind" "FanNarrativeKind" NOT NULL,
    "status" "FanNarrativeStatus" NOT NULL DEFAULT 'OPEN',
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "openedSeason" INTEGER NOT NULL,
    "openedDayIndex" INTEGER NOT NULL DEFAULT 0,
    "resolvedSeason" INTEGER,
    "resolutionBeat" TEXT,
    "leaguePlayerId" TEXT,

    CONSTRAINT "fan_narratives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fan_narratives_leagueId_leagueTeamId_status_idx" ON "fan_narratives"("leagueId", "leagueTeamId", "status");

-- AddForeignKey
ALTER TABLE "fan_narratives" ADD CONSTRAINT "fan_narratives_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_narratives" ADD CONSTRAINT "fan_narratives_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_narratives" ADD CONSTRAINT "fan_narratives_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
