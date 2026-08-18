import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TeamLogo } from "@/components/teams/TeamLogo";

/**
 * THE WIRE - the league, at full size, near the top.
 *
 * The crests used to scroll past under the hero at 40px with the colour drained
 * out, which is the "trusted by" band every product ships and left most of the
 * league as unreadable grey smudges. Moving them to the closing section fixed
 * the wrong problem: it made them meaningful and simultaneously guaranteed
 * nobody would scroll far enough to see them.
 *
 * They belong high and they belong legible. Thirty real franchises in their own
 * colours is the most visually dense thing this product owns, it is real data
 * rather than decoration, and it answers the only question a visitor actually
 * has on this page: which of these do I get to run. Every crest is a link, so
 * the section is the choice rather than a picture of it.
 */
export async function LeagueWall() {
  const teams = await prisma.team.findMany({
    orderBy: [{ conference: "asc" }, { city: "asc" }],
    select: { id: true, abbreviation: true, city: true, name: true, logoUrl: true },
  });
  if (teams.length === 0) return null;

  return (
    <section className="border-b border-rule bg-field/40">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Thirty jobs are open.
        </h2>
        <p className="mt-3 text-ink-muted">
          Pick the one you want. You can only hold one at a time.
        </p>

        <ul className="mt-10 grid grid-cols-3 gap-px border border-rule bg-rule sm:grid-cols-5 lg:grid-cols-6">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.abbreviation}`}
                className="group flex aspect-[5/4] flex-col items-center justify-center gap-2.5 bg-ground px-2 transition hover:bg-raised"
                title={`${team.city} ${team.name}`}
              >
                <TeamLogo
                  logoUrl={team.logoUrl}
                  size={56}
                  className="opacity-90 transition group-hover:opacity-100"
                />
                <span className="font-mono text-[11px] tracking-[0.09em] text-ink-muted transition group-hover:text-ink">
                  {team.abbreviation}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
