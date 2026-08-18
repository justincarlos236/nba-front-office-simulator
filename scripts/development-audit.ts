/**
 * Development audit. Reads only; touches no database.
 *
 * The system three other audits point at. `docs/audits/DEVELOPMENT_AUDIT.md` has
 * D-P0-1 (young players cannot bust) recorded as open after three attempts;
 * `docs/audits/TEAM_STRENGTH_AUDIT.md` named the rating distribution as the residual
 * blocking talent SD from reaching the real 11.1; `docs/audits/DRAFT_AUDIT.md` could
 * not settle whether class ceilings inflate the league because realisation
 * rates live here.
 *
 * Unlike every other audit this session, this one cannot measure a function
 * against a target. Development only misbehaves over time, so this runs a full
 * multi-season league: develop, age, retire, draft, repeat.
 *
 * Run: npx tsx scripts/development-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  developPlayerRating,
  developmentTraitFromId,
  effectiveCeiling,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const SEASONS = 20;
const LEAGUE_SIZE_TARGET = 450;

/** Real NBA reference points, from docs/audits/RATING_AUDIT.md and the seeded league. */
const REAL_90_PLUS = 14;
const REAL_85_PLUS = 44;
const REAL_80_PLUS = 82;

const line = (n = 78) => console.log("=".repeat(n));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Sim {
  id: string;
  overall: number;
  potential: number;
  age: number;
  /** Pick slot if drafted in-sim, for bust accounting. */
  draftPick: number | null;
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

const BASE_SEASON = 2026;
const startingLeague: Sim[] = ds.players
  .filter((p) => rostered.has(p) && p.seedOverallRating != null)
  .map((p) => ({
    id: p.fullName,
    overall: p.seedOverallRating!,
    potential: p.seedPotentialRating ?? p.seedOverallRating!,
    age: p.birthDate
      ? BASE_SEASON + 1 - new Date(p.birthDate).getFullYear()
      : p.draftYear
        ? Math.min(38, 19 + (BASE_SEASON - p.draftYear))
        : 27,
    draftPick: null,
  }));

const countAtLeast = (players: Sim[], threshold: number) =>
  players.filter((p) => p.overall >= threshold).length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

line();
console.log("DEVELOPMENT AUDIT");
line();
console.log(`  ${startingLeague.length} players at season 0, simulated ${SEASONS} seasons`);
console.log(
  `  real reference: ${REAL_90_PLUS} at 90+, ${REAL_85_PLUS} at 85+, ${REAL_80_PLUS} at 80+\n`,
);

// ---------------------------------------------------------------------------
// DEV-1. Does the league hold its talent distribution over twenty seasons?
// ---------------------------------------------------------------------------
line();
console.log("DEV-1  LEAGUE TALENT OVER TIME");
line();

const rng = makeRng(20260815);
let league: Sim[] = startingLeague.map((p) => ({ ...p }));
let classCounter = 0;

console.log(
  `${"SEASON".padStart(7)}${"PLAYERS".padStart(9)}${"90+".padStart(7)}${"85+".padStart(7)}${"80+".padStart(7)}${"MEDIAN".padStart(9)}${"RETIRED".padStart(9)}`,
);
const snapshots: { season: number; at90: number; at85: number; at80: number }[] = [];

for (let season = 0; season <= SEASONS; season++) {
  if (season > 0) {
    // Develop, then age.
    for (const p of league) {
      p.overall = developPlayerRating({
        overallRating: p.overall,
        potentialRating: p.potential,
        age: p.age,
        rng,
        developmentTrait: developmentTraitFromId(p.id),
      });
      p.age += 1;
    }
    // Retire.
    const before = league.length;
    league = league.filter((p) => !shouldRetire(p.age, p.overall, rng));
    const retired = before - league.length;

    // Intake: one draft class, then trim to the league's roster capacity by
    // dropping the weakest - the same pressure a 15-man limit applies.
    classCounter += 1;
    const draftClass = generateDraftClass(rng);
    draftClass.prospects.forEach((prospect, i) => {
      league.push({
        id: `c${classCounter}p${i}`,
        overall: prospect.overallRating,
        potential: prospect.potentialRating,
        age: prospect.age,
        draftPick: i + 1,
      });
    });
    league.sort((a, b) => b.overall - a.overall);
    if (league.length > LEAGUE_SIZE_TARGET) league = league.slice(0, LEAGUE_SIZE_TARGET);

    if (season === 1 || season % 5 === 0 || season === SEASONS) {
      console.log(
        `${String(season).padStart(7)}${String(league.length).padStart(9)}` +
          `${String(countAtLeast(league, 90)).padStart(7)}${String(countAtLeast(league, 85)).padStart(7)}` +
          `${String(countAtLeast(league, 80)).padStart(7)}` +
          `${median(league.map((p) => p.overall))
            .toFixed(1)
            .padStart(9)}${String(retired).padStart(9)}`,
      );
    }
  } else {
    console.log(
      `${String(season).padStart(7)}${String(league.length).padStart(9)}` +
        `${String(countAtLeast(league, 90)).padStart(7)}${String(countAtLeast(league, 85)).padStart(7)}` +
        `${String(countAtLeast(league, 80)).padStart(7)}` +
        `${median(league.map((p) => p.overall))
          .toFixed(1)
          .padStart(9)}${"-".padStart(9)}`,
    );
  }
  snapshots.push({
    season,
    at90: countAtLeast(league, 90),
    at85: countAtLeast(league, 85),
    at80: countAtLeast(league, 80),
  });
}

const final = snapshots[snapshots.length - 1];
console.log(`\n  real:  ${REAL_90_PLUS} / ${REAL_85_PLUS} / ${REAL_80_PLUS}`);
console.log(`  final: ${final.at90} / ${final.at85} / ${final.at80}`);
console.log(
  `  drift vs real: 90+ ${(final.at90 - REAL_90_PLUS >= 0 ? "+" : "") + (final.at90 - REAL_90_PLUS)}, ` +
    `85+ ${(final.at85 - REAL_85_PLUS >= 0 ? "+" : "") + (final.at85 - REAL_85_PLUS)}, ` +
    `80+ ${(final.at80 - REAL_80_PLUS >= 0 ? "+" : "") + (final.at80 - REAL_80_PLUS)}`,
);

// ---------------------------------------------------------------------------
// DEV-2. Can a prospect bust?
// ---------------------------------------------------------------------------
line();
console.log("DEV-2  BUST RATES BY DRAFT SLOT");
line();
console.log("  D-P0-1: a growth floor of +1/season once meant a 0% bust rate at every");
console.log("  slot. Each prospect is developed from his draft age to 26.\n");

const TRIALS_PER_SLOT = 2000;
console.log(
  `${"PICK".padStart(6)}${"MEAN PEAK".padStart(11)}${"REACHED 80+".padStart(13)}${"BUSTED (<70)".padStart(14)}${"HIT CEILING".padStart(13)}`,
);

const bustRng = makeRng(555);
let futureStarsPerClass = 0;
for (const slot of [1, 5, 10, 20, 30, 45, 60]) {
  let peakSum = 0;
  let reached80 = 0;
  let busted = 0;
  let hitCeiling = 0;

  for (let t = 0; t < TRIALS_PER_SLOT; t++) {
    // A prospect exactly as generateDraftClass would produce him at this slot.
    const cls = generateDraftClass(bustRng);
    const prospect = cls.prospects[slot - 1];
    const id = `bust:${slot}:${t}`;
    const trait = developmentTraitFromId(id);
    const ceiling = effectiveCeiling(prospect.overallRating, prospect.potentialRating, trait);

    let overall = prospect.overallRating;
    for (let age = prospect.age; age <= 26; age++) {
      overall = developPlayerRating({
        overallRating: overall,
        potentialRating: prospect.potentialRating,
        age,
        rng: bustRng,
        developmentTrait: trait,
      });
    }
    peakSum += overall;
    if (overall >= 80) reached80 += 1;
    if (overall < 70) busted += 1;
    if (overall >= ceiling) hitCeiling += 1;
  }

  console.log(
    `${String(slot).padStart(6)}${(peakSum / TRIALS_PER_SLOT).toFixed(1).padStart(11)}` +
      `${pct(reached80 / TRIALS_PER_SLOT).padStart(13)}${pct(busted / TRIALS_PER_SLOT).padStart(14)}` +
      `${pct(hitCeiling / TRIALS_PER_SLOT).padStart(13)}`,
  );
}

// How many future 80+ players does a whole class actually yield?
//
// The reference used to read "5-8", which is not consistent with the rest of
// this file. `REAL_80_PLUS` is 82 players held at 80+, and a player holds that
// tier for roughly nine seasons, so a steady state needs about 82/9 = 9.1
// arriving every year. A class yielding 5-8 would drain the league. The band
// below is derived from the stock this same script already checks against,
// rather than guessed independently of it - see docs/audits/DEVELOPMENT_AUDIT.md.
const classRng = makeRng(4242);
const CLASS_TRIALS = 300;
let starTotal = 0;
for (let t = 0; t < CLASS_TRIALS; t++) {
  const cls = generateDraftClass(classRng);
  for (let i = 0; i < cls.prospects.length; i++) {
    const prospect = cls.prospects[i];
    const id = `cls:${t}:${i}`;
    const trait = developmentTraitFromId(id);
    let overall = prospect.overallRating;
    for (let age = prospect.age; age <= 26; age++) {
      overall = developPlayerRating({
        overallRating: overall,
        potentialRating: prospect.potentialRating,
        age,
        rng: classRng,
        developmentTrait: trait,
      });
    }
    if (overall >= 80) starTotal += 1;
  }
}
futureStarsPerClass = starTotal / CLASS_TRIALS;
console.log(
  `\n  future 80+ players per class: ${futureStarsPerClass.toFixed(1)}` +
    `  (needed to hold a stock of ${REAL_80_PLUS}: ~9.1)`,
);

line();
console.log("Reproduce: npx tsx scripts/development-audit.ts");
line();
