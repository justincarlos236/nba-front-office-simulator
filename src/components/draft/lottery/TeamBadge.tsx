import { TeamLogo } from "@/components/teams/TeamLogo";

/** Named sizes in pixels, so the mark and its empty-slot placeholder agree. */
const SIZE_PX = { sm: 24, md: 40, lg: 80, xl: 112 } as const;

export function TeamBadge({
  logoUrl,
  size = "md",
  faded = false,
}: {
  logoUrl: string | null;
  size?: keyof typeof SIZE_PX;
  faded?: boolean;
}) {
  if (!logoUrl) {
    return (
      <div
        className="shrink-0 rounded-full bg-raised"
        style={{ height: SIZE_PX[size], width: SIZE_PX[size] }}
      />
    );
  }
  return (
    <TeamLogo
      logoUrl={logoUrl}
      size={SIZE_PX[size]}
      className={`transition ${faded ? "opacity-30" : ""}`}
    />
  );
}
