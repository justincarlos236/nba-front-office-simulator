import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Teams | NBA Front Office Simulator",
};

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: [{ conference: "asc" }, { division: "asc" }, { city: "asc" }],
    include: { _count: { select: { players: true } } },
  });

  const byConference = {
    EAST: teams.filter((t) => t.conference === "EAST"),
    WEST: teams.filter((t) => t.conference === "WEST"),
  };

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">The League</h1>
      <p className="mt-2 text-ink-muted">
        All 30 real NBA teams, seeded from reference data. Pick one to see its real roster and
        2025-26 season stats.
      </p>

      {(["EAST", "WEST"] as const).map((conference) => (
        <section key={conference} className="mt-12">
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-ink-muted uppercase">
            {conference === "EAST" ? "Eastern Conference" : "Western Conference"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byConference[conference].map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.abbreviation}`}
                className="group rounded-[2px] border border-rule bg-field p-5 transition hover:border-team-accent/40"
                style={{
                  borderLeftColor: team.primaryColor,
                  borderLeftWidth: "4px",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-muted">{team.division}</p>
                    <h3 className="font-semibold text-ink group-hover:text-team-accent">
                      {team.city} {team.name}
                    </h3>
                  </div>
                  <span className="text-xs text-ink-muted">{team._count.players} players</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
