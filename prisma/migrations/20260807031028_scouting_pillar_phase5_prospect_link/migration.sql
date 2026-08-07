-- AlterTable
ALTER TABLE "players" ADD COLUMN     "draftProspectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "players_draftProspectId_key" ON "players"("draftProspectId");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_draftProspectId_fkey" FOREIGN KEY ("draftProspectId") REFERENCES "draft_prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
