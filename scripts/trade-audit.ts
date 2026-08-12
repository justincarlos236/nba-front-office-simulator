/**
 * Trade system audit harness.
 *
 * The trade model is the most exploitable surface in the game: it is the one
 * place where a user can convert judgement into unlimited value, and unlike
 * free agency or the draft it has no per-season budget. If `evaluateTradeOffer`
 * misprices anything, the whole save falls over.
 *
 * This measures the shipped model against the real seeded league - real
 * ratings, real ages, real contracts - rather than synthetic players, because
 * the pathologies that matter are the ones reachable on turn one of a save.
 *
 * Reads only. Run: npx tsx scripts/trade-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computePlayerTradeValue } from "../src/lib/gm/playerTradeValue";
import { computeDraftPickTradeValue } from "../src/lib/gm/draftPickTradeValue";
import {
  evaluateTradeOffer,
  type TradePlayerAsset,
  type TradeAssetForEvaluation,
} from "../src/lib/trade/evaluateTradeOffer";
import {
  ALL_GM_PERSONALITIES,
  GM_PERSONALITY_WEIGHTS,
  type GmPersonality,
} from "../src/lib/gm/gmPersonality";
import { ACCEPT_THRESHOLD, MAX_REPORTED_SCORE } from "../src/lib/trade/evaluateTradeOffer";
import type { TeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { resolvePlayerAge } from "../src/lib/players/age";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { scoreToCapFraction } from "../src/lib/valuation/playerValue";
import { ageValueMultiplier } from "../src/lib/valuation/ageCurve";

const SEASON = 2025;
const CAP = Number(getSeasonCapRules(SEASON).salaryCapCents);
const M = (cents: number | bigint) => Number(cents) / 100_000_000; // cents -> $M
const fmtM = (cents: number | bigint) => `$${M(cents).toFixed(1)}M`;
const line = (n = 78) => "=".repeat(n);

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

interface P extends TradePlayerAsset {
  name: string;
  team: string;
}

const league: P[] = ds.players
  .filter((p) => p.teamAbbreviation && p.seedOverallRating)
  .map((p) => {
    const year = p.contract?.years.find((y) => y.season === SEASON);
    return {
      type: "PLAYER" as const,
      name: p.fullName,
      team: p.teamAbbreviation!,
      overallRating: p.seedOverallRating!,
      potentialRating: p.seedPotentialRating ?? p.seedOverallRating!,
      age: resolvePlayerAge(
        { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
        SEASON,
      ),
      position: p.position,
      currentSalaryCents: BigInt(year?.salaryCents ?? 250_000_00),
      injuryStatus: "HEALTHY" as const,
      careerGamesMissedToInjury: 0,
    };
  });

const value = (p: TradePlayerAsset) =>
  computePlayerTradeValue({ season: SEASON, ...p, currentSalaryCents: p.currentSalaryCents });

const synth = (over: Partial<TradePlayerAsset> = {}): TradePlayerAsset => ({
  type: "PLAYER",
  overallRating: 75,
  potentialRating: 75,
  age: 27,
  position: "SF",
  currentSalaryCents: BigInt(Math.round(CAP * scoreToCapFraction(75))),
  injuryStatus: "HEALTHY",
  careerGamesMissedToInjury: 0,
  ...over,
});

/* ------------------------------------------------------------------ */
console.log(line());
console.log("T1  TRADE VALUE vs AGE, at a fixed rating and a fixed salary");
console.log(line());
console.log(
  `${"RATING".padStart(7)}${"AGE".padStart(5)}${"agedScore".padStart(11)}${"capFrac".padStart(9)}${"VALUE".padStart(11)}${"vs age 27".padStart(11)}`,
);
for (const rating of [93, 85, 75]) {
  const at27 = Number(
    value(synth({ overallRating: rating, potentialRating: rating, age: 27, currentSalaryCents: 0n })),
  );
  for (const age of [22, 27, 31, 34, 37, 40]) {
    const aged = Math.min(100, rating * ageValueMultiplier(age));
    const v = Number(
      value(synth({ overallRating: rating, potentialRating: rating, age, currentSalaryCents: 0n })),
    );
    console.log(
      `${String(rating).padStart(7)}${String(age).padStart(5)}${aged.toFixed(1).padStart(11)}${scoreToCapFraction(aged).toFixed(4).padStart(9)}${fmtM(v).padStart(11)}${(v / at27).toFixed(3).padStart(11)}`,
    );
  }
  console.log("");
}

/* ------------------------------------------------------------------ */
console.log(line());
console.log("T2  THE REAL LEAGUE'S 25 BEST PLAYERS, BY TRADE VALUE");
console.log(line());
const byRating = [...league].sort((a, b) => b.overallRating - a.overallRating);
console.log(
  `${"PLAYER".padEnd(26)}${"OVR".padStart(4)}${"AGE".padStart(5)}${"SALARY".padStart(10)}${"TRADE VALUE".padStart(13)}`,
);
for (const p of byRating.slice(0, 25)) {
  console.log(
    `${p.name.slice(0, 25).padEnd(26)}${String(p.overallRating).padStart(4)}${String(p.age).padStart(5)}${fmtM(p.currentSalaryCents).padStart(10)}${fmtM(value(p)).padStart(13)}`,
  );
}

const zeroed = league.filter((p) => value(p) === 0n);
const nearZero = league.filter((p) => Number(value(p)) < 1_000_000_00 && p.overallRating >= 80);
console.log(`\n  Players with a trade value of EXACTLY ZERO: ${zeroed.length} of ${league.length}`);
console.log(`  Players rated 80+ worth under $1M in trade:  ${nearZero.length}`);
for (const p of nearZero.slice(0, 14)) {
  console.log(
    `    ${p.name.slice(0, 24).padEnd(25)} ovr ${p.overallRating}  age ${p.age}  paid ${fmtM(p.currentSalaryCents)}  worth ${fmtM(value(p))}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T3  IS VALUE MONOTONE IN RATING? (holding age + salary fixed)");
console.log(line());
let inversions = 0;
let prev = -1;
for (let r = 60; r <= 99; r++) {
  const v = Number(value(synth({ overallRating: r, potentialRating: r, currentSalaryCents: 0n })));
  if (prev >= 0 && v < prev) inversions++;
  prev = v;
}
console.log(`  Rating inversions (unsalaried, age 27): ${inversions}`);
let salaryInversions = 0;
prev = Number.MAX_SAFE_INTEGER;
for (let s = 0; s <= 60; s += 2) {
  const v = Number(value(synth({ currentSalaryCents: BigInt(s * 100_000_000) })));
  if (v > prev) salaryInversions++;
  prev = v;
}
console.log(`  Salary inversions (higher pay -> higher value): ${salaryInversions}`);

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T4  DOES A BAD CONTRACT EVER COST ANYTHING? (85 ovr, age 30)");
console.log(line());
console.log(`${"SALARY".padStart(10)}${"TRADE VALUE".padStart(14)}${"marginal".padStart(12)}`);
let last: number | null = null;
for (const sal of [0, 10, 20, 30, 40, 50, 60, 80, 100, 150]) {
  const v = Number(
    value(
      synth({
        overallRating: 85,
        potentialRating: 85,
        age: 30,
        currentSalaryCents: BigInt(sal * 100_000_000),
      }),
    ),
  );
  console.log(
    `${("$" + sal + "M").padStart(10)}${fmtM(v).padStart(14)}${(last === null ? "-" : fmtM(v - last)).padStart(12)}`,
  );
  last = v;
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T5  ARBITRAGE: does ONE team accept the same swap in both directions?");
console.log(line());
console.log(
  "  Two teams with different needs can both genuinely gain from a swap - that is\n" +
    "  why trade exists, and counting those as defects (as the first version of this\n" +
    "  harness did) confuses gains-from-trade with a bug. The unambiguous test holds\n" +
    "  preferences FIXED: ask a single team both 'give a, get b' and 'give b, get a'.\n" +
    "  Accepting both is pure arbitrage - the same asset priced differently\n" +
    "  depending on which way it moves.\n",
);

const identities: TeamIdentity[] = ["CONTENDER", "PLAYOFF_TEAM", "PLAY_IN_TEAM", "REBUILDING", "TANKING"];
const rosterOf = (team: string) =>
  league.filter((p) => p.team === team).map((p) => ({ overallRating: p.overallRating, age: p.age }));
const teams = [...new Set(league.map((p) => p.team))];

function ask(
  identity: TeamIdentity,
  personality: GmPersonality,
  team: string,
  incoming: TradeAssetForEvaluation[],
  outgoing: TradeAssetForEvaluation[],
) {
  const roster = league.filter((p) => p.team === team);
  return evaluateTradeOffer({
    respondingTeam: {
      identity,
      needs: computeTeamNeeds(
        roster.map((p) => ({ position: p.position, overallRating: p.overallRating })),
      ),
      personality,
      roster: rosterOf(team),
    },
    currentSeason: SEASON,
    incoming,
    outgoing,
  });
}

let pairs = 0;
let doubleAccept = 0;
const examples: string[] = [];
for (let i = 0; i < 220; i++) {
  const a = league[(i * 7) % league.length];
  const b = league[(i * 13 + 5) % league.length];
  if (a.team === b.team) continue;
  for (const identity of identities) {
    for (const personality of ALL_GM_PERSONALITIES) {
      pairs++;
      // Same team, same identity, same personality, same needs - only the
      // direction of the swap changes.
      const forward = ask(identity, personality, a.team, [b], [a]);
      const backward = ask(identity, personality, a.team, [a], [b]);
      if (forward.decision === "ACCEPT" && backward.decision === "ACCEPT") {
        doubleAccept++;
        if (examples.length < 6 && a.overallRating !== b.overallRating) {
          examples.push(
            `    [${identity}/${personality}] ` +
              `${a.name.slice(0, 18)} (${a.overallRating}, ${fmtM(value(a))}) <-> ` +
              `${b.name.slice(0, 18)} (${b.overallRating}, ${fmtM(value(b))})` +
              `  scores ${forward.score.toFixed(2)} / ${backward.score.toFixed(2)}`,
          );
        }
      }
    }
  }
}
console.log(
  `  Fixed-preference mirror pairs tested: ${pairs}` +
    `    BOTH-WAYS ACCEPTS: ${doubleAccept}  (${((doubleAccept / pairs) * 100).toFixed(2)}%)`,
);
console.log(
  `  ACCEPT_THRESHOLD ${ACCEPT_THRESHOLD} makes a team indifferent within ` +
    `${(((1 / ACCEPT_THRESHOLD - ACCEPT_THRESHOLD) / 2) * 100).toFixed(1)}%, so pairs that close\n` +
    "  together are EXPECTED to clear both ways. Only a both-ways accept on a pair\n" +
    "  further apart than that is arbitrage - see T11 for the direct test.",
);
for (const e of examples) console.log(e);

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T6  QUANTITY EXPLOIT: how many spare parts buy a superstar?");
console.log(line());
const star = byRating[0];
console.log(
  `  Target: ${star.name} (ovr ${star.overallRating}, age ${star.age}, worth ${fmtM(value(star))})\n`,
);
const filler = league
  .filter((p) => p.overallRating >= 68 && p.overallRating <= 74 && p.age <= 25)
  .sort((a, b) => Number(value(b)) - Number(value(a)));
console.log(`  Filler pool: ${filler.length} players rated 68-74, age <= 25`);
for (const identity of ["REBUILDING", "TANKING", "PLAY_IN_TEAM"] as TeamIdentity[]) {
  let n = 0;
  let got = false;
  for (n = 1; n <= 14; n++) {
    const pkg = filler.slice(0, n);
    const r = ask(identity, "BALANCED", star.team, pkg, [star]);
    if (r.decision === "ACCEPT") {
      const paid = pkg.reduce((s, p) => s + Number(value(p)), 0);
      console.log(
        `  ${identity.padEnd(13)} accepts at ${n} players. Objective value paid ${fmtM(paid)} for ${fmtM(value(star))}` +
          `  (${((paid / Number(value(star))) * 100).toFixed(0)}%)`,
      );
      got = true;
      break;
    }
  }
  if (!got) console.log(`  ${identity.padEnd(13)} never accepts up to 14 players.`);
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T7  SALARY DUMP: will a CPU team absorb an albatross for nothing?");
console.log(line());
const albatross = synth({
  overallRating: 70,
  potentialRating: 70,
  age: 33,
  currentSalaryCents: BigInt(50 * 100_000_000),
});
console.log(
  `  Albatross: ovr 70, age 33, paid ${fmtM(albatross.currentSalaryCents)}, trade value ${fmtM(value(albatross))}`,
);
for (const identity of identities) {
  const r = ask(identity, "SALARY_CONSCIOUS", teams[0], [albatross], []);
  console.log(`    ${identity.padEnd(14)} SALARY_CONSCIOUS -> ${r.decision}  (score ${r.score})`);
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T8  UNTOUCHABLE GATE: can stacked bonuses pry a superstar loose?");
console.log(line());
const superstar = byRating.find((p) => p.overallRating >= 93)!;
console.log(
  `  Target: ${superstar.name} (ovr ${superstar.overallRating}, age ${superstar.age}, worth ${fmtM(value(superstar))})`,
);
const youngNeedFiller = league
  .filter((p) => p.age <= 25 && p.overallRating >= 72 && p.overallRating < 80)
  .sort((a, b) => Number(value(b)) - Number(value(a)));
for (const [identity, personality] of [
  ["REBUILDING", "PROSPECT_LOVER"],
  ["TANKING", "PROSPECT_LOVER"],
  ["CONTENDER", "BALANCED"],
] as [TeamIdentity, GmPersonality][]) {
  for (let n = 1; n <= 10; n++) {
    const pkg = youngNeedFiller.slice(0, n);
    const r = ask(identity, personality, superstar.team, pkg, [superstar]);
    if (r.decision === "ACCEPT") {
      const paid = pkg.reduce((s, p) => s + Number(value(p)), 0);
      console.log(
        `  ${identity}/${personality}: accepts ${n} young players, objective ${fmtM(paid)} vs ${fmtM(value(superstar))}` +
          ` (${((paid / Number(value(superstar))) * 100).toFixed(0)}%)`,
      );
      break;
    }
    if (n === 10) console.log(`  ${identity}/${personality}: holds through 10 players.`);
  }
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T9  PICK PRICING: what is a pick worth against a player?");
console.log(line());
console.log(
  `${"PICK".padEnd(22)}${"VALUE".padStart(11)}${"= player rated".padStart(17)}`,
);
const ratingForValue = (target: number) => {
  for (let r = 60; r <= 99; r++) {
    if (
      Number(value(synth({ overallRating: r, potentialRating: r, currentSalaryCents: 0n }))) >= target
    )
      return r;
  }
  return 99;
};
for (const [label, round, pick, yearsOut] of [
  ["#1 overall, this year", 1, 1, 0],
  ["#5 overall, this year", 1, 5, 0],
  ["#14 overall, this year", 1, 14, 0],
  ["#30 overall, this year", 1, 30, 0],
  ["#1, three years out", 1, 1, 3],
  ["2nd rounder (#40)", 2, 40, 0],
] as [string, 1 | 2, number, number][]) {
  const v = computeDraftPickTradeValue({
    currentSeason: SEASON,
    pickSeason: SEASON + yearsOut,
    round,
    overallPickNumber: pick,
    originalTeamCompetitivenessPercentile: 0.5,
  });
  console.log(
    `${label.padEnd(22)}${fmtM(v).padStart(11)}${String(ratingForValue(Number(v))).padStart(17)}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T10 LEAGUE SWEEP: the best player acquirable for a fixed junk package");
console.log(line());
console.log(
  "  Package: the user's three least valuable rostered players. Ask every CPU team\n" +
    "  for its best player. Report the best ACCEPT found, per personality.\n",
);
const userTeam = teams[0];
const junk = league
  .filter((p) => p.team === userTeam)
  .sort((a, b) => Number(value(a)) - Number(value(b)))
  .slice(0, 3);
console.log(
  `  User team ${userTeam} sends: ${junk.map((p) => `${p.name} (${p.overallRating})`).join(", ")}`,
);
console.log(`  Package objective value: ${fmtM(junk.reduce((s, p) => s + Number(value(p)), 0))}\n`);
for (const personality of ALL_GM_PERSONALITIES) {
  let best: { p: P; identity: TeamIdentity } | null = null;
  for (const team of teams) {
    if (team === userTeam) continue;
    const roster = league.filter((p) => p.team === team);
    for (const identity of identities) {
      for (const target of roster) {
        const r = ask(identity, personality, team, junk, [target]);
        if (r.decision !== "ACCEPT") continue;
        if (!best || target.overallRating > best.p.overallRating) best = { p: target, identity };
      }
    }
  }
  console.log(
    best
      ? `  ${personality.padEnd(18)} best acquirable: ${best.p.name.slice(0, 22).padEnd(23)} ovr ${best.p.overallRating}  age ${best.p.age}  (${best.identity})`
      : `  ${personality.padEnd(18)} nothing acquirable.`,
  );
}
console.log("");

/* ------------------------------------------------------------------ */
console.log(line());
console.log("T11 DIRECTIONAL PRICING: is one asset priced the same both ways?");
console.log(line());
console.log(
  "  The direct test, independent of any acceptance threshold. For one fixed team,\n" +
    "  price the SAME player as an incoming asset and as an outgoing asset. Any gap\n" +
    "  is arbitrage: the team would buy and sell him simultaneously at a profit.\n",
);
// Swap X against a fixed neutral reference asset R, both ways. When both
// assets carry positive value, score is exactly in/out, so the two directions
// are reciprocals and their product is exactly 1 under symmetric pricing.
//
// Restricted to positive-valued assets on purpose: `score` falls back to a
// cap-sized reference denominator when the outgoing side is <= 0 (a ratio
// cannot express "shedding a liability"), which breaks the reciprocal
// relationship for display reasons that have nothing to do with directional
// pricing. Inside this range the metric is exact.
const reference = synth({ overallRating: 75, potentialRating: 75, age: 27 });
// Split by whether the GM has a neutral `badContractSensitivityMultiplier`.
// That one preference is deliberately one-sided - it is about what a team is
// willing to take ON - so for those personalities a deviation is the intended
// behaviour. For a neutral GM the product must be exactly 1.
const buckets = { neutral: { n: 0, off: 0, worst: 1, label: "none" }, sensitive: { n: 0, off: 0, worst: 1, label: "none" } };
for (const identity of identities) {
  for (const personality of ALL_GM_PERSONALITIES) {
    const bucket =
      GM_PERSONALITY_WEIGHTS[personality].badContractSensitivityMultiplier === 1
        ? buckets.neutral
        : buckets.sensitive;
    for (const team of teams.slice(0, 8)) {
      for (const p of league.filter((q) => q.team === team)) {
        if (value(p) <= 0n) continue;
        const forward = ask(identity, personality, team, [p], [reference]);
        const backward = ask(identity, personality, team, [reference], [p]);
        // Skip probes where the display clamp, not the model, sets the number.
        if (forward.score >= MAX_REPORTED_SCORE || backward.score >= MAX_REPORTED_SCORE) continue;
        if (forward.score <= 0 || backward.score <= 0) continue;
        bucket.n++;
        const product = forward.score * backward.score;
        if (Math.abs(product - 1) > 0.01) bucket.off++;
        if (Math.abs(product - 1) > Math.abs(bucket.worst - 1)) {
          bucket.worst = product;
          bucket.label = `${p.name} (${p.overallRating}/${p.age}) at ${identity}/${personality}`;
        }
      }
    }
  }
}
for (const [label, b] of [
  ["Neutral bad-contract GMs (product MUST be 1.0)", buckets.neutral],
  ["Bad-contract-sensitive GMs (asymmetry intended)", buckets.sensitive],
] as const) {
  console.log(`  ${label}`);
  console.log(`    probes ${b.n}   deviating >1%: ${b.off}   worst product ${b.worst.toFixed(4)}`);
  if (b.off > 0) console.log(`    worst case: ${b.label}`);
}

console.log("\n  Round-trip score product for a need-filling young centre:");
const probe = synth({ overallRating: 76, potentialRating: 84, age: 23, position: "C" });
for (const [identity, personality, label] of [
  ["REBUILDING", "PROSPECT_LOVER", "young + rebuilding + prospect-lover + fills need"],
  ["CONTENDER", "WIN_NOW", "veteran-seeking contender"],
  ["BALANCED" as TeamIdentity, "BALANCED", "no bias at all"],
] as [TeamIdentity, GmPersonality, string][]) {
  const needyTeam = teams.find((t) =>
    computeTeamNeeds(
      league
        .filter((p) => p.team === t)
        .map((p) => ({ position: p.position, overallRating: p.overallRating })),
    ).includes("RIM_PROTECTOR"),
  );
  if (!needyTeam) continue;
  const asIncoming = ask(identity, personality, needyTeam, [probe], [synth({ overallRating: 76, potentialRating: 84, age: 23 })]);
  const asOutgoing = ask(identity, personality, needyTeam, [synth({ overallRating: 76, potentialRating: 84, age: 23 })], [probe]);
  console.log(
    `    ${label.padEnd(46)} incoming/outgoing score ratio: ${(asIncoming.score * asOutgoing.score).toFixed(2)}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T12 CPU SELF-HARM: net objective value moved in mutually-accepted swaps");
console.log(line());
let swaps = 0;
let netGap = 0;
let biggestLoss = 0;
let biggestLossLabel = "";
for (let i = 0; i < 400; i++) {
  const a = league[(i * 11) % league.length];
  const b = league[(i * 17 + 3) % league.length];
  if (a.team === b.team) continue;
  const ra = ask("PLAYOFF_TEAM", "BALANCED", a.team, [b], [a]);
  const rb = ask("REBUILDING", "BALANCED", b.team, [a], [b]);
  if (ra.decision !== "ACCEPT" || rb.decision !== "ACCEPT") continue;
  swaps++;
  const gap = Math.abs(Number(value(a)) - Number(value(b)));
  netGap += gap;
  if (gap > biggestLoss) {
    biggestLoss = gap;
    biggestLossLabel = `${a.name} (${fmtM(value(a))}) for ${b.name} (${fmtM(value(b))})`;
  }
}
console.log(`  Mutually-accepted swaps found: ${swaps}`);
console.log(
  `  Mean objective value gap in an executed swap: ${swaps ? fmtM(netGap / swaps) : "n/a"}`,
);
console.log(`  Largest: ${biggestLossLabel || "none"}`);
console.log(
  "\n  Every one of these is a CPU-CPU trade the sim will actually execute, and\n" +
    "  the gap is value one CPU team hands the other for free.",
);

/* ------------------------------------------------------------------ */
console.log("\n" + line());
console.log("T13 TOP-END COMPRESSION: what does one more rating point buy?");
console.log(line());
console.log(
  `${"RATING".padStart(7)}${"VALUE (age 27, unpaid)".padStart(24)}${"x a 70-rated".padStart(14)}${"marginal/pt".padStart(13)}`,
);
const base70 = Number(value(synth({ overallRating: 70, potentialRating: 70, currentSalaryCents: 0n })));
let prevV: number | null = null;
let prevR = 0;
for (const r of [70, 75, 80, 85, 88, 90, 93, 96, 99]) {
  const v = Number(value(synth({ overallRating: r, potentialRating: r, currentSalaryCents: 0n })));
  // Per *point*, so unevenly spaced rows stay comparable.
  const marginal = prevV === null ? "-" : fmtM((v - prevV) / (r - prevR));
  console.log(
    `${String(r).padStart(7)}${fmtM(v).padStart(24)}${(v / base70).toFixed(2).padStart(14)}${marginal.padStart(13)}`,
  );
  prevV = v;
  prevR = r;
}
console.log(
  "\n  scoreToCapFraction is a logistic capped at 0.35 of the cap. Above ~90 it is\n" +
    "  nearly flat, so an MVP and a fringe All-Star price almost identically.",
);

const mvp = byRating[0];
const goodYoung = league
  .filter((p) => p.age <= 25 && p.overallRating >= 74 && p.overallRating <= 78)
  .sort((a, b) => Number(value(b)) - Number(value(a)))[0];
console.log(
  `\n  Real example: ${mvp.name} (ovr ${mvp.overallRating}) = ${fmtM(value(mvp))}` +
    `\n                ${goodYoung.name} (ovr ${goodYoung.overallRating}, age ${goodYoung.age}) = ${fmtM(value(goodYoung))}` +
    `\n                -> the MVP is worth ${(Number(value(mvp)) / Number(value(goodYoung))).toFixed(2)}x a good young role player.`,
);
