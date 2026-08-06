-- CreateEnum
CREATE TYPE "ScoutingAssignmentKind" AS ENUM ('FOCUSED_LOOK', 'SWEEP', 'PRIVATE_WORKOUT');

-- CreateTable
CREATE TABLE "scouting_assignment_spends" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "kind" "ScoutingAssignmentKind" NOT NULL,
    "cost" INTEGER NOT NULL,
    "prospectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scouting_assignment_spends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scouting_assignment_spends_leagueId_season_leagueTeamId_idx" ON "scouting_assignment_spends"("leagueId", "season", "leagueTeamId");

-- AddForeignKey
ALTER TABLE "scouting_assignment_spends" ADD CONSTRAINT "scouting_assignment_spends_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
