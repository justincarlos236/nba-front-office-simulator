-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('HEAD_COACH', 'PLAYER_DEVELOPMENT_COACH', 'MEDICAL_STAFF');

-- CreateEnum
CREATE TYPE "CoachStyle" AS ENUM ('PACE_AND_SPACE', 'BALANCED', 'GRIND_IT_OUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'STAFF_HIRE';
ALTER TYPE "TransactionType" ADD VALUE 'STAFF_FIRE';

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT,
    "role" "StaffRole" NOT NULL,
    "fullName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "style" "CoachStyle",

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_contracts" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "signedSeason" INTEGER NOT NULL,
    "startSeason" INTEGER NOT NULL,
    "endSeason" INTEGER NOT NULL,
    "annualSalaryCents" BIGINT NOT NULL,

    CONSTRAINT "staff_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_leagueId_leagueTeamId_idx" ON "staff"("leagueId", "leagueTeamId");

-- CreateIndex
CREATE INDEX "staff_leagueId_role_idx" ON "staff"("leagueId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "staff_contracts_staffId_key" ON "staff_contracts"("staffId");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_contracts" ADD CONSTRAINT "staff_contracts_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_contracts" ADD CONSTRAINT "staff_contracts_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
