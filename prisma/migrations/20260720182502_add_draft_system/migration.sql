-- AlterTable
ALTER TABLE "draft_picks" ADD COLUMN     "overallPickNumber" INTEGER,
ADD COLUMN     "selectedProspectId" TEXT;

-- CreateTable
CREATE TABLE "draft_prospects" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "age" INTEGER NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "potentialRating" INTEGER NOT NULL,

    CONSTRAINT "draft_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "draft_prospects_leagueId_season_idx" ON "draft_prospects"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_selectedProspectId_key" ON "draft_picks"("selectedProspectId");

-- CreateIndex
CREATE INDEX "draft_picks_leagueId_season_overallPickNumber_idx" ON "draft_picks"("leagueId", "season", "overallPickNumber");

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_selectedProspectId_fkey" FOREIGN KEY ("selectedProspectId") REFERENCES "draft_prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_prospects" ADD CONSTRAINT "draft_prospects_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

