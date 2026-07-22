-- CreateEnum
CREATE TYPE "StaffAwardCategory" AS ENUM ('COACH_OF_THE_YEAR');

-- CreateTable
CREATE TABLE "staff_awards" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "category" "StaffAwardCategory" NOT NULL,
    "staffId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "staff_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_awards_leagueId_season_idx" ON "staff_awards"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "staff_awards_leagueId_season_category_key" ON "staff_awards"("leagueId", "season", "category");

-- AddForeignKey
ALTER TABLE "staff_awards" ADD CONSTRAINT "staff_awards_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_awards" ADD CONSTRAINT "staff_awards_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
