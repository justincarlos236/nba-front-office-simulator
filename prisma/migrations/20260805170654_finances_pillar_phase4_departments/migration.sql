-- CreateEnum
CREATE TYPE "DepartmentLevel" AS ENUM ('MINIMAL', 'LOW', 'STANDARD', 'HIGH', 'MAXIMUM');

-- AlterTable
ALTER TABLE "league_teams" DROP COLUMN "facilitiesInvestment",
DROP COLUMN "medicalInvestment",
ADD COLUMN     "analyticsLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "coachingSupportLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "marketingLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "playerDevelopmentLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "scoutingLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "seasonTicketBase" INTEGER NOT NULL DEFAULT 65,
ADD COLUMN     "sportsScienceLevel" "DepartmentLevel" NOT NULL DEFAULT 'STANDARD';

-- DropEnum
DROP TYPE "InvestmentLevel";
