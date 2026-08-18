import { TeamLogo } from "@/components/teams/TeamLogo";
import { prisma } from "@/lib/prisma";

/** A quiet, continuously-scrolling strip of every real team's crest - texture/identity behind the hero, not a functional carousel (see the /teams page for actually browsing teams). */
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
      className="relative mt-14 overflow-hidden"
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
            size={40}
            className="opacity-90 transition hover:opacity-100"
          />
        ))}
      </div>
    </div>
  );
}
