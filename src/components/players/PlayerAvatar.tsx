"use client";

import { useState } from "react";

const SIZE_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 80,
  xl: 128,
};

const FONT_SIZE_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 26,
  xl: 42,
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/**
 * A real headshot when available (`photoUrl`), gracefully falling back to
 * a polished initials-on-gradient placeholder otherwise - never a broken
 * `<img>`. This is a real, permanent visual treatment (not a stopgap): most
 * fictional draft-generated prospects will never have a real photo, and
 * even real players occasionally fail to resolve one (see
 * `scripts/resolve-player-photos.ts`).
 */
export function PlayerAvatar({
  photoUrl,
  fullName,
  size = "md",
  teamPrimaryColor,
  className,
}: {
  photoUrl: string | null;
  fullName: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  teamPrimaryColor?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const showPhoto = photoUrl && !failed;

  const gradient = teamPrimaryColor
    ? `linear-gradient(135deg, ${teamPrimaryColor}66, ${teamPrimaryColor}1a)`
    : "linear-gradient(135deg, var(--accent), var(--accent-2))";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-border ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          width={px}
          height={px}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-semibold text-foreground"
          style={{ background: gradient, fontSize: FONT_SIZE_PX[size] }}
        >
          {getInitials(fullName)}
        </div>
      )}
    </div>
  );
}
