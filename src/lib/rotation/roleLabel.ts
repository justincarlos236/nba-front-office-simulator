/**
 * Derives a human-readable role from a player's resolved depth-chart rank
 * rather than a separately curated field - satisfies Roadmap #33 ("Player
 * Roles": Starter/Sixth Man/Rotation Player/Bench Player) as a byproduct of
 * Rotation Management instead of a second system to keep in sync.
 */
export type RotationRole = "STARTER" | "SIXTH_MAN" | "ROTATION_PLAYER" | "BENCH_PLAYER";

export const ROTATION_ROLE_LABEL: Record<RotationRole, string> = {
  STARTER: "Starter",
  SIXTH_MAN: "Sixth Man",
  ROTATION_PLAYER: "Rotation Player",
  BENCH_PLAYER: "Bench Player",
};

export const OUT_OF_ROTATION_LABEL = "Out of Rotation";

/** `rank` is a resolved rotation entry's 0-based depth position; `null` means the player isn't in the rotation at all. */
export function rotationRoleForRank(rank: number | null): RotationRole | null {
  if (rank === null) return null;
  if (rank <= 4) return "STARTER";
  if (rank === 5) return "SIXTH_MAN";
  if (rank <= 8) return "ROTATION_PLAYER";
  return "BENCH_PLAYER";
}

export function rotationRoleLabel(rank: number | null): string {
  const role = rotationRoleForRank(rank);
  return role ? ROTATION_ROLE_LABEL[role] : OUT_OF_ROTATION_LABEL;
}
