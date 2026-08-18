/**
 * Does the recent-acquisition cooldown close P0-1?
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
 * Reads only, no database. Run: npx tsx scripts/trade-cooldown-check.ts
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
import { isWithinTradeCooldown, TRADE_COOLDOWN_DAYS } from "../src/lib/trade/recentAcquisition";
import { REGULAR_SEASON_TARGET_DAYS } from "../src/lib/calendar/seasonCalendar";

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

/**
 * Runs the greedy ladder with a time axis. The user trades as fast as the rules
 * allow: each step advances to the earliest day any tradeable improvement
 * exists, and a just-acquired player is locked for `cooldownDays`.
 */
function runChain(cooldownDays: number, threshold?: number) {
  let mine = [...teams.get(USER)!];
  const others = new Map(
    [...teams.entries()].filter(([t]) => t !== USER).map(([t, r]) => [t, [...r]]),
  );
  /** Day this player joined our roster; null for the seeded squad. */
  const joinedOn = new Map<Owned, number | null>(mine.map((o) => [o, null]));
  const startBook = bookValue(mine);
  let day = 0;
  let step = 0;

  while (day <= REGULAR_SEASON_TARGET_DAYS && step < 30) {
    let best: { gain: number; give: Owned[]; get: Owned; from: string } | null = null;
    for (const [team, roster] of others) {
      const identity = identityOf.get(team)!;
      for (const target of roster) {
        for (let i = 0; i < mine.length; i++) {
          for (let j = i; j < mine.length; j++) {
            const give = i === j ? [mine[i]] : [mine[i], mine[j]];
            // The cooldown: a player we just acquired cannot be flipped yet.
            const locked = give.some((o) =>
              isWithinTradeCooldown(
                {
                  joinedTeamSeason: joinedOn.get(o) === null ? null : S,
                  joinedTeamDayIndex: joinedOn.get(o) ?? null,
                },
                S,
                day,
                cooldownDays,
              ),
            );
            if (locked) continue;
            const outCents = give.reduce((s, o) => s + o.asset.currentSalaryCents, 0n);
            const inCents = target.asset.currentSalaryCents;
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
              acceptThresholdOverride: threshold,
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
    if (!best) {
      // Nothing legal today; jump forward to when the next lock expires.
      const nextUnlock = Math.min(
        ...mine.map((o) => (joinedOn.get(o) ?? -Infinity) + cooldownDays).filter((d) => d > day),
      );
      if (!Number.isFinite(nextUnlock)) break;
      day = nextUnlock;
      continue;
    }
    for (const o of best.give) joinedOn.delete(o);
    mine = mine.filter((o) => !best!.give.includes(o));
    mine.push(best.get);
    joinedOn.set(best.get, day);
    const from = others.get(best.from)!;
    others.set(best.from, [...from.filter((o) => o !== best!.get), ...best.give]);
    step++;
  }
  return { gain: (bookValue(mine) / startBook - 1) * 100, steps: step, day };
}

line();
console.log("RECENT-ACQUISITION COOLDOWN");
line();
console.log(`  one season is ${REGULAR_SEASON_TARGET_DAYS} days; the real restriction is 60.`);
console.log(`  the user trades as fast as the rule allows.
`);
console.log(
  `${"COOLDOWN".padStart(10)}${"THRESHOLD".padStart(11)}${"CHAIN GAIN".padStart(13)}${"TRADES".padStart(9)}`,
);
for (const [cd, th] of [
  [0, undefined],
  [60, undefined],
  [90, undefined],
  [0, 1.0],
  [60, 1.0],
  [60, 1.02],
  [90, 1.0],
] as [number, number | undefined][]) {
  const r = runChain(cd, th);
  console.log(
    `${(cd === 0 ? "none" : `${cd}d`).padStart(10)}${(th === undefined ? "0.95" : th.toFixed(2)).padStart(11)}` +
      `${(r.gain.toFixed(1) + "%").padStart(13)}${String(r.steps).padStart(9)}`,
  );
}
console.log(`
  shipped default is ${TRADE_COOLDOWN_DAYS}d.`);
line();
