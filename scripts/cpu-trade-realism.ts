/**
 * CPU-to-CPU trade realism — the dimension `docs/TRADE_EXPLOIT_AUDIT.md` left
 * unscored because it needed simulation rather than a single evaluation.
 *
 * Two failure modes to avoid, and they are opposite:
 *
 *   - a **dead league**, where nobody trades and rosters never move
 *   - a **chaos league**, where stars change hands constantly
 *
 * Real NBA: roughly 30-50 trades league-wide per season, concentrated near the
 * deadline, and a genuine star moves perhaps once or twice a year.
 *
 * Runs the real `rollForCpuTrade` against the real seeded league, at the real
 * `TRADE_CHANCE_PER_GAME`, for a full 1,230-game season.
 *
 * Reads only, no database. Run: npx tsx scripts/cpu-trade-realism.ts
 */
import fs from "node:fs";
import path from "node:path";
import { rollForCpuTrade, type CpuTeam } from "../src/lib/simulation/leagueEvents";
import { contractQualityScore, priceContractCents } from "../src/lib/contracts/priceContract";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeTeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { getApronLevel } from "../src/lib/cap/apron";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { computeCapSheet } from "../src/lib/cap/capSheet";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "../src/lib/data-sources/rosterConstruction";

const S = 2026;
const rules = getSeasonCapRules(S);
const GAMES_PER_SEASON = 1230;
/** The shipped per-game trade-event chance in `actions/leagueEvents.ts`. */
const TRADE_CHANCE_PER_GAME = 0.013;
const line = (n = 88) => console.log("=".repeat(n));

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

interface Row {
  fullName: string; teamAbbreviation: string | null; position: string;
  seedOverallRating: number | null; seedPotentialRating: number | null;
  birthDate?: string | null; draftYear?: number | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };
const { rostered } = selectTopPerTeam<Row>(
  ds.players, (p) => p.teamAbbreviation, (p) => p.seedOverallRating ?? 0, DEFAULT_MAX_ROSTER_SIZE,
);

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const rosterByTeam = new Map<string, CpuTeam["roster"]>();
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
  const src = { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear ?? null };
  const age = resolvePlayerAge(src, S);
  const salary = BigInt(priceContractCents({
    season: S,
    quality: contractQualityScore({ overallRating: p.seedOverallRating, performanceScore: null, gamesPlayed: 0 }),
    age, yearsOfExperience: resolvePlayerExperience(src, S), position: p.position,
  }));
  const pos = (POSITIONS as readonly string[]).includes(p.position.toUpperCase())
    ? (p.position.toUpperCase() as (typeof POSITIONS)[number]) : "SF";
  rosterByTeam.set(p.teamAbbreviation, [
    ...(rosterByTeam.get(p.teamAbbreviation) ?? []),
    {
      leaguePlayerId: `${p.teamAbbreviation}-${p.fullName}`, playerName: p.fullName,
      rating: p.seedOverallRating, potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
      age, position: pos, injuryStatus: "HEALTHY", careerGamesMissedToInjury: 0,
      salaryCents: salary, noTradeClause: false,
    },
  ]);
}

const strengthOrder = [...rosterByTeam.entries()]
  .map(([t, r]) => ({ t, s: computeTeamStrength(r.map((p) => p.rating)) }))
  .sort((a, b) => a.s - b.s);

function buildTeams(): CpuTeam[] {
  return strengthOrder.map(({ t }, i) => {
    const roster = rosterByTeam.get(t)!;
    const pct = i / (strengthOrder.length - 1);
    const avgAge = roster.reduce((s, p) => s + p.age, 0) / roster.length;
    const capSheet = computeCapSheet({
      season: S,
      contracts: roster.map((p) => ({ playerId: p.leaguePlayerId, salaryCents: p.salaryCents })),
    });
    return {
      leagueTeamId: t, teamLabel: t, roster: roster.map((p) => ({ ...p })),
      capState: {
        apronLevel: getApronLevel(
          roster.reduce((s, p) => s + p.salaryCents, 0n), rules,
        ),
        capSpaceCents: capSheet.capSpaceCents,
        ownedFutureFirstRoundPickSeasons: [S + 1, S + 2, S + 3],
      },
      identity: computeTeamIdentity(pct, avgAge),
      needs: computeTeamNeeds(roster.map((p) => ({ position: p.position, overallRating: p.rating }))),
      personality: "BALANCED",
    };
  });
}

line();
console.log("CPU-TO-CPU TRADE REALISM");
line();
console.log(`  ${GAMES_PER_SEASON} games, trade-event chance ${TRADE_CHANCE_PER_GAME}/game`);
console.log(`  real NBA: ~30-50 trades a season league-wide\n`);

const SEASONS = 10;
let totalTrades = 0;
let starTrades = 0;
const movedRatings: number[] = [];
const perSeason: number[] = [];
const rng = makeRng(20260817);

for (let season = 0; season < SEASONS; season++) {
  const teams = buildTeams();
  let trades = 0;
  // The event layer rolls once per game at TRADE_CHANCE_PER_GAME.
  for (let game = 0; game < GAMES_PER_SEASON; game++) {
    if (rng() >= TRADE_CHANCE_PER_GAME) continue;
    const result = rollForCpuTrade(teams, S, rng);
    if (!result) continue;
    trades++;
    for (const side of [result.teamA, result.teamB]) {
      movedRatings.push(side.player.rating);
      if (side.player.rating >= 85) starTrades++;
    }
    // Actually move the players, so the league state evolves.
    const a = teams.find((t) => t.leagueTeamId === result.teamA.leagueTeamId)!;
    const b = teams.find((t) => t.leagueTeamId === result.teamB.leagueTeamId)!;
    a.roster = [...a.roster.filter((p) => p.leaguePlayerId !== result.teamA.player.leaguePlayerId), result.teamB.player];
    b.roster = [...b.roster.filter((p) => p.leaguePlayerId !== result.teamB.player.leaguePlayerId), result.teamA.player];
  }
  perSeason.push(trades);
  totalTrades += trades;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`${"SEASON".padStart(8)}${"TRADES".padStart(9)}`);
perSeason.forEach((n, i) => console.log(`${String(i + 1).padStart(8)}${String(n).padStart(9)}`));
console.log(`\n  mean trades per season: ${mean(perSeason).toFixed(1)}   (real ~30-50)`);
console.log(`  min ${Math.min(...perSeason)}, max ${Math.max(...perSeason)}`);
console.log(`  players moved per season: ${(totalTrades * 2 / SEASONS).toFixed(1)}`);
console.log(`  star (85+) moves per season: ${(starTrades / SEASONS).toFixed(1)}   (real ~1-2)`);
if (movedRatings.length > 0) {
  const sorted = [...movedRatings].sort((a, b) => a - b);
  console.log(`\n  traded player rating: median ${sorted[Math.floor(sorted.length / 2)]}, ` +
    `max ${sorted[sorted.length - 1]}, mean ${mean(movedRatings).toFixed(1)}`);
}
line();
