/**
 * Coach of the Year - the one award category deferred out of Phase 15a.
 * Determined purely from team win% (the only universal, all-30-teams
 * performance signal available - SeasonExpectation is user-team-only, see
 * src/lib/actions/offseason.ts), same "don't fabricate what the engine
 * can't support" principle src/lib/development/seasonAwards.ts follows for
 * player awards.
 */
export interface HeadCoachSeasonSnapshot {
  staffId: string;
  teamWinPct: number;
  quality: number; // tie-breaker only, not part of the primary score
}

export interface StaffAwardWinner {
  staffId: string;
  value: number;
}

export function computeCoachOfTheYear(coaches: HeadCoachSeasonSnapshot[]): StaffAwardWinner | null {
  let best: HeadCoachSeasonSnapshot | null = null;
  for (const c of coaches) {
    if (
      !best ||
      c.teamWinPct > best.teamWinPct ||
      (c.teamWinPct === best.teamWinPct && c.quality > best.quality)
    ) {
      best = c;
    }
  }
  return best ? { staffId: best.staffId, value: best.teamWinPct } : null;
}
