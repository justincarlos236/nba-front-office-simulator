/**
 * Measures completed CPU-CPU trades per league-season through the real
 * `rollForCpuTrade`, so trade volume is set against a target rather than
 * guessed.
 *
 * The quantity that matters is trades per season (~15), not the roll-success
 * rate - the rate is only an intermediate. Making the trade model symmetric
 * (docs/TRADE_AUDIT.md, T-P0-4) raised the rate from 42.6% to 75.5%, because
 * two teams now agree when they genuinely want different things rather than
 * when a one-sided bonus made a swap look good to both. The fix belongs in
 * `TRADE_CHANCE_PER_GAME`, not in `ACCEPT_THRESHOLD`: raising the acceptance
 * bar to claw the rate back would have pushed it above 1.0, i.e. made the CPU
 * reject a mathematically fair offer from the user as a side effect of a
 * valuation fix.
 *
 * Reads only. Run: npx tsx scripts/cpu-trade-rate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { rollForCpuTrade, type CpuTeam, type CpuRosterPlayer } from "../src/lib/simulation/leagueEvents";
import { ApronLevel } from "../src/lib/cap/apron";
import { computeTeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { ALL_GM_PERSONALITIES } from "../src/lib/gm/gmPersonality";
import { resolvePlayerAge } from "../src/lib/players/age";

const SEASON = 2025;
const TARGET_TRADES_PER_SEASON = 15;
const TOLERANCE = 3;
const TRADE_CHANCE_PER_GAME = 0.013;
const GAMES_PER_SEASON = 82 * 30 / 2; // league-wide game rows a season

interface Row {
  fullName: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  contract: { years: { season: number; salaryCents: number }[] } | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const byTeam = new Map<string, CpuRosterPlayer[]>();
for (const p of ds.players) {
  if (!p.teamAbbreviation || !p.seedOverallRating) continue;
  const year = p.contract?.years.find((y) => y.season === SEASON);
  const list = byTeam.get(p.teamAbbreviation) ?? [];
  list.push({
    leaguePlayerId: `${p.teamAbbreviation}-${p.fullName}`,
    playerName: p.fullName,
    rating: p.seedOverallRating,
    potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
    age: resolvePlayerAge(
      { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
      SEASON,
    ),
    position: p.position,
    salaryCents: BigInt(year?.salaryCents ?? 250_000_00),
    noTradeClause: false,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
  });
  byTeam.set(p.teamAbbreviation, list);
}

function buildTeams(seed: number): CpuTeam[] {
  const rng = makeRng(seed);
  return [...byTeam.entries()].map(([abbr, roster], index) => {
    const sorted = [...roster].sort((a, b) => b.rating - a.rating).slice(0, 15);
    const avgAge = sorted.reduce((s, p) => s + p.age, 0) / sorted.length;
    // Spread teams across the competitiveness range so every identity appears,
    // which is what a real league looks like mid-season.
    const percentile = index / (byTeam.size - 1);
    return {
      leagueTeamId: abbr,
      teamLabel: abbr,
      roster: sorted,
      capState: {
        apronLevel: ApronLevel.BETWEEN_CAP_AND_TAX,
        capSpaceCents: 0n,
        ownedFutureFirstRoundPickSeasons: [SEASON + 1, SEASON + 2, SEASON + 3, SEASON + 4],
      } satisfies CpuTeam["capState"],
      // Its own picks for the next four drafts, which is what a team that has
      // made no pick trades actually holds. Without these the sweetener path
      // added for docs/TRADE_AUDIT.md subsystem #8 is never exercised and the
      // measured rate silently reflects the old player-for-player-only market.
      tradeablePicks: [1, 2, 3, 4].flatMap((offset) =>
        ([1, 2] as const).map((round) => ({
          draftPickId: `${abbr}-${SEASON + offset}-r${round}`,
          season: SEASON + offset,
          round,
          originalTeamCompetitivenessPercentile: percentile,
          label: `${SEASON + offset} ${round === 1 ? "1st" : "2nd"} Round Pick`,
        })),
      ),
      identity: computeTeamIdentity(percentile, avgAge),
      needs: computeTeamNeeds(
        sorted.map((p) => ({ position: p.position, overallRating: p.rating })),
      ),
      personality: ALL_GM_PERSONALITIES[Math.floor(rng() * ALL_GM_PERSONALITIES.length)],
    };
  });
}

const ROLLS = Number(process.env.ROLLS ?? 4000);
let found = 0;
for (let i = 0; i < ROLLS; i++) {
  const teams = buildTeams(1 + (i % 17));
  if (rollForCpuTrade(teams, SEASON, makeRng(1000 + i)) !== null) found++;
}
const rate = found / ROLLS;
const tradesPerSeason = rate * TRADE_CHANCE_PER_GAME * GAMES_PER_SEASON;

console.log("=".repeat(70));
console.log("CPU-CPU TRADE LIQUIDITY");
console.log("=".repeat(70));
console.log(`  Rolls attempted:        ${ROLLS}`);
console.log(`  Roll-success rate:      ${(rate * 100).toFixed(1)}%   (was 42.6% pre-symmetry)`);
console.log(
  `  Completed trades/season: ${tradesPerSeason.toFixed(1)}   (target ${TARGET_TRADES_PER_SEASON})`,
);
console.log(
  `\n  ${
    Math.abs(tradesPerSeason - TARGET_TRADES_PER_SEASON) <= TOLERANCE
      ? "On target. TRADE_CHANCE_PER_GAME is correctly calibrated."
      : "OFF target - adjust TRADE_CHANCE_PER_GAME in leagueEvents.ts."
  }`,
);
