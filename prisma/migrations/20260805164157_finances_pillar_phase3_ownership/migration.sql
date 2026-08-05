-- CreateEnum
CREATE TYPE "OwnerArchetype" AS ENUM ('WIN_NOW_BILLIONAIRE', 'PENNY_PINCHER', 'PATIENT_BUILDER', 'ABSENTEE', 'MEDDLER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessDecisionKind" ADD VALUE 'OWNERSHIP_PAYROLL_NEGOTIATION';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'OWNERSHIP_FINANCIAL_NEGOTIATION';

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "financialMandateStaked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerArchetype" "OwnerArchetype" NOT NULL DEFAULT 'PATIENT_BUILDER',
ADD COLUMN     "ownerArchetypeSince" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payrollDirectiveStaked" BOOLEAN NOT NULL DEFAULT false;
