/**
 * Does the league drift toward parity over a long save?
 *
 * docs/SIMULATION_AUDIT.md P1-8 observed team-strength spread falling from 11.6
 * to 4.5 across six seasons of a real save, with best/worst converging on 51/30
 * wins. It is the one finding keeping that audit's long-term stability at 6/10,
 * and it predates the team-strength re-weighting - which fixed the spread a
 * league STARTS with and says nothing about whether it holds.
 *
 * Unlike the development audit, this keeps teams intact: rosters develop, age,
 * retire and draft as units, so per-team strength can be tracked across
 * seasons.
 *
 * **Scope, stated plainly.** This models the two forces that act on every save
 * automatically - ageing/development and the draft, which is deliberately
 * equalizing because the worst team picks first. It does NOT model free agency
 * or trades, which redistribute talent according to decisions a user or the CPU
 * makes. So a spread that survives here is a floor: those systems could still
 * flatten it further, and a spread that collapses here collapses regardless of
 * anything anyone does.
 *
 * Run: npx tsx scripts/parity-drift-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeHomeWinProbability } from "../src/lib/simulation/simulateGame";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const SEASONS = 12;
const ROSTER_LIMIT = DEFAULT_MAX_ROSTER_SIZE;
const SEEDS = [20260816, 11, 907, 5150, 33221];

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Player {
  id: string;
  overall: number;
  potential: number;
  age: number;
}

interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  birthDate?: string | null;
  draftYear?: number | null;
}

const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };
const { rostered } = selectTopPerTeam<Row>(
  ds.players,
  (p) => p.teamAbbreviation,
  (p) => p.seedOverallRating ?? 0,
  DEFAULT_MAX_ROSTER_SIZE,
);
const BASE = 2026;
const startingRosters = new Map<string, Player[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || !p.teamAbbreviation || p.seedOverallRating == null) continue;
  const age = p.birthDate
    ? BASE + 1 - new Date(p.birthDate).getFullYear()
    : p.draftYear
      ? Math.min(38, 19 + (BASE - p.draftYear))
      : 27;
  startingRosters.set(p.teamAbbreviation, [
    ...(startingRosters.get(p.teamAbbreviation) ?? []),
    {
      id: p.fullName,
      overall: p.seedOverallRating,
      potential: p.seedPotentialRating ?? p.seedOverallRating,
      age,
    },
  ]);
}

const sd = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
};

/** Implied wins from a team's strength against the league mean. */
function impliedWins(strength: number, leagueMean: number): number {
  const relative = strength - leagueMean + 76;
  return (
    82 *
    ((computeHomeWinProbability(relative, 76) + (1 - computeHomeWinProbability(76, relative))) / 2)
  );
}

interface SeasonSnapshot {
  strengthSd: number;
  winSd: number;
  best: number;
  worst: number;
}

function simulate(seed: number): SeasonSnapshot[] {
  const rng = makeRng(seed);
  const rosters = new Map<string, Player[]>();
  for (const [team, roster] of startingRosters)
    rosters.set(
      team,
      roster.map((p) => ({ ...p })),
    );
  const snapshots: SeasonSnapshot[] = [];
  let classCounter = 0;

  const snapshot = () => {
    const strengths = [...rosters.values()].map((r) =>
      computeTeamStrength(r.map((p) => p.overall)),
    );
    const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const wins = strengths.map((s) => impliedWins(s, mean));
    snapshots.push({
      strengthSd: sd(strengths),
      winSd: sd(wins),
      best: Math.max(...wins),
      worst: Math.min(...wins),
    });
  };
  snapshot();

  for (let season = 1; season <= SEASONS; season++) {
    // Develop and age, then retire.
    for (const [team, roster] of rosters) {
      const survivors: Player[] = [];
      for (const p of roster) {
        p.overall = developPlayerRating({
          overallRating: p.overall,
          potentialRating: p.potential,
          age: p.age,
          rng,
          developmentTrait: developmentTraitFromId(p.id),
        });
        p.age += 1;
        if (!shouldRetire(p.age, p.overall, rng)) survivors.push(p);
      }
      rosters.set(team, survivors);
    }

    // Draft: worst team picks first, which is the equalizing force.
    const order = [...rosters.entries()]
      .map(([team, roster]) => ({
        team,
        strength: computeTeamStrength(roster.map((p) => p.overall)),
      }))
      .sort((a, b) => a.strength - b.strength);
    classCounter += 1;
    const prospects = generateDraftClass(rng).prospects;
    order.forEach(({ team }, i) => {
      const roster = rosters.get(team)!;
      // Two rounds, so every club adds two players a year - roughly what a real
      // draft does before roster limits bite.
      for (const pick of [prospects[i], prospects[i + 30]]) {
        if (!pick || roster.length >= ROSTER_LIMIT) continue;
        roster.push({
          id: `c${classCounter}t${team}p${i}`,
          overall: pick.overallRating,
          potential: pick.potentialRating,
          age: pick.age,
        });
      }
      // Roster limit: the weakest are cut, as a real club would.
      roster.sort((a, b) => b.overall - a.overall);
      rosters.set(team, roster.slice(0, ROSTER_LIMIT));
    });

    snapshot();
  }

  return snapshots;
}

const runs = SEEDS.map(simulate);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

console.log("=".repeat(72));
console.log("PARITY DRIFT AUDIT");
console.log("=".repeat(72));
console.log(`  ${SEASONS} seasons, averaged over ${SEEDS.length} runs`);
console.log(`  P1-8 observed strength spread falling 11.6 -> 4.5 over six seasons\n`);
console.log(
  `${"SEASON".padStart(8)}${"STRENGTH SD".padStart(13)}${"WIN SD".padStart(10)}${"BEST".padStart(8)}${"WORST".padStart(8)}`,
);
for (let season = 0; season <= SEASONS; season++) {
  const strengthSd = mean(runs.map((r) => r[season].strengthSd));
  const winSd = mean(runs.map((r) => r[season].winSd));
  const best = mean(runs.map((r) => r[season].best));
  const worst = mean(runs.map((r) => r[season].worst));
  if (season === 0 || season % 2 === 0 || season === SEASONS) {
    console.log(
      `${String(season).padStart(8)}${strengthSd.toFixed(2).padStart(13)}${winSd.toFixed(1).padStart(10)}` +
        `${best.toFixed(0).padStart(8)}${worst.toFixed(0).padStart(8)}`,
    );
  }
}

const first = mean(runs.map((r) => r[0].strengthSd));
const last = mean(runs.map((r) => r[SEASONS].strengthSd));
console.log(
  `\n  strength SD: ${first.toFixed(2)} -> ${last.toFixed(2)}  (${((last / first - 1) * 100).toFixed(0)}%)`,
);
console.log(`  real NBA win SD is about 12; talent-only about 11`);
console.log(`\nReproduce: npx tsx scripts/parity-drift-audit.ts`);
