import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeStaffSalary } from "@/lib/staff/generateStaff";
import { computeMinAcceptableStaffOfferCents } from "@/lib/staff/hireValidation";
import { STAFF_ROLE_LABEL, COACH_STYLE_LABEL } from "@/lib/staff/labels";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { HireStaffForm } from "@/components/staff/HireStaffForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; staffId: string }>;
}

export default async function HireStaffPage({ params }: PageProps) {
  const { id, staffId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const candidate = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!candidate || candidate.leagueId !== league.id || candidate.leagueTeamId !== null) {
    notFound();
  }

  const fairSalaryCents = computeStaffSalary(candidate.role, candidate.quality);
  const minAcceptableCents = computeMinAcceptableStaffOfferCents(candidate.role, candidate.quality);

  return (
    <main className="mx-auto max-w-2xl flex-1 px-6 py-16">
      <Link
        href={`/leagues/${league.id}/staff`}
        className="text-sm text-muted hover:text-foreground"
      >
        &larr; All staff
      </Link>
      <div className="mt-4 flex items-center gap-4">
        <PlayerAvatar photoUrl={null} fullName={candidate.fullName} size="lg" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Hire {candidate.fullName}
          </h1>
          <p className="mt-2 text-muted">
            {STAFF_ROLE_LABEL[candidate.role]} &middot; Age {candidate.age} &middot;{" "}
            {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(candidate.quality)]} &middot; Reputation{" "}
            {candidate.reputation}
            {candidate.style && ` · ${COACH_STYLE_LABEL[candidate.style]}`}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <HireStaffForm
          leagueId={league.id}
          staffId={candidate.id}
          suggestedAnnualSalaryCents={fairSalaryCents.toString()}
          minAcceptableAnnualSalaryCents={minAcceptableCents.toString()}
        />
      </div>
    </main>
  );
}
