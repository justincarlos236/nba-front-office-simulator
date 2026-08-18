/**
 * How much of the trade-chain exploit survives real constraints?
 *
 * docs/audits/TRADE_EXPLOIT_AUDIT.md P0-1 measured +25.7% asset value across eight
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
 * Reads only, no database. Run: npx tsx scripts/trade-chain-constrained.ts
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
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const S = 2026;
const rules = getSeasonCapRules(S);
const usd = (c: bigint | number) => `$${(Number(c) / 1e8).toFixed(1)}M`;
const line = (n = 92) => console.log("=".repeat(n));

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
  const exp = resolvePlayerExperience(src, S);
  const salary = BigInt(
    priceContractCents({
      season: S,
      quality: contractQualityScore({
        overallRating: p.seedOverallRating,
        performanceScore: null,
        gamesPlayed: 0,
      }),
      age,
      yearsOfExperience: exp,
      position: p.position,
    }),
  );
  const pos = (["PG", "SG", "SF", "PF", "C"] as const).includes(p.position.toUpperCase() as never)
    ? (p.position.toUpperCase() as TradePlayerAsset["position"])
    : "SF";
  const asset: TradePlayerAsset = {
    type: "PLAYER",
    overallRating: p.seedOverallRating,
    potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
    age,
    position: pos,
    currentSalaryCents: salary,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
  };
  teams.set(p.teamAbbreviation, [
    ...(teams.get(p.teamAbbreviation) ?? []),
    { asset, name: p.fullName },
  ]);
}

const payroll = (r: Owned[]) => r.reduce((s, o) => s + o.asset.currentSalaryCents, 0n);
const apron = (r: Owned[]) => getApronLevel(payroll(r), rules);
const value = (a: TradeAssetForEvaluation) =>
  a.type === "PLAYER"
    ? Number(
        computePlayerTradeValue({
          season: S,
          overallRating: a.overallRating,
          potentialRating: a.potentialRating,
          age: a.age,
          currentSalaryCents: a.currentSalaryCents,
          injuryStatus: a.injuryStatus,
          careerGamesMissedToInjury: a.careerGamesMissedToInjury,
        }),
      )
    : 0;
const bookValue = (r: Owned[]) => r.reduce((s, o) => s + value(o.asset), 0);

/** League-wide competitiveness percentiles, for each club's identity. */
const strengths = [...teams.entries()].map(([t, r]) => ({
  team: t,
  strength: computeTeamStrength(r.map((o) => o.asset.overallRating)),
}));
const sorted = [...strengths].sort((a, b) => a.strength - b.strength);
const identityOf = new Map(
  sorted.map((e, i) => {
    const pct = i / (sorted.length - 1);
    const avgAge =
      teams.get(e.team)!.reduce((s, o) => s + o.asset.age, 0) / teams.get(e.team)!.length;
    return [e.team, computeTeamIdentity(pct, avgAge)];
  }),
);

/** Salary matching, applied to whichever side needs it. */
function legal(sideOut: bigint, sideIn: bigint, r: Owned[]): boolean {
  return sideIn <= maxIncomingSalaryCents(sideOut, apron(r), rules);
}

const USER = sorted[Math.floor(sorted.length / 2)].team; // a median club
let mine = [...teams.get(USER)!];
const others = new Map(
  [...teams.entries()].filter(([t]) => t !== USER).map(([t, r]) => [t, [...r]]),
);

line();
console.log("TRADE CHAIN UNDER REAL CONSTRAINTS");
line();
console.log(`  user club: ${USER}  (${identityOf.get(USER)})`);
console.log(`  starting book value ${usd(bookValue(mine))}, payroll ${usd(payroll(mine))}`);
console.log(`  best player ${Math.max(...mine.map((o) => o.asset.overallRating))}\n`);
console.log(
  `${"STEP".padStart(5)}${"GAVE".padStart(26)}${"GOT".padStart(26)}${"GAIN".padStart(10)}${"BOOK".padStart(11)}${"BEST".padStart(6)}`,
);

const startBook = bookValue(mine);
const startBest = Math.max(...mine.map((o) => o.asset.overallRating));
let step = 0;
for (; step < 15; step++) {
  let best: { gain: number; give: Owned[]; get: Owned; from: string } | null = null;

  for (const [team, roster] of others) {
    const identity = identityOf.get(team)!;
    for (const target of roster) {
      // Pay with one or two of our own players.
      for (let i = 0; i < mine.length; i++) {
        for (let j = i; j < mine.length; j++) {
          const give = i === j ? [mine[i]] : [mine[i], mine[j]];
          const outCents = give.reduce((s, o) => s + o.asset.currentSalaryCents, 0n);
          const inCents = target.asset.currentSalaryCents;

          // Both clubs must satisfy matching, and both must stay legal on size.
          if (!legal(outCents, inCents, mine)) continue;
          if (!legal(inCents, outCents, roster)) continue;
          if (mine.length - give.length + 1 > DEFAULT_MAX_ROSTER_SIZE) continue;
          if (roster.length - 1 + give.length > DEFAULT_MAX_ROSTER_SIZE) continue;

          const r = evaluateTradeOffer({
            respondingTeam: {
              identity,
              needs: [],
              personality: "BALANCED",
              roster: roster.map((o) => ({
                overallRating: o.asset.overallRating,
                age: o.asset.age,
              })),
            },
            currentSeason: S,
            incoming: give.map((o) => o.asset),
            outgoing: [target.asset],
          });
          if (r.decision !== "ACCEPT") continue;

          const gain = value(target.asset) - give.reduce((s, o) => s + value(o.asset), 0);
          if (gain > 0 && (!best || gain > best.gain))
            best = { gain, give, get: target, from: team };
        }
      }
    }
  }

  if (!best) break;
  mine = mine.filter((o) => !best!.give.includes(o));
  mine.push(best.get);
  const from = others.get(best.from)!;
  others.set(best.from, [...from.filter((o) => o !== best!.get), ...best.give]);

  const bestOvr = Math.max(...mine.map((o) => o.asset.overallRating));
  console.log(
    `${String(step + 1).padStart(5)}${best.give
      .map((o) => o.name.split(" ").pop())
      .join("+")
      .slice(0, 24)
      .padStart(26)}` +
      `${`${best.get.name.split(" ").pop()} (${best.get.asset.overallRating})`.slice(0, 24).padStart(26)}` +
      `${`+${usd(best.gain)}`.padStart(10)}${usd(bookValue(mine)).padStart(11)}${String(bestOvr).padStart(6)}`,
  );
}

const endBook = bookValue(mine);
console.log(`\n  profitable trades found: ${step}`);
console.log(
  `  book value ${usd(startBook)} -> ${usd(endBook)}  (${((endBook / startBook - 1) * 100).toFixed(1)}%)`,
);
console.log(`  best player ${startBest} -> ${Math.max(...mine.map((o) => o.asset.overallRating))}`);
console.log(`  final payroll ${usd(payroll(mine))}  (cap ${usd(rules.salaryCapCents)})`);
console.log(`\n  unconstrained harness reported +25.7% over 8 trades.`);
line();
