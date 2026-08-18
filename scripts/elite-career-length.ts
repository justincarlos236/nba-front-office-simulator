/**
 * D-P2-1, reframed - stock, yield and duration measured together.
 *
 * Two numbers from the earlier audits point in opposite directions and have
 * never been reconciled:
 *
 *   - the league holds **39** players at 85+ against a real **44**
 *   - a draft class yields **9.0** eventual stars against a real **5-8**
 *
 * More stars produced, fewer stars present. Those cannot both be adjusted in
 * the same direction, and tuning either alone would push the other further out.
 *
 * They are reconciled by the identity `stock = yield x duration`. At a real 44
 * held and 5-8 arriving a year, a star spends roughly 6-8 seasons at 85+. At 39
 * held and 9.0 arriving, this simulator implies about 4.3 - so the hypothesis
 * under test is that elite careers are too SHORT, and that neither the class
 * ceiling nor the development curve is individually wrong.
 *
 * Retirement is already ruled out by inspection: `retirementProbability` applies
 * no rating penalty at all above 72, so an 85-rated player faces only the age
 * term. If duration is short, it is the decline curve doing it.
 *
 * Reads only, no database. Run: npx tsx scripts/elite-career-length.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import { resolvePlayerAge } from "../src/lib/players/age";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const BASE = 2026;
const SEASONS = 25;
/** Discard the first few so the seeded roster's own age structure washes out. */
const WARMUP = 6;
const SEEDS = [20260818, 77, 4242, 991, 13];
const ELITE = 85;

const REAL_STOCK = 44;
const REAL_YIELD_LOW = 5;
const REAL_YIELD_HIGH = 8;
const REAL_DURATION_LOW = 6;
const REAL_DURATION_HIGH = 8;

const line = (n = 88) => console.log("=".repeat(n));
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  position: string;
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

interface Career {
  id: string;
  rating: number;
  potential: number;
  age: number;
  /** Seasons this player has spent at or above ELITE. */
  eliteSeasons: number;
  everElite: boolean;
  /** Season index he first crossed ELITE, or null. */
  becameEliteAt: number | null;
  bornInSim: boolean;
}

interface Result {
  stock: number;
  /** New 85+ arrivals per season, averaged over the post-warmup window. */
  yieldPerSeason: number;
  /** Seasons at 85+, over careers that both started and ended inside the run. */
  duration: number;
  peakAge: number;
}

function run(seed: number): Result {
  const rng = makeRng(seed);
  const league: Career[] = [];

  for (const p of ds.players) {
    if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
    const src = {
      birthDate: p.birthDate ? new Date(p.birthDate) : null,
      draftYear: p.draftYear ?? null,
    };
    league.push({
      id: p.fullName,
      rating: p.seedOverallRating,
      potential: p.seedPotentialRating ?? p.seedOverallRating,
      age: resolvePlayerAge(src, BASE),
      eliteSeasons: 0,
      everElite: p.seedOverallRating >= ELITE,
      becameEliteAt: p.seedOverallRating >= ELITE ? 0 : null,
      bornInSim: false,
    });
  }

  const completed: Career[] = [];
  const arrivalsBySeason: number[] = [];
  const eliteAges: number[] = [];
  let counter = 0;

  for (let s = 1; s <= SEASONS; s++) {
    let arrivals = 0;
    const survivors: Career[] = [];

    for (const c of league) {
      const before = c.rating;
      c.rating = developPlayerRating({
        overallRating: c.rating,
        potentialRating: c.potential,
        age: c.age,
        rng,
        developmentTrait: developmentTraitFromId(c.id),
      });
      c.age += 1;

      if (c.rating >= ELITE) {
        c.eliteSeasons += 1;
        eliteAges.push(c.age);
        if (before < ELITE) {
          arrivals += 1;
          if (!c.everElite) {
            c.everElite = true;
            c.becameEliteAt = s;
          }
        }
      }

      if (shouldRetire(c.age, c.rating, rng)) completed.push(c);
      else survivors.push(c);
    }

    league.length = 0;
    league.push(...survivors);
    arrivalsBySeason.push(arrivals);

    // Replace retirees with a fresh draft class, so league size stays stable
    // and the class generator's own yield feeds the population.
    const needed = 30 * DEFAULT_MAX_ROSTER_SIZE - league.length;
    const prospects = generateDraftClass(rng).prospects;
    for (let i = 0; i < needed && i < prospects.length; i++) {
      const p = prospects[i];
      league.push({
        id: `sim-${s}-${counter++}`,
        rating: p.overallRating,
        potential: p.potentialRating,
        age: p.age,
        eliteSeasons: 0,
        everElite: false,
        becameEliteAt: null,
        bornInSim: true,
      });
    }
  }

  // Duration only from careers that began AND ended inside the run - a player
  // already elite at seed, or still active at the end, is censored and would
  // drag the mean down if counted.
  const clean = completed.filter((c) => c.bornInSim && c.everElite && c.eliteSeasons > 0);

  return {
    stock: league.filter((c) => c.rating >= ELITE).length,
    yieldPerSeason: mean(arrivalsBySeason.slice(WARMUP)),
    duration: mean(clean.map((c) => c.eliteSeasons)),
    peakAge: mean(eliteAges),
  };
}

line();
console.log("ELITE POPULATION - STOCK, YIELD AND DURATION TOGETHER");
line();
console.log(`  ${SEASONS} seasons x ${SEEDS.length} seeds, ${WARMUP}-season warmup discarded.`);
console.log(`  stock = yield x duration, so all three must agree at once.\n`);

const results = SEEDS.map(run);
console.log(
  `${"SEED".padStart(11)}${"STOCK 85+".padStart(12)}${"NEW/SEASON".padStart(13)}` +
    `${"DURATION".padStart(11)}${"MEAN AGE".padStart(11)}`,
);
SEEDS.forEach((seed, i) => {
  const r = results[i];
  console.log(
    `${String(seed).padStart(11)}${String(r.stock).padStart(12)}` +
      `${r.yieldPerSeason.toFixed(1).padStart(13)}${r.duration.toFixed(1).padStart(11)}` +
      `${r.peakAge.toFixed(1).padStart(11)}`,
  );
});

const stock = mean(results.map((r) => r.stock));
const yieldPer = mean(results.map((r) => r.yieldPerSeason));
const duration = mean(results.map((r) => r.duration));

const verdict = (v: number, lo: number, hi: number) => (v < lo ? "LOW" : v > hi ? "HIGH" : "ok");

console.log(
  `\n${"".padStart(11)}${"MEASURED".padStart(12)}${"REAL".padStart(16)}${"VERDICT".padStart(10)}`,
);
console.log(
  `${"stock".padStart(11)}${stock.toFixed(1).padStart(12)}${String(REAL_STOCK).padStart(16)}` +
    `${verdict(stock, REAL_STOCK - 4, REAL_STOCK + 4).padStart(10)}`,
);
console.log(
  `${"yield".padStart(11)}${yieldPer.toFixed(1).padStart(12)}` +
    `${`${REAL_YIELD_LOW}-${REAL_YIELD_HIGH}`.padStart(16)}` +
    `${verdict(yieldPer, REAL_YIELD_LOW, REAL_YIELD_HIGH).padStart(10)}`,
);
console.log(
  `${"duration".padStart(11)}${duration.toFixed(1).padStart(12)}` +
    `${`${REAL_DURATION_LOW}-${REAL_DURATION_HIGH}`.padStart(16)}` +
    `${verdict(duration, REAL_DURATION_LOW, REAL_DURATION_HIGH).padStart(10)}`,
);

console.log(
  `\n  implied stock from measured yield x duration: ${(yieldPer * duration).toFixed(1)}`,
);
console.log(`  if duration is the LOW one, the class ceiling and the development`);
console.log(`  curve are both fine and the decline curve is the defect.`);
line();
