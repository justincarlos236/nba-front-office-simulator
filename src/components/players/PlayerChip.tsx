"use client";

import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { usePlayerProfile } from "@/components/players/PlayerProfileProvider";
import type { PlayerProfileIdentity } from "@/lib/players/profileData";

/**
 * The one reusable "player is shown here" element - headshot + name,
 * entirely clickable, opening the same profile drawer from anywhere in the
 * app. A small `"use client"` leaf (like `RosterScatterChart`), so it drops
 * into otherwise-server-rendered pages without forcing the whole page to
 * become a client component.
 */
export function PlayerChip({
  identity,
  fullName,
  photoUrl,
  teamPrimaryColor,
  size = "sm",
  className,
}: {
  identity: PlayerProfileIdentity;
  fullName: string;
  photoUrl: string | null;
  teamPrimaryColor?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const { openPlayerProfile } = usePlayerProfile();

  return (
    <button
      type="button"
      onClick={() => openPlayerProfile(identity)}
      className={`inline-flex items-center gap-3 text-left hover:text-accent ${className ?? ""}`}
    >
      <PlayerAvatar
        photoUrl={photoUrl}
        fullName={fullName}
        size={size}
        teamPrimaryColor={teamPrimaryColor}
      />
      <span>{fullName}</span>
    </button>
  );
}
