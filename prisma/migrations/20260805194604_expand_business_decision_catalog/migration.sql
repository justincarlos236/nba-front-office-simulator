-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessDecisionKind" ADD VALUE 'HOT_STREAK_MEDIA_FEATURE';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'MOMENTUM_MERCHANDISE_SURGE';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'BANDWAGON_SPONSOR_INTEREST';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SEASON_TICKET_HOLDER_BACKLASH';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'BOOSTER_CLUB_PATIENCE_TEST';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'LOCAL_MEDIA_CRITICISM_CYCLE';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'PLAYOFF_PUSH_TICKET_DEMAND';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'NATIONAL_TV_SLOT_REQUEST';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'PLAYOFF_WATCH_PARTY_PROPOSAL';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'TANK_WATCH_FAN_FRUSTRATION';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'REBUILD_PATIENCE_APPEAL';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'SIGNATURE_WIN_HIGHLIGHT_DEAL';
ALTER TYPE "BusinessDecisionKind" ADD VALUE 'EMBARRASSING_LOSS_DAMAGE_CONTROL';
