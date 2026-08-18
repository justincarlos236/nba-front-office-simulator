/**
 * T-P2-4 - how much does determinism actually hand the player?
 *
 * `evaluateTradeOffer` is a pure function of the offer, so a user can nudge a
 * package upward until the decision flips and learn the CPU's exact break-even.
 * `ACCEPT_THRESHOLD` is 0.95, so the naive expectation is a 5.3% edge per trade.
 *
 * That expectation ignores that `score` is *philosophy-weighted*: a rebuilding
 * club marks up youth and marks down veterans, so the boundary in the CPU's
 * terms need not be the boundary in neutral asset terms. This measures the gap
 * in neutral terms - `computePlayerTradeValue`, the same yardstick the trade
 * chain harness uses - which is what the user's book actually gains.
 *
 * Method: for each real club and a real target on its roster, binary-search the
 * incoming player's rating as a continuous knob for the least valuable package
 * the club will still accept, then report neutral outgoing / neutral incoming.
 *
 * Reads only, no database. Run: npx tsx scripts/trade-threshold-search.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  evaluateTradeOffer,
  ACCEPT_THRESHOLD,
  type TradePlayerAsset,
} from "../src/lib/trade/evaluateTradeOffer";
import { computePlayerTradeValue } from "../src/lib/gm/playerTradeValue";
import { contractQualityScore, priceContractCents } from "../src/lib/contracts/priceContract";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeTeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import { ALL_GM_PERSONALITIES, GM_PERSONALITY_WEIGHTS } from "../src/lib/gm/gmPersonality";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const S = 2026;
const line = (n = 90) => console.log("=".repeat(n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

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
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

interface Owned {
  asset: TradePlayerAsset;
  name: string;
}

const teams = new Map<string, Owned[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
  const src = {
    birthDate: p.birthDate ? new Date(p.birthDate) : null,
    draftYear: p.draftYear ?? null,
  };
  const age = resolvePlayerAge(src, S);
  const salary = BigInt(
    priceContractCents({
      season: S,
      quality: contractQualityScore({
        overallRating: p.seedOverallRating,
        performanceScore: null,
        gamesPlayed: 0,
      }),
      age,
      yearsOfExperience: resolvePlayerExperience(src, S),
      position: p.position,
    }),
  );
  const upper = p.position.toUpperCase();
  const pos = (POSITIONS as readonly string[]).includes(upper)
    ? (upper as TradePlayerAsset["position"])
    : "SF";
  teams.set(p.teamAbbreviation, [
    ...(teams.get(p.teamAbbreviation) ?? []),
    {
      name: p.fullName,
      asset: {
        type: "PLAYER",
        overallRating: p.seedOverallRating,
        potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
        age,
        position: pos,
        currentSalaryCents: salary,
        injuryStatus: "HEALTHY",
        careerGamesMissedToInjury: 0,
      },
    },
  ]);
}

/** Neutral asset value - no club philosophy applied. */
const neutral = (a: TradePlayerAsset) =>
  Number(
    computePlayerTradeValue({
      season: S,
      overallRating: a.overallRating,
      potentialRating: a.potentialRating,
      age: a.age,
      currentSalaryCents: a.currentSalaryCents,
      injuryStatus: a.injuryStatus,
      careerGamesMissedToInjury: a.careerGamesMissedToInjury,
    }),
  );

const strengths = [...teams.entries()]
  .map(([t, r]) => ({ t, s: computeTeamStrength(r.map((o) => o.asset.overallRating)) }))
  .sort((a, b) => a.s - b.s);
const identityOf = new Map(
  strengths.map((e, i) => {
    const roster = teams.get(e.t)!;
    const avgAge = roster.reduce((s, o) => s + o.asset.age, 0) / roster.length;
    return [e.t, computeTeamIdentity(i / (strengths.length - 1), avgAge)];
  }),
);

/**
 * The offer the user builds: one player, priced consistently, whose rating is
 * the continuous knob. A fixed age of 27 and a matching position keep the age
 * multipliers and the need bonus out of the search.
 */
function offerAt(rating: number, position: TradePlayerAsset["position"]): TradePlayerAsset {
  const salary = BigInt(
    priceContractCents({
      season: S,
      quality: contractQualityScore({
        overallRating: rating,
        performanceScore: null,
        gamesPlayed: 0,
      }),
      age: 27,
      yearsOfExperience: 7,
      position,
    }),
  );
  return {
    type: "PLAYER",
    overallRating: rating,
    potentialRating: rating,
    age: 27,
    position,
    currentSalaryCents: salary,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
  };
}

line();
console.log("T-P2-4 - THE EDGE FROM A DETERMINISTIC ACCEPTANCE THRESHOLD");
line();
console.log(
  `  ACCEPT_THRESHOLD ${ACCEPT_THRESHOLD} - naive expectation is a ` +
    `${((1 / ACCEPT_THRESHOLD - 1) * 100).toFixed(1)}% edge.`,
);
console.log(`  measured in NEUTRAL asset value, which is what the user's book gains.\n`);
console.log(`  30 clubs x ${ALL_GM_PERSONALITIES.length} GM personalities.
`);

const edges: number[] = [];
const byIdentity = new Map<string, number[]>();
const byPersonality = new Map<string, number[]>();

for (const personality of ALL_GM_PERSONALITIES)
for (const { t } of strengths) {
  const roster = teams.get(t)!;
  const identity = identityOf.get(t)!;
  const needs = computeTeamNeeds(
    roster.map((o) => ({ position: o.asset.position, overallRating: o.asset.overallRating })),
  );
  const respondingTeam = {
    identity,
    needs,
    personality,
    roster: roster.map((o) => ({ overallRating: o.asset.overallRating, age: o.asset.age })),
  };
  // Target: the club's 4th-best player - good enough to matter, not untouchable.
  const target = [...roster].sort((a, b) => b.asset.overallRating - a.asset.overallRating)[3];
  if (!target) continue;

  const accepts = (rating: number) =>
    evaluateTradeOffer({
      respondingTeam,
      currentSeason: S,
      incoming: [offerAt(rating, target.asset.position)],
      outgoing: [target.asset],
    }).decision === "ACCEPT";

  // Bracket, then binary-search the flip point.
  if (!accepts(99)) continue;
  let lo = 40;
  let hi = 99;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (accepts(mid)) hi = mid;
    else lo = mid;
  }
  const minAccepted = offerAt(hi, target.asset.position);
  const edge = neutral(target.asset) / neutral(minAccepted) - 1;
  edges.push(edge);
  byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), edge]);
  byPersonality.set(personality, [...(byPersonality.get(personality) ?? []), edge]);
}

const sorted = [...edges].sort((a, b) => a - b);
console.log(`\n  clubs measured: ${edges.length}`);
console.log(
  `  user edge per trade: median ${(sorted[Math.floor(sorted.length / 2)] * 100).toFixed(1)}%, ` +
    `mean ${(mean(edges) * 100).toFixed(1)}%, best ${(sorted[sorted.length - 1] * 100).toFixed(1)}%`,
);
console.log(`\n  by GM personality - the threshold multiplier sets a ceiling of`);
console.log(`  1/(0.95 x mult) - 1. Anything ABOVE that ceiling is the philosophy`);
console.log(`  weights amplifying the search, not the threshold.\n`);
console.log(
  `${"PERSONALITY".padStart(18)}${"MULT".padStart(7)}${"CEILING".padStart(10)}` +
    `${"MEAN".padStart(9)}${"BEST".padStart(9)}${"OVER CEILING".padStart(15)}`,
);
for (const [p, xs] of [...byPersonality.entries()].sort((a, b) => mean(b[1]) - mean(a[1]))) {
  const mult =
    GM_PERSONALITY_WEIGHTS[p as keyof typeof GM_PERSONALITY_WEIGHTS]
      .acceptanceThresholdMultiplier;
  const ceiling = 1 / (ACCEPT_THRESHOLD * mult) - 1;
  const over = xs.filter((e) => e > ceiling + 0.001).length;
  console.log(
    `${p.padStart(18)}${mult.toFixed(2).padStart(7)}` +
      `${`${(ceiling * 100).toFixed(1)}%`.padStart(10)}` +
      `${`${(mean(xs) * 100).toFixed(1)}%`.padStart(9)}` +
      `${`${(Math.max(...xs) * 100).toFixed(1)}%`.padStart(9)}` +
      `${`${over}/${xs.length}`.padStart(15)}`,
  );
}

console.log(`\n  by club identity:`);
for (const [id, xs] of byIdentity) {
  console.log(
    `    ${id.padEnd(16)} n=${String(xs.length).padStart(2)}  mean ${(mean(xs) * 100).toFixed(1)}%`,
  );
}
line();
