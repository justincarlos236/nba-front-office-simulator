-- Phase 6 (2026-08-06) - move OwnerArchetype from League (one per save,
-- the user's own owner only) to LeagueTeam (one per team, every team
-- including CPU). Hand-written (not `prisma migrate dev`, which can't run
-- the destructive DROP COLUMN non-interactively) so the existing value can
-- be preserved on the user's own team before the old columns disappear -
-- see docs/FINANCES_PILLAR_DESIGN.md Part 8.4 and
-- scripts/backfill-owner-archetype.ts, which rolls a fresh archetype for
-- every other (CPU) team afterward.

-- AlterTable
ALTER TABLE "league_teams" ADD COLUMN     "ownerArchetype" "OwnerArchetype" NOT NULL DEFAULT 'PATIENT_BUILDER',
ADD COLUMN     "ownerArchetypeSince" INTEGER NOT NULL DEFAULT 0;

-- Preserve each league's existing owner archetype on the user's own
-- LeagueTeam row before the source columns are dropped.
UPDATE "league_teams" AS lt
SET "ownerArchetype" = l."ownerArchetype",
    "ownerArchetypeSince" = l."ownerArchetypeSince"
FROM "leagues" AS l
WHERE l."userControlledTeamId" = lt.id;

-- AlterTable
ALTER TABLE "leagues" DROP COLUMN "ownerArchetype",
DROP COLUMN "ownerArchetypeSince";
