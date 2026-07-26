-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'DRAFT_SELECTION';

-- AlterTable
ALTER TABLE "draft_prospects" ADD COLUMN     "collegeOrTeam" TEXT,
ADD COLUMN     "comparisonPlayerName" TEXT,
ADD COLUMN     "heightInches" INTEGER,
ADD COLUMN     "isInternational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "weightLbs" INTEGER;

-- CreateTable
CREATE TABLE "draft_prospect_bookmarks" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "prospectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_prospect_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "draft_prospect_bookmarks_leagueId_season_idx" ON "draft_prospect_bookmarks"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "draft_prospect_bookmarks_leagueId_prospectId_key" ON "draft_prospect_bookmarks"("leagueId", "prospectId");

-- AddForeignKey
ALTER TABLE "draft_prospect_bookmarks" ADD CONSTRAINT "draft_prospect_bookmarks_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_prospect_bookmarks" ADD CONSTRAINT "draft_prospect_bookmarks_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "draft_prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
