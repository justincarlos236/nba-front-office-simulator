/**
 * The roster trim shared by BOTH the league bootstrap (createLeagueAction) and
 * the dataset validator. Keeping it in one place means the validator's
 * "can every team field a legal roster" check reflects exactly what league
 * creation produces. Each team keeps its top `maxPerTeam` by rating; everything
 * else becomes a free agent.
 */
export const DEFAULT_MAX_ROSTER_SIZE = 15;

export function selectTopPerTeam<T>(
  items: readonly T[],
  teamKeyOf: (item: T) => string | null,
  ratingOf: (item: T) => number,
  maxPerTeam: number = DEFAULT_MAX_ROSTER_SIZE,
): { rostered: Set<T>; byTeam: Map<string, T[]> } {
  const byTeam = new Map<string, T[]>();
  for (const item of items) {
    const key = teamKeyOf(item);
    if (!key) continue;
    const list = byTeam.get(key) ?? [];
    list.push(item);
    byTeam.set(key, list);
  }
  const rostered = new Set<T>();
  for (const list of byTeam.values()) {
    list.sort((a, b) => ratingOf(b) - ratingOf(a));
    for (const item of list.slice(0, maxPerTeam)) rostered.add(item);
  }
  return { rostered, byTeam };
}
