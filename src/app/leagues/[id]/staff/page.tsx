import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { STAFF_ROLE_LABEL, COACH_STYLE_LABEL } from "@/lib/staff/labels";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { FireStaffButton } from "@/components/staff/FireStaffButton";
import type { StaffRole } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_ORDER: StaffRole[] = ["HEAD_COACH", "PLAYER_DEVELOPMENT_COACH", "MEDICAL_STAFF"];

const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  HEAD_COACH: "Sets your rotation trust and shot-selection identity, and swings win probability.",
  PLAYER_DEVELOPMENT_COACH: "Speeds up young-player growth and softens decline for aging veterans.",
  MEDICAL_STAFF: "Reduces how often injuries strike and shortens recovery time when they do.",
};

export default async function StaffPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const staff = await prisma.staff.findMany({
    where: { leagueId: league.id },
    include: { contract: true },
    orderBy: { quality: "desc" },
  });

  const myStaffByRole = new Map(
    staff.filter((s) => s.leagueTeamId === myLeagueTeamId).map((s) => [s.role, s]),
  );
  const candidatesByRole = new Map<StaffRole, typeof staff>();
  for (const s of staff) {
    if (s.leagueTeamId !== null) continue;
    const list = candidatesByRole.get(s.role) ?? [];
    list.push(s);
    candidatesByRole.set(s.role, list);
  }

  return (
    <main className="mx-auto max-w-5xl flex-1 px-6 py-16">
      <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
        &larr; Back to your team
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Staff</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your coaching and support staff have real effects on the court, not just cosmetics - hire
        and fire carefully.
      </p>

      <div className="mt-10 space-y-10">
        {ROLE_ORDER.map((role) => {
          const current = myStaffByRole.get(role);
          const candidates = (candidatesByRole.get(role) ?? []).slice(0, 8);

          return (
            <section key={role}>
              <h2 className="text-xl font-semibold text-foreground">{STAFF_ROLE_LABEL[role]}</h2>
              <p className="mt-1 text-sm text-muted">{ROLE_DESCRIPTION[role]}</p>

              {current ? (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-center gap-4">
                    <PlayerAvatar photoUrl={null} fullName={current.fullName} size="lg" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{current.fullName}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        Age {current.age} &middot;{" "}
                        {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(current.quality)]} &middot;{" "}
                        Reputation {current.reputation}
                        {current.style && ` · ${COACH_STYLE_LABEL[current.style]}`}
                      </p>
                      {current.contract && (
                        <p className="mt-1 text-xs text-muted">
                          {formatCentsCompact(current.contract.annualSalaryCents)}/yr through{" "}
                          {current.contract.endSeason}
                        </p>
                      )}
                    </div>
                  </div>
                  <FireStaffButton leagueId={league.id} staffId={current.id} />
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-muted">
                  Vacant - browse candidates below to hire.
                </div>
              )}

              {candidates.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-4 py-3">Candidate</th>
                        <th className="px-4 py-3">Age</th>
                        <th className="px-4 py-3">Tier</th>
                        <th className="px-4 py-3 text-right">Reputation</th>
                        {role === "HEAD_COACH" && <th className="px-4 py-3">Style</th>}
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id} className="border-t border-border hover:bg-surface/60">
                          <td className="px-4 py-3 font-medium text-foreground">{c.fullName}</td>
                          <td className="px-4 py-3 text-muted">{c.age}</td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(c.quality)]}
                          </td>
                          <td className="px-4 py-3 text-right text-muted">{c.reputation}</td>
                          {role === "HEAD_COACH" && (
                            <td className="px-4 py-3 text-muted">
                              {c.style ? COACH_STYLE_LABEL[c.style] : "-"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/leagues/${league.id}/staff/hire/${c.id}`}
                              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
                            >
                              Hire
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
