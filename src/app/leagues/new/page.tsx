import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createLeagueAction } from "@/lib/actions/league";
import { prisma } from "@/lib/prisma";

// This page's correctness depends on request-time session + DB state (has
// this user already started a league?) - it must never serve a cached RSC
// payload from an earlier visit.
export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const existing = await prisma.league.findFirst({ where: { ownerId: session.user.id } });
  if (existing) redirect(`/leagues/${existing.id}`);

  const teams = await prisma.team.findMany({
    orderBy: [{ conference: "asc" }, { division: "asc" }, { city: "asc" }],
  });

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Pick your team</h1>
      <p className="mt-2 max-w-2xl text-muted">
        This clones the real 2023-24 snapshot into your own save: all 497 real players, real
        stat-driven ratings, and contracts generated from the valuation model. The other 29 teams
        are AI-controlled. This can&apos;t be undone once started.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <form key={team.id} action={createLeagueAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-border bg-surface p-5 text-left transition hover:border-accent/40"
              style={{ borderLeftColor: team.primaryColor, borderLeftWidth: "4px" }}
            >
              <div className="flex items-center gap-3">
                {team.logoUrl && (
                  // External SVG crest; Next's image optimizer doesn't apply to
                  // SVGs anyway, so a plain <img> avoids remote-pattern +
                  // dangerouslyAllowSVG config for no real benefit.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logoUrl} alt="" width={32} height={32} className="shrink-0" />
                )}
                <div>
                  <p className="text-xs text-muted">{team.division}</p>
                  <h3 className="font-semibold text-foreground">
                    {team.city} {team.name}
                  </h3>
                </div>
              </div>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
