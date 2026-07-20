import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createLeagueAction } from "@/lib/actions/league";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";
import { prisma } from "@/lib/prisma";

// This page's correctness depends on request-time session + DB state (has
// this user already started a league?) - it must never serve a cached RSC
// payload from an earlier visit.
export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const existingLeagues = await prisma.league.findMany({
    where: { ownerId: session.user.id },
    include: { teams: { include: { team: true } } },
  });

  if (existingLeagues.length >= MAX_LEAGUES_PER_USER) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pick your team</h1>
        <p className="mt-4 text-muted">
          You&apos;ve reached the {MAX_LEAGUES_PER_USER}-franchise limit. Manage your existing
          franchises from{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            My Leagues
          </Link>
          .
        </p>
      </main>
    );
  }

  const runningTeamIds = new Set(
    existingLeagues
      .map((l) => l.teams.find((lt) => lt.id === l.userControlledTeamId)?.teamId)
      .filter((id): id is string => Boolean(id)),
  );

  const teams = await prisma.team.findMany({
    orderBy: [{ conference: "asc" }, { city: "asc" }],
  });
  const eastTeams = teams.filter((team) => team.conference === "EAST");
  const westTeams = teams.filter((team) => team.conference === "WEST");

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pick your team</h1>
        {existingLeagues.length > 0 && (
          <Link
            href="/leagues"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            My Leagues
          </Link>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        This clones the real 2023-24 snapshot into your own save: all 497 real players, real
        stat-driven ratings, and contracts generated from the valuation model. The other 29 teams
        are AI-controlled. This can&apos;t be undone once started. You can run up to{" "}
        {MAX_LEAGUES_PER_USER} franchises at once
        {existingLeagues.length > 0 ? " (including this one)" : ""}.
      </p>

      <TeamRow title="Eastern Conference" teams={eastTeams} runningTeamIds={runningTeamIds} />
      <TeamRow title="Western Conference" teams={westTeams} runningTeamIds={runningTeamIds} />
    </main>
  );
}

function TeamRow({
  title,
  teams,
  runningTeamIds,
}: {
  title: string;
  teams: {
    id: string;
    city: string;
    name: string;
    logoUrl: string | null;
    primaryColor: string;
  }[];
  runningTeamIds: Set<string>;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <h3 className="font-semibold text-foreground">
                    {team.city} {team.name}
                  </h3>
                  {runningTeamIds.has(team.id) && (
                    <p className="text-xs text-muted">You already run this team elsewhere</p>
                  )}
                </div>
              </div>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
