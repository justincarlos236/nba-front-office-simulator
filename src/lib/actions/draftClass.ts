"use server";

import { prisma } from "@/lib/prisma";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateDraftClass } from "@/lib/draft/generateDraftClass";

/**
 * Scouting Pillar Redesign (Phase 1) - generates this season's draft class
 * if it doesn't exist yet, a no-op otherwise. Same idempotent "ensure*"
 * pattern as `ensureStaffGenerated` (self-heals a save that reaches the
 * pre-draft window without this having run yet, and makes it safe to call
 * from multiple entry points without double-generating).
 *
 * This used to happen inside `runDraftLotteryAction` itself - moved out so
 * the class exists for the whole pre-draft window (scouting needs
 * something to scout before the lottery sets pick order), not just at the
 * instant the lottery runs. `runDraftLotteryAction` now calls this too, so
 * a save that reaches the lottery without ever visiting a scouting surface
 * still works exactly as before.
 *
 * Seeded on its own dedicated string, deliberately distinct from the
 * lottery's `${leagueId}-${season}-draft` seed. Pre-extraction, class
 * generation shared one RNG stream with `computeDraftOrder` (the draft
 * order draw ran first and consumed some of the stream, then class
 * generation consumed what was left) - giving the class its own seed here
 * decouples the two draws by design, so generating the class no longer
 * depends on the lottery having run first (or at all yet).
 */
export async function ensureDraftClassGenerated(leagueId: string, season: number): Promise<void> {
  const existingCount = await prisma.draftProspect.count({ where: { leagueId, season } });
  if (existingCount > 0) return;

  const rng = createSeededRandom(`${leagueId}-${season}-draft-class`);
  const { character, prospects } = generateDraftClass(rng);

  await prisma.draftProspect.createMany({
    data: prospects.map((p) => ({
      leagueId,
      season,
      fullName: p.fullName,
      position: p.position,
      age: p.age,
      overallRating: p.overallRating,
      potentialRating: p.potentialRating,
      heightInches: p.heightInches,
      weightLbs: p.weightLbs,
      collegeOrTeam: p.collegeOrTeam,
      isInternational: p.isInternational,
      nationality: p.nationality,
      pathway: p.pathway,
      comparisonPlayerName: p.comparisonPlayerName,
      classCharacter: character,
    })),
  });
}
