/**
 * Fits `ACCEPT_THRESHOLD` against two objectives at once.
 *
 * docs/TRADE_EXPLOIT_AUDIT.md P0-1 measured +25.7% asset value across eight
 * greedy trades — but the harness that produced it assumed arbitrary players
 * available from any club on demand, no salary matching, no roster limits and
 * no asset ownership. That figure is an upper bound, not a measurement, and the
 * stage-1 fix attempt was abandoned partly because nobody knew the real number.
 *
 * This measures it. Same greedy attack, same evaluator, but against the actual
 * seeded league:
 *
 *   - 30 real rosters, 15 players each, priced by the corrected contract model
 *   - a target must actually be owned by the club being asked for it
 *   - salary matching enforced via `maxIncomingSalaryCents`, in both directions
 *   - roster limits enforced on both sides
 *   - each club's apron level computed from its own real payroll
 *
 * Reads only, no database. Run: npx tsx scripts/trade-threshold-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  evaluateTradeOffer,
  type TradeAssetForEvaluation,
  type TradePlayerAsset,
} from "../src/lib/trade/evaluateTradeOffer";
import { computePlayerTradeValue } from "../src/lib/gm/playerTradeValue";
import { contractQualityScore, priceContractCents } from "../src/lib/contracts/priceContract";
import { maxIncomingSalaryCents } from "../src/lib/trade/salaryMatching";
import { getApronLevel } from "../src/lib/cap/apron";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeTeamIdentity } from "../src/lib/gm/teamIdentity";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "../src/lib/data-sources/rosterConstruction";

const S = 2026;
const rules = getSeasonCapRules(S);
const usd = (c: bigint | number) => `$${(Number(c) / 1e8).toFixed(1)}M`;
const line = (n = 92) => console.log("=".repeat(n));

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

interface Owned { asset: TradePlayerAsset; name: string }
const teams = new Map<string, Owned[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
  const src = { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear ?? null };
  const age = resolvePlayerAge(src, S);
  const exp = resolvePlayerExperience(src, S);
  const salary = BigInt(priceContractCents({
    season: S,
    quality: contractQualityScore({ overallRating: p.seedOverallRating, performanceScore: null, gamesPlayed: 0 }),
    age, yearsOfExperience: exp, position: p.position,
  }));
  const pos = (["PG", "SG", "SF", "PF", "C"] as const).includes(p.position.toUpperCase() as never)
    ? (p.position.toUpperCase() as TradePlayerAsset["position"]) : "SF";
  const asset: TradePlayerAsset = {
    type: "PLAYER", overallRating: p.seedOverallRating,
    potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
    age, position: pos, currentSalaryCents: salary,
    injuryStatus: "HEALTHY", careerGamesMissedToInjury: 0,
  };
  teams.set(p.teamAbbreviation, [...(teams.get(p.teamAbbreviation) ?? []), { asset, name: p.fullName }]);
}

const payroll = (r: Owned[]) => r.reduce((s, o) => s + o.asset.currentSalaryCents, 0n);
const apron = (r: Owned[]) => getApronLevel(payroll(r), rules);
const value = (a: TradeAssetForEvaluation) =>
  a.type === "PLAYER"
    ? Number(computePlayerTradeValue({
        season: S, overallRating: a.overallRating, potentialRating: a.potentialRating,
        age: a.age, currentSalaryCents: a.currentSalaryCents,
        injuryStatus: a.injuryStatus, careerGamesMissedToInjury: a.careerGamesMissedToInjury,
      }))
    : 0;
const bookValue = (r: Owned[]) => r.reduce((s, o) => s + value(o.asset), 0);

/** League-wide competitiveness percentiles, for each club's identity. */
const strengths = [...teams.entries()].map(([t, r]) => ({
  team: t, strength: computeTeamStrength(r.map((o) => o.asset.overallRating)),
}));
const sorted = [...strengths].sort((a, b) => a.strength - b.strength);
const identityOf = new Map(
  sorted.map((e, i) => {
    const pct = i / (sorted.length - 1);
    const avgAge = teams.get(e.team)!.reduce((s, o) => s + o.asset.age, 0) / teams.get(e.team)!.length;
    return [e.team, computeTeamIdentity(pct, avgAge)];
  }),
);

/** Salary matching, applied to whichever side needs it. */
function legal(sideOut: bigint, sideIn: bigint, r: Owned[]): boolean {
  return sideIn <= maxIncomingSalaryCents(sideOut, apron(r), rules);
}

const USER = sorted[Math.floor(sorted.length / 2)].team; // a median club

/** Runs the greedy chain at a given acceptance threshold; returns the gain. */
function chainGain(threshold: number): { gain: number; steps: number } {
  let mine = [...teams.get(USER)!];
  const others = new Map(
    [...teams.entries()].filter(([t]) => t !== USER).map(([t, r]) => [t, [...r]]),
  );
  const startBook = bookValue(mine);
  let step = 0;
  for (; step < 15; step++) {
    let best: { gain: number; give: Owned[]; get: Owned; from: string } | null = null;
    for (const [team, roster] of others) {
      const identity = identityOf.get(team)!;
      for (const target of roster) {
        for (let i = 0; i < mine.length; i++) {
          for (let j = i; j < mine.length; j++) {
            const give = i === j ? [mine[i]] : [mine[i], mine[j]];
            const outCents = give.reduce((s, o) => s + o.asset.currentSalaryCents, 0n);
            const inCents = target.asset.currentSalaryCents;
            if (!legal(outCents, inCents, mine)) continue;
            if (!legal(inCents, outCents, roster)) continue;
            if (mine.length - give.length + 1 > DEFAULT_MAX_ROSTER_SIZE) continue;
            if (roster.length - 1 + give.length > DEFAULT_MAX_ROSTER_SIZE) continue;
            const r = evaluateTradeOffer({
              respondingTeam: {
                identity, needs: [], personality: "BALANCED",
                roster: roster.map((o) => ({ overallRating: o.asset.overallRating, age: o.asset.age })),
              },
              currentSeason: S, acceptThresholdOverride: threshold,
              incoming: give.map((o) => o.asset), outgoing: [target.asset],
            });
            if (r.decision !== "ACCEPT") continue;
            const gain = value(target.asset) - give.reduce((s, o) => s + value(o.asset), 0);
            if (gain > 0 && (!best || gain > best.gain)) best = { gain, give, get: target, from: team };
          }
        }
      }
    }
    if (!best) break;
    mine = mine.filter((o) => !best!.give.includes(o));
    mine.push(best.get);
    const from = others.get(best.from)!;
    others.set(best.from, [...from.filter((o) => o !== best!.get), ...best.give]);
  }
  return { gain: (bookValue(mine) / startBook - 1) * 100, steps: step };
}

/**
 * A proxy for how alive the CPU-to-CPU market is: across every ordered pair of
 * real clubs and a sample of their players, how many one-for-one swaps would
 * BOTH sides accept? Raising the acceptance bar suppresses this, which is the
 * cost being traded against exploit resistance.
 */
function cpuMarketLiveliness(threshold: number): number {
  const entries = [...teams.entries()];
  let mutual = 0;
  let considered = 0;
  for (let a = 0; a < entries.length; a += 3) {
    for (let b = 0; b < entries.length; b += 3) {
      if (a === b) continue;
      const [ta, ra] = entries[a];
      const [tb, rb] = entries[b];
      for (let i = 0; i < ra.length; i += 4) {
        for (let j = 0; j < rb.length; j += 4) {
          const pa = ra[i].asset, pb = rb[j].asset;
          if (!legal(pa.currentSalaryCents, pb.currentSalaryCents, ra)) continue;
          if (!legal(pb.currentSalaryCents, pa.currentSalaryCents, rb)) continue;
          considered++;
          const aSide = evaluateTradeOffer({
            respondingTeam: {
              identity: identityOf.get(ta)!, needs: [], personality: "BALANCED",
              roster: ra.map((o) => ({ overallRating: o.asset.overallRating, age: o.asset.age })),
            },
            currentSeason: S, acceptThresholdOverride: threshold,
            incoming: [pb], outgoing: [pa],
          });
          if (aSide.decision !== "ACCEPT") continue;
          const bSide = evaluateTradeOffer({
            respondingTeam: {
              identity: identityOf.get(tb)!, needs: [], personality: "BALANCED",
              roster: rb.map((o) => ({ overallRating: o.asset.overallRating, age: o.asset.age })),
            },
            currentSeason: S, acceptThresholdOverride: threshold,
            incoming: [pa], outgoing: [pb],
          });
          if (bSide.decision === "ACCEPT") mutual++;
        }
      }
    }
  }
  return considered === 0 ? 0 : (mutual / considered) * 100;
}

line();
console.log("ACCEPT_THRESHOLD CALIBRATION");
line();
console.log("  two objectives: chain gain under ~5% over 15 steps, and a CPU market");
console.log("  that still clears trades. Raising the bar helps the first, hurts the second.");
console.log(`${"THRESHOLD".padStart(11)}${"CHAIN GAIN".padStart(13)}${"STEPS".padStart(8)}${"CPU MUTUAL".padStart(13)}`);
for (const t of [0.95, 1.0, 1.05, 1.1, 1.15, 1.2]) {
  const c = chainGain(t);
  const m = cpuMarketLiveliness(t);
  console.log(
    `${t.toFixed(2).padStart(11)}${(c.gain.toFixed(1) + "%").padStart(13)}${String(c.steps).padStart(8)}${(m.toFixed(1) + "%").padStart(13)}`,
  );
}
line();
process.exit(0);
