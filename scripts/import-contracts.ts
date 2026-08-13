/**
 * Merges real NBA contracts into prisma/data/nbaDataset.json.
 *
 * Run this *after* `import-hoopr-dataset.ts` - it reads the dataset that script
 * writes, adds a `contract` to every player it can match, and writes it back.
 * Players it cannot match keep `contract: null` and get a generated deal at
 * league creation, exactly as every player did before this existed.
 *
 * **Costs a balldontlie GOAT trial, not a subscription.** The contracts
 * endpoints are GOAT-tier only ($39.99/month as of August 2026), but the output
 * is committed to the repo, so a refresh needs the tier for one run. balldontlie
 * offers a 48-hour GOAT trial at 5 requests/minute; this script is resumable and
 * checkpoints after every request, so it can be stopped and restarted freely and
 * a rate limit or an expired trial costs nothing already fetched.
 *
 * Roughly 30 teams x 5 seasons = 150 requests, about 33 minutes at 5/min.
 *
 * Run with: npx tsx scripts/import-contracts.ts
 *   BDL_REQUEST_MS=200   # if you are on a paid tier and want it to go fast
 */
import "dotenv/config"; // BALLDONTLIE_API_KEY lives in .env, which tsx does not load on its own
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  fetchTeamContracts,
  groupContractYears,
  type BallDontLieContract,
} from "../src/lib/data-sources/balldontlieContracts";
import { normalizePlayerName } from "../src/lib/data-sources/normalizeName";
import { nameAliases } from "../src/lib/data-sources/playerNameAliases";
import {
  computeSeedOverallRating,
  computeSeedPotentialRating,
  seedPriorFromSalary,
} from "../src/lib/data-sources/seedRating";
import { applyRatingOverride } from "../src/lib/data-sources/ratingOverrides";
import { resolvePlayerAge } from "../src/lib/players/age";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import type { CanonicalSeasonStat } from "../src/lib/data-sources/canonical";

const SEASON = 2026; // start-year convention => the 2026-27 season
const FUTURE_SEASONS = 4; // how far forward to follow a multi-year deal
const TEAM_IDS = Array.from({ length: 30 }, (_, i) => i + 1); // balldontlie NBA team ids

const DATASET = path.join(import.meta.dirname, "..", "prisma", "data", "nbaDataset.json");
const CHECKPOINT = path.join(import.meta.dirname, "..", "prisma", "data", ".contracts-cache.json");

interface DatasetPlayer {
  fullName: string;
  stats: ({ minutesPerGame: number } & Record<string, unknown>) | null;
  birthDate: string | null;
  teamAbbreviation: string | null;
  draftYear: number | null;
  draftRound: number | null;
  draftPick: number | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  overrideApplied?: boolean;
  contract?: { years: Array<{ season: number; salaryCents: number }> } | null;
}
interface DatasetFile {
  manifest: {
    dataSources: Array<{ provider: string; role: string; url?: string; license?: string }>;
    [k: string]: unknown;
  };
  players: DatasetPlayer[];
}
interface Checkpoint {
  completedKeys: string[];
  rows: BallDontLieContract[];
}

async function main() {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) throw new Error("BALLDONTLIE_API_KEY is not set - add it to .env");

  const file = JSON.parse(await readFile(DATASET, "utf8")) as DatasetFile;

  // Resume from whatever a previous run managed to fetch.
  const checkpoint: Checkpoint = existsSync(CHECKPOINT)
    ? (JSON.parse(await readFile(CHECKPOINT, "utf8")) as Checkpoint)
    : { completedKeys: [], rows: [] };
  if (checkpoint.completedKeys.length > 0) {
    console.log(`Resuming - ${checkpoint.completedKeys.length} team/season pairs already fetched.`);
  }

  const seasons = Array.from({ length: FUTURE_SEASONS + 1 }, (_, i) => SEASON + i);
  const completed = new Set(checkpoint.completedKeys);

  const result = await fetchTeamContracts(apiKey, TEAM_IDS, seasons, {
    completed,
    requestIntervalMs: process.env.BDL_REQUEST_MS ? Number(process.env.BDL_REQUEST_MS) : undefined,
    // Checkpointed after every request, so an interruption - a rate limit, an
    // expired trial, a closed laptop - never costs more than the call in flight.
    onBatch: async ({ rows, key, done, total }) => {
      checkpoint.rows.push(...rows);
      checkpoint.completedKeys.push(key);
      await writeFile(CHECKPOINT, JSON.stringify(checkpoint), "utf8");
      process.stdout.write(`\r  fetched ${done}/${total} team-seasons (${rows.length} rows)   `);
    },
  });

  const allRows = checkpoint.rows;
  console.log(`\nFetched ${allRows.length} contract rows.`);

  if (!result.complete) {
    console.log("Stopped before finishing - re-run to continue from the checkpoint.");
    return;
  }

  // --- match to the dataset -------------------------------------------------
  //
  // Identity join is by normalized name, the same anchor `buildDataset` uses to
  // join bios against box scores. balldontlie ids are not in the hoopR dataset,
  // so there is nothing more exact available.
  const byPlayerId = groupContractYears(allRows, SEASON);
  const rowByPlayerId = new Map(allRows.map((r) => [r.player_id, r]));

  interface Candidate {
    name: string;
    team: string;
    years: { season: number; salaryCents: number }[];
    draft: { year: number | null; round: number | null; pick: number | null };
  }

  // Every contract, indexed by normalized name. A name can hold more than one
  // candidate - balldontlie has genuine duplicates, and two different men can
  // normalize to the same string - so this is a list, not a single value, and
  // the team decides between them rather than the whole name being discarded.
  const byName = new Map<string, Candidate[]>();
  for (const [playerId, years] of byPlayerId) {
    const row = rowByPlayerId.get(playerId);
    if (!row) continue;
    const name = normalizePlayerName(`${row.player.first_name} ${row.player.last_name}`);
    const candidate: Candidate = {
      name,
      team: row.team.abbreviation,
      years,
      draft: {
        year: row.player.draft_year,
        round: row.player.draft_round,
        pick: row.player.draft_number,
      },
    };
    byName.set(name, [...(byName.get(name) ?? []), candidate]);
  }

  // balldontlie holds genuine duplicate records - the same man under two player
  // ids, with the same team and the same salaries. Measured on the first real
  // run, that was Brandon Williams, Dru Smith and Keaton Wallace, all of whom
  // were being discarded as "ambiguous" when the two records did not disagree
  // about anything. Collapsing identical candidates keeps real ambiguity - two
  // different men who normalize alike - as the only thing that blocks a match.
  const signature = (c: Candidate) =>
    `${c.team}|${c.years.map((y) => `${y.season}:${y.salaryCents}`).join(",")}`;
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const unique = new Map(list.map((c) => [signature(c), c]));
    if (unique.size < list.length) byName.set(name, [...unique.values()]);
  }

  const surname = (n: string) => n.split(" ").at(-1)!;
  const firstName = (n: string) => n.split(" ")[0];

  const bySurnameTeam = new Map<string, Candidate[]>();
  for (const list of byName.values()) {
    for (const c of list) {
      const k = `${surname(c.name)}|${c.team}`;
      bySurnameTeam.set(k, [...(bySurnameTeam.get(k) ?? []), c]);
    }
  }

  const claimed = new Set<Candidate>();

  /**
   * Resolves one dataset player to a contract, in order of confidence:
   * exact normalized name, then the hand-verified nickname table, then the same
   * surname on the same team.
   *
   * **The surname fallback needs the first-name guard.** hoopR spells a player
   * the way broadcasts do and balldontlie uses his legal name, which cost 9
   * rostered players on the first real run - Nic Claxton (Nicolas) and Alex Sarr
   * (Alexandre) among them. But surname plus team alone matched Nolan Traoré to
   * Armel Traoré, two different men on the same Brooklyn roster, so a candidate
   * is only taken when one first name is a prefix of the other.
   *
   * A candidate is claimed once, so two dataset players can never be handed the
   * same contract.
   */
  function resolve(fullName: string, team: string | null): Candidate | null {
    const key = normalizePlayerName(fullName);

    const pick = (list: readonly Candidate[]): Candidate | null => {
      const free = list.filter((c) => !claimed.has(c));
      if (free.length === 0) return null;
      if (free.length === 1) return free[0];
      // More than one: only the team can honestly decide.
      const sameTeam = team ? free.filter((c) => c.team === team) : [];
      return sameTeam.length === 1 ? sameTeam[0] : null;
    };

    const exact = pick(byName.get(key) ?? []);
    if (exact) return exact;

    // Shared with the roster merge in `enrichBios.ts`, which needs the same
    // table in the opposite direction - see `playerNameAliases.ts`.
    for (const alias of nameAliases(key)) {
      if (alias === key) continue;
      const aliased = pick(byName.get(alias) ?? []);
      if (aliased) return aliased;
    }

    if (!team) return null;
    const candidates = (bySurnameTeam.get(`${surname(key)}|${team}`) ?? []).filter(
      (c) => !claimed.has(c),
    );
    if (candidates.length !== 1) return null;
    const a = firstName(key);
    const b = firstName(candidates[0].name);
    return a === b || a.startsWith(b) || b.startsWith(a) ? candidates[0] : null;
  }

  let matched = 0;
  let viaFallback = 0;
  let draftFilled = 0;
  const unmatched: string[] = [];
  const fallbackLog: string[] = [];

  for (const player of file.players) {
    const exactKey = normalizePlayerName(player.fullName);
    const candidate = resolve(player.fullName, player.teamAbbreviation);

    if (candidate) {
      claimed.add(candidate);
      player.contract = { years: candidate.years };
      matched++;
      if (candidate.name !== exactKey) {
        viaFallback++;
        fallbackLog.push(`${player.fullName} <- ${candidate.name} [${candidate.team}]`);
      }
      // The hoopR dataset carries no draft data at all - not one of its 537
      // players has a draftYear - which is why `resolvePlayerExperience` falls
      // back to `age - 22` for every real player. balldontlie's contract rows
      // carry it, so take it while we are here: real service time makes the
      // rookie scale and the max-salary tiers correct rather than approximate.
      if (player.draftYear === null && candidate.draft.year !== null) {
        player.draftYear = candidate.draft.year;
        player.draftRound = candidate.draft.round;
        player.draftPick = candidate.draft.pick;
        draftFilled++;
      }
    } else {
      player.contract = null;
      if (player.teamAbbreviation) unmatched.push(player.fullName);
    }
  }

  // --- re-derive seed ratings, now that a prior exists -----------------------
  //
  // The roster/stats build has no contracts to read, so it regresses every
  // unproven player toward a flat 67. With real salaries in hand a veteran's
  // market price is a far better prior, so ratings are recomputed here rather
  // than there - which also keeps the free roster refresh independent of this
  // paid one. See seedRating.ts `seedPriorFromSalary` and docs/RATING_AUDIT.md.
  const rules = getSeasonCapRules(SEASON);
  const cap = Number(rules.salaryCapCents);
  let reRated = 0;
  let biggestMove = { name: "", from: 0, to: 0 };
  const nowRedundant: string[] = [];

  for (const player of file.players) {
    if (!player.stats) continue;
    const salary = player.contract?.years.find((y) => y.season === SEASON)?.salaryCents ?? 0;
    // Rookie-scale money is set by rule, not by the market, so it says nothing
    // about how good a player is. Those keep the flat baseline.
    const experience = player.draftYear === null ? null : SEASON - player.draftYear;
    const prior =
      (experience ?? 0) >= 4 ? (seedPriorFromSalary(salary, cap) ?? undefined) : undefined;

    const stat = player.stats as unknown as CanonicalSeasonStat;
    const model = computeSeedOverallRating(stat, prior);
    const withOverride = applyRatingOverride(player.fullName, model);

    const before = player.seedOverallRating;
    if (before !== withOverride.rating) {
      reRated++;
      if (
        Math.abs(withOverride.rating - (before ?? 0)) > Math.abs(biggestMove.to - biggestMove.from)
      )
        biggestMove = { name: player.fullName, from: before ?? 0, to: withOverride.rating };
    }
    // An override that now agrees with the model is no longer doing any work.
    if (withOverride.applied && model === withOverride.rating) nowRedundant.push(player.fullName);

    player.seedOverallRating = withOverride.rating;
    player.seedPotentialRating = computeSeedPotentialRating(
      withOverride.rating,
      resolvePlayerAge(
        {
          birthDate: player.birthDate ? new Date(player.birthDate) : null,
          draftYear: player.draftYear,
        },
        SEASON,
      ),
    );
    player.overrideApplied = withOverride.applied;
  }
  console.log(`\nRe-rated ${reRated} players against their real salary.`);
  if (biggestMove.name) {
    console.log(`  biggest move: ${biggestMove.name} ${biggestMove.from} -> ${biggestMove.to}`);
  }
  if (nowRedundant.length > 0) {
    console.log(
      `  ${nowRedundant.length} overrides now agree with the model and could be retired: ${nowRedundant.join(", ")}`,
    );
  }

  const sources = file.manifest.dataSources.filter((s) => s.role !== "contracts");
  sources.push({
    provider: "balldontlie",
    role: "contracts",
    url: "https://nba.balldontlie.io/",
    license: "commercial (GOAT tier)",
  });
  file.manifest.dataSources = sources;

  // --- unrecorded contracts are minimum contracts ---------------------------
  //
  // **Absence is evidence, not ignorance.** A rostered player with no published
  // deal in an offseason snapshot is overwhelmingly a minimum or two-way
  // signing: big deals are reported within hours, minimums are not. Measured on
  // the 2026-27 run, coverage tracked quality almost perfectly - 96% of players
  // rated 85+ had a contract, against 30% of those under 68.
  //
  // Leaving them null hands them to the generator, which prices by *rating* and
  // has no idea the market never paid them that. That added $38.5M per team
  // against $7.9M at the minimum, and pushed 18 of 30 teams into the luxury tax
  // where the real league has 6-10. Pricing them at the minimum instead lands
  // that at 7. It costs accuracy the other way - 19 teams over the cap against
  // a real 25-28 - but the tax line is the one with mechanical consequences
  // (tax bills, apron restrictions), so that is the better error to carry.
  //
  // Deliberately runs AFTER the re-rating pass above. Ratings take a salary
  // prior from what the market actually paid, and a minimum invented here is
  // not evidence of anything - reading it back would be circular.
  //
  // This is a snapshot-timing artifact and it resolves itself: re-run closer to
  // opening night, when balldontlie has published the rest, and far fewer
  // players take this path.
  const minimumCents = Number(getSeasonCapRules(SEASON).emptyRosterChargeCents);
  let minimumFilled = 0;
  for (const player of file.players) {
    if (player.contract || !player.teamAbbreviation) continue;
    player.contract = { years: [{ season: SEASON, salaryCents: minimumCents }] };
    minimumFilled++;
  }

  console.log(
    `unrecorded contracts filled at the league minimum: ${minimumFilled} ` +
      `(absence of a published deal mid-offseason is evidence of a small one)`,
  );

  await writeFile(DATASET, JSON.stringify(file, null, 2) + "\n", "utf8");

  const rostered = file.players.filter((p) => p.teamAbbreviation).length;
  console.log(`\nMatched ${matched}/${file.players.length} players to a real contract.`);
  if (viaFallback > 0) {
    console.log(`  ${viaFallback} needed the surname/nickname fallback:`);
    for (const line of fallbackLog) console.log(`    ${line}`);
  }
  console.log(`Filled draft data for ${draftFilled} players.`);
  console.log(`${unmatched.length} rostered players unmatched (they get generated contracts).`);

  // A fringe player with no cap contract is expected - two-way deals are not
  // cap contracts and never appear in this feed at all. A *rotation* player
  // missing is a name-matching gap, and is the only thing here worth acting on.
  const rotationUnmatched = unmatched.filter(
    (name) => (file.players.find((x) => x.fullName === name)?.stats?.minutesPerGame ?? 0) >= 20,
  );
  if (rotationUnmatched.length > 0) {
    console.log(`\n${rotationUnmatched.length} of them play 20+ mpg - check for a name gap:`);
    for (const name of rotationUnmatched) console.log(`    ${name}`);
  }

  const coverage = ((rostered - unmatched.length) / rostered) * 100;

  console.log(`\nRostered coverage: ${coverage.toFixed(1)}%`);
  console.log("\nNext: npx prisma db seed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
