import { TeamLogo } from "@/components/teams/TeamLogo";
import { prisma } from "@/lib/prisma";

/**
 * Every club's crest, scrolling once through and repeating.
 *
 * Not a carousel - the /teams page is where clubs are actually browsed. This
 * exists to make "thirty jobs" concrete, which is why it now sits under that
 * claim rather than under the hero.
 *
 * It used to draw at 40px, half opacity and fully desaturated, which left most
 * of the league as unreadable grey smudges - the Spurs wordmark and the Jazz
 * mark in particular. Drawn larger and in their own colours they are legible,
 * and a wall of real franchises says more than any sentence about scope could.
 */
export async function TeamLogoMarquee() {
  const teams = await prisma.team.findMany({
    orderBy: [{ conference: "asc" }, { city: "asc" }],
    select: { id: true, logoUrl: true },
  });
  const logos = teams.filter((t) => t.logoUrl);
  if (logos.length === 0) return null;

  // Rendered twice back-to-back so the CSS animation can scroll exactly
  // one copy's width and loop seamlessly.
  const track = [...logos, ...logos];

  return (
    <div
      className="relative mt-12 overflow-hidden"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div className="animate-logo-marquee flex w-max items-center gap-12">
        {track.map((team, i) => (
          <TeamLogo
            key={`${team.id}-${i}`}
            logoUrl={team.logoUrl}
            size={44}
            className="opacity-80 transition hover:opacity-100"
          />
        ))}
      </div>
    </div>
  );
}
