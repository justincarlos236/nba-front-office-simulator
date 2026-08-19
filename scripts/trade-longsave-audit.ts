/**
 * Does the trade market stay believable over a long save?
 *
 * The last dimension `docs/audits/TRADE_EXPLOIT_AUDIT.md` left unscored. The CPU
 * realism harness measured trade *frequency* across ten seasons but rebuilt the
 * league each time, so it could not see drift within one continuous save.
 *
 * This runs one league forward with everything acting on it at once —
 * development, ageing, retirement, the draft, and CPU trading — and compares
 * against the identical run with trading switched off. Anything that differs is
 * caused by trades.
 *
 * The failure modes it is looking for:
 *
 *   - **talent concentration** — one club hoovering up the league's stars
 *   - **collapse** — CPU clubs trading themselves into ruin
 *   - **stagnation** — the same clubs on top forever, nobody able to climb
 *
 * Reads only, no database. Run: npx tsx scripts/trade-longsave-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  rollForCpuTrade,
  type CpuTeam,
  type CpuRosterPlayer,
} from "../src/lib/simulation/leagueEvents";
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import { contractQualityScore, priceContractCents } from "../src/lib/contracts/priceContract";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeTeamIdentity } from "../src/lib/gm/teamIdentity";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import { getApronLevel } from "../src/lib/cap/apron";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { computeCapSheet } from "../src/lib/cap/capSheet";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const BASE = 2026;
const SEASONS = 12;
const GAMES_PER_SEASON = 1230;
const TRADE_CHANCE_PER_GAME = 0.013;
const line = (n = 92) => console.log("=".repeat(n));

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

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

/** Priced fresh each season, so a developing player's salary tracks his value. */
function salaryFor(
  rating: number,
  age: number,
  exp: number,
  position: string,
  season: number,
): bigint {
  return BigInt(
    priceContractCents({
      season,
      quality: contractQualityScore({
        overallRating: rating,
        performanceScore: null,
        gamesPlayed: 0,
      }),
      age,
      yearsOfExperience: exp,
      position,
    }),
  );
}

function seedLeague(): Map<string, CpuRosterPlayer[]> {
  const m = new Map<string, CpuRosterPlayer[]>();
  for (const p of ds.players) {
    if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
    const src = {
      birthDate: p.birthDate ? new Date(p.birthDate) : null,
      draftYear: p.draftYear ?? null,
    };
    const age = resolvePlayerAge(src, BASE);
    const exp = resolvePlayerExperience(src, BASE);
    const pos = (POSITIONS as readonly string[]).includes(p.position.toUpperCase())
      ? (p.position.toUpperCase() as (typeof POSITIONS)[number])
      : "SF";
    m.set(p.teamAbbreviation, [
      ...(m.get(p.teamAbbreviation) ?? []),
      {
        leaguePlayerId: `${p.fullName}`,
        playerName: p.fullName,
        rating: p.seedOverallRating,
        potentialRating: p.seedPotentialRating ?? p.seedOverallRating,
        age,
        position: pos,
        injuryStatus: "HEALTHY",
        careerGamesMissedToInjury: 0,
        salaryCents: salaryFor(p.seedOverallRating, age, exp, pos, BASE),
        noTradeClause: false,
      },
    ]);
  }
  return m;
}

interface Snapshot {
  season: number;
  strengthSd: number;
  best: number;
  worst: number;
  topTeamStars: number;
  hhi: number;
}

function run(tradingOn: boolean, seed: number): Snapshot[] {
  const rng = makeRng(seed);
  const league = seedLeague();
  const snaps: Snapshot[] = [];

  const snapshot = (season: number) => {
    const strengths = [...league.values()].map((r) => computeTeamStrength(r.map((p) => p.rating)));
    const starsPerTeam = [...league.values()].map((r) => r.filter((p) => p.rating >= 85).length);
    const totalStars = starsPerTeam.reduce((a, b) => a + b, 0);
    // Herfindahl index over star distribution: 1/30 is perfectly even, 1 is one
    // club holding every star. The direct test for talent concentration.
    const hhi = totalStars === 0 ? 0 : starsPerTeam.reduce((s, n) => s + (n / totalStars) ** 2, 0);
    snaps.push({
      season,
      strengthSd: sd(strengths),
      best: Math.max(...strengths),
      worst: Math.min(...strengths),
      topTeamStars: Math.max(...starsPerTeam),
      hhi,
    });
  };
  snapshot(0);

  for (let s = 1; s <= SEASONS; s++) {
    const season = BASE + s;

    if (tradingOn) {
      const order = [...league.entries()]
        .map(([t, r]) => ({ t, s: computeTeamStrength(r.map((p) => p.rating)) }))
        .sort((a, b) => a.s - b.s);
      const teams: CpuTeam[] = order.map(({ t }, i) => {
        const roster = league.get(t)!;
        const avgAge = roster.reduce((a, p) => a + p.age, 0) / roster.length;
        return {
          leagueTeamId: t,
          teamLabel: t,
          roster,
          capState: {
            apronLevel: getApronLevel(
              roster.reduce((a, p) => a + p.salaryCents, 0n),
              getSeasonCapRules(season),
            ),
            capSpaceCents: computeCapSheet({
              deadMoneyCents: 0n, // synthetic rosters; nothing has been released
              season,
              contracts: roster.map((p) => ({
                playerId: p.leaguePlayerId,
                salaryCents: p.salaryCents,
              })),
            }).capSpaceCents,
            ownedFutureFirstRoundPickSeasons: [season + 1, season + 2],
          },
          identity: computeTeamIdentity(i / (order.length - 1), avgAge),
          needs: computeTeamNeeds(
            roster.map((p) => ({ position: p.position, overallRating: p.rating })),
          ),
          personality: "BALANCED",
        };
      });
      for (let g = 0; g < GAMES_PER_SEASON; g++) {
        if (rng() >= TRADE_CHANCE_PER_GAME) continue;
        const result = rollForCpuTrade(teams, season, rng);
        if (!result) continue;
        const a = teams.find((t) => t.leagueTeamId === result.teamA.leagueTeamId)!;
        const b = teams.find((t) => t.leagueTeamId === result.teamB.leagueTeamId)!;
        a.roster = [
          ...a.roster.filter((p) => p.leaguePlayerId !== result.teamA.player.leaguePlayerId),
          result.teamB.player,
        ];
        b.roster = [
          ...b.roster.filter((p) => p.leaguePlayerId !== result.teamB.player.leaguePlayerId),
          result.teamA.player,
        ];
        league.set(a.leagueTeamId, a.roster);
        league.set(b.leagueTeamId, b.roster);
      }
    }

    // Develop, age, retire.
    for (const [t, roster] of league) {
      const survivors: CpuRosterPlayer[] = [];
      for (const p of roster) {
        p.rating = developPlayerRating({
          overallRating: p.rating,
          potentialRating: p.potentialRating,
          age: p.age,
          rng,
          developmentTrait: developmentTraitFromId(p.leaguePlayerId),
        });
        p.age += 1;
        p.salaryCents = salaryFor(p.rating, p.age, Math.max(0, p.age - 20), p.position, season);
        if (!shouldRetire(p.age, p.rating, rng)) survivors.push(p);
      }
      league.set(t, survivors);
    }

    // Draft: worst team picks first.
    const draftOrder = [...league.entries()]
      .map(([t, r]) => ({ t, s: computeTeamStrength(r.map((p) => p.rating)) }))
      .sort((a, b) => a.s - b.s);
    const prospects = generateDraftClass(rng).prospects;
    draftOrder.forEach(({ t }, i) => {
      const roster = league.get(t)!;
      for (const pick of [prospects[i], prospects[i + 30]]) {
        if (!pick || roster.length >= DEFAULT_MAX_ROSTER_SIZE) continue;
        const pos = (POSITIONS as readonly string[]).includes(pick.position) ? pick.position : "SF";
        roster.push({
          leaguePlayerId: `s${s}t${t}p${i}`,
          playerName: `Rookie ${i}`,
          rating: pick.overallRating,
          potentialRating: pick.potentialRating,
          age: pick.age,
          position: pos as (typeof POSITIONS)[number],
          injuryStatus: "HEALTHY",
          careerGamesMissedToInjury: 0,
          salaryCents: salaryFor(pick.overallRating, pick.age, 0, pos, season),
          noTradeClause: false,
        });
      }
      roster.sort((a, b) => b.rating - a.rating);
      league.set(t, roster.slice(0, DEFAULT_MAX_ROSTER_SIZE));
    });

    snapshot(s);
  }
  return snaps;
}

line();
console.log("LONG-SAVE TRADE MARKET STABILITY");
line();
console.log(`  ${SEASONS} seasons, one continuous league, everything acting at once.`);
console.log(`  the same run is done with trading OFF, so any difference is caused by trades.\n`);

const SEEDS = [20260817, 31, 4242];
const withT = SEEDS.map((s) => run(true, s));
const withoutT = SEEDS.map((s) => run(false, s));
const meanAt = (runs: Snapshot[][], i: number, pick: (s: Snapshot) => number) =>
  runs.reduce((a, r) => a + pick(r[i]), 0) / runs.length;

console.log(
  `${"SEASON".padStart(8)}${"STRENGTH SD".padStart(24)}${"MOST STARS ON ONE TEAM".padStart(26)}${"STAR CONCENTRATION".padStart(22)}`,
);
console.log(
  `${"".padStart(8)}${"trades / no trades".padStart(24)}${"trades / no trades".padStart(26)}${"trades / no trades".padStart(22)}`,
);
for (let i = 0; i <= SEASONS; i++) {
  if (i !== 0 && i !== 4 && i !== 8 && i !== SEASONS) continue;
  const f = (runs: Snapshot[][], pick: (s: Snapshot) => number, d = 2) =>
    meanAt(runs, i, pick).toFixed(d);
  console.log(
    `${String(i).padStart(8)}` +
      `${`${f(withT, (s) => s.strengthSd)} / ${f(withoutT, (s) => s.strengthSd)}`.padStart(24)}` +
      `${`${f(withT, (s) => s.topTeamStars, 1)} / ${f(withoutT, (s) => s.topTeamStars, 1)}`.padStart(26)}` +
      `${`${f(withT, (s) => s.hhi, 3)} / ${f(withoutT, (s) => s.hhi, 3)}`.padStart(22)}`,
  );
}
console.log(`\n  star concentration is a Herfindahl index: 0.033 is perfectly even across`);
console.log(`  30 clubs, 1.000 would be one club holding every star in the league.`);
line();
