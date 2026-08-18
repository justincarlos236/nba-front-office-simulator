/**
 * Recalibrates `RESIGN_THRESHOLD` after the trade-value rescale.
 *
 * `evaluateReSigningDecision` scores a retention as `tradeValue / offerSalary`
 * and compares it to a fixed threshold. That threshold was calibrated against
 * the OLD trade-value scale, which the audit replaced: the curve is no longer
 * capped at 0.35 of the salary cap, so a 90-rated player is worth ~$130M rather
 * than ~$69M, and a bad contract is now negative rather than clamped at zero.
 * The ratio therefore lives on a different scale, and 0.35 no longer means what
 * it meant. See docs/TRADE_AUDIT.md.
 *
 * The target is not a prettier number - it is the league-wide retention rate
 * the previous calibration produced (84.1%), so this change moves the trade
 * model without moving free agency underneath it.
 *
 * Reads only. Run: npx tsx scripts/resign-threshold-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computePlayerTradeValue } from "../src/lib/gm/playerTradeValue";
import {
  GM_PERSONALITY_WEIGHTS,
  ALL_GM_PERSONALITIES,
  type GmPersonality,
} from "../src/lib/gm/gmPersonality";
import {
  YOUNG_AGE_THRESHOLD,
  VETERAN_AGE_THRESHOLD,
  CONTENDER_VETERAN_BONUS,
  REBUILDING_YOUTH_PICK_BONUS,
  NEED_FIT_BONUS_MULTIPLIER,
  playerFillsNeed,
} from "../src/lib/trade/evaluateTradeOffer";
import { computeTeamIdentity, type TeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { resolvePlayerAge } from "../src/lib/players/age";
import { computeReSigningMaxOfferCents } from "../src/lib/freeagency/reSigningRights";

// Tracks the dataset's own manifest.seasonYear - the harnesses read
// prisma/data/nbaDataset.json, so a stale constant here would silently
// price every player against the wrong cap.
const SEASON = 2026;
const TARGET_RETENTION = 0.841;

interface Row {
  fullName: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

const byTeam = new Map<string, Row[]>();
for (const p of ds.players) {
  if (!p.teamAbbreviation || !p.seedOverallRating) continue;
  byTeam.set(p.teamAbbreviation, [...(byTeam.get(p.teamAbbreviation) ?? []), p]);
}

/**
 * Replicates `evaluateReSigningDecision`'s scoring exactly, minus the threshold
 * comparison, so the threshold itself can be swept without touching shipped
 * code. Kept deliberately close to the original for line-by-line comparison.
 */
function retentionScore(
  player: {
    overallRating: number;
    potentialRating: number;
    age: number;
    position: "PG" | "SG" | "SF" | "PF" | "C";
  },
  identity: TeamIdentity,
  personality: GmPersonality,
  needs: ReturnType<typeof computeTeamNeeds>,
): number {
  const weights = GM_PERSONALITY_WEIGHTS[personality];
  const isWinNow = identity === "CONTENDER" || identity === "PLAYOFF_TEAM";
  const isRebuilding = identity === "REBUILDING" || identity === "TANKING";

  // The offer the real retention path actually makes - the same function
  // `evaluateReSigningDecision`'s callers use. Using a different pricing model
  // here would put the whole sweep on the wrong scale.
  const offerSalaryCents = computeReSigningMaxOfferCents(
    player.overallRating,
    SEASON,
    player.age,
    Math.max(4, player.age - 22),
  );

  let value = computePlayerTradeValue({
    season: SEASON,
    overallRating: player.overallRating,
    potentialRating: player.potentialRating,
    age: player.age,
    currentSalaryCents: offerSalaryCents,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
  });
  const scale = (c: bigint, m: number) => BigInt(Math.round(Number(c) * m));
  if (player.age <= YOUNG_AGE_THRESHOLD) {
    value = scale(value, weights.youthValueMultiplier);
    if (isRebuilding) value = scale(value, REBUILDING_YOUTH_PICK_BONUS);
  }
  if (player.age >= VETERAN_AGE_THRESHOLD) {
    value = scale(value, weights.veteranValueMultiplier);
    if (isWinNow) value = scale(value, CONTENDER_VETERAN_BONUS);
  }
  const shape = {
    type: "PLAYER" as const,
    position: player.position,
    overallRating: player.overallRating,
    potentialRating: player.potentialRating,
    age: player.age,
    currentSalaryCents: offerSalaryCents,
    injuryStatus: "HEALTHY" as const,
    careerGamesMissedToInjury: 0,
  };
  if (needs.some((need) => playerFillsNeed(shape, need))) {
    value = scale(value, NEED_FIT_BONUS_MULTIPLIER);
  }
  return offerSalaryCents > 0n ? Number(value) / Number(offerSalaryCents) : 0;
}

interface Case {
  score: number;
  thresholdMultiplier: number;
  age: number;
}
const cases: Case[] = [];
const teamAbbrs = [...byTeam.keys()];
teamAbbrs.forEach((abbr, index) => {
  const roster = byTeam.get(abbr)!;
  const players = roster.map((p) => ({
    overallRating: p.seedOverallRating!,
    potentialRating: p.seedPotentialRating ?? p.seedOverallRating!,
    age: resolvePlayerAge(
      { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
      SEASON,
    ),
    position: p.position,
  }));
  const avgAge = players.reduce((s, p) => s + p.age, 0) / players.length;
  const identity = computeTeamIdentity(index / (teamAbbrs.length - 1), avgAge);
  const needs = computeTeamNeeds(
    players.map((p) => ({ position: p.position, overallRating: p.overallRating })),
  );
  for (const personality of ALL_GM_PERSONALITIES) {
    for (const p of players) {
      cases.push({
        score: retentionScore(p, identity, personality, needs),
        thresholdMultiplier:
          GM_PERSONALITY_WEIGHTS[personality].acceptanceThresholdMultiplier *
          GM_PERSONALITY_WEIGHTS[personality].badContractSensitivityMultiplier,
        age: p.age,
      });
    }
  }
});

const retentionAt = (threshold: number) =>
  cases.filter((c) => c.score >= threshold * c.thresholdMultiplier).length / cases.length;

console.log("=".repeat(72));
console.log("RE-SIGNING THRESHOLD CALIBRATION");
console.log("=".repeat(72));
console.log(`  Decisions evaluated: ${cases.length} (every rostered player x every personality)`);
console.log(`  Target retention: ${(TARGET_RETENTION * 100).toFixed(1)}%\n`);
console.log(`${"THRESHOLD".padStart(11)}${"RETENTION".padStart(12)}${"33+ RETAINED".padStart(15)}`);

let best = { threshold: 0, err: Infinity };
for (let t = 0.05; t <= 6; t += 0.005) {
  const r = retentionAt(t);
  const err = Math.abs(r - TARGET_RETENTION);
  if (err < best.err) best = { threshold: t, err };
}
for (const t of [0.35, 0.5, 1, 1.5, 2, 2.5, 3, 4, best.threshold]) {
  const olds = cases.filter((c) => c.age >= 33);
  const oldRetained = olds.filter((c) => c.score >= t * c.thresholdMultiplier).length;
  console.log(
    `${t.toFixed(3).padStart(11)}${(retentionAt(t) * 100).toFixed(1).padStart(11)}%${
      olds.length
        ? `${((oldRetained / olds.length) * 100).toFixed(1)}%`.padStart(14)
        : "n/a".padStart(14)
    }`,
  );
}
console.log(
  `\n  BEST FIT threshold = ${best.threshold.toFixed(3)}  -> retention ${(retentionAt(best.threshold) * 100).toFixed(1)}%`,
);
