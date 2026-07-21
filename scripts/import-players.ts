/**
 * Fetches player bios from balldontlie (paginating the entire historical
 * player database - the free tier has no "active players only" endpoint)
 * and joins them against prisma/data/playerSeasonStats.json by normalized
 * name to produce prisma/data/players.json: real bios + real 2023-24
 * performance for every player the simulator can actually field.
 *
 * The free tier allows 5 requests/minute, so a full pass over the
 * database takes a while. This checkpoints progress to .data-import/ so
 * it can be safely re-run to continue (`npm run import:players`) instead
 * of needing to fit in a single sitting.
 *
 * Run with: npx tsx scripts/import-players.ts [--max-requests N]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { fetchAllPlayers, type BallDontLiePlayer } from "../src/lib/data-sources/balldontlie";
import { mapPosition } from "../src/lib/data-sources/mapPosition";
import { normalizePlayerName } from "../src/lib/data-sources/normalizeName";

const CHECKPOINT_DIR = path.join(import.meta.dirname, "..", ".data-import");
const CHECKPOINT_PATH = path.join(CHECKPOINT_DIR, "balldontlie-players-raw.json");
const STATS_PATH = path.join(import.meta.dirname, "..", "prisma", "data", "playerSeasonStats.json");
const OUT_PATH = path.join(import.meta.dirname, "..", "prisma", "data", "players.json");

interface Checkpoint {
  cursor?: number;
  players: BallDontLiePlayer[];
  done: boolean;
}

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, "utf-8"));
  } catch {
    return { players: [], done: false };
  }
}

async function saveCheckpoint(checkpoint: Checkpoint) {
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint));
}

function parseHeight(height: string | null): number | null {
  if (!height) return null;
  const [feet, inches] = height.split("-").map(Number);
  if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
  return feet * 12 + inches;
}

async function main() {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) throw new Error("BALLDONTLIE_API_KEY is not set in .env");

  const maxRequestsArg = process.argv.indexOf("--max-requests");
  const maxRequests = maxRequestsArg !== -1 ? Number(process.argv[maxRequestsArg + 1]) : 35;

  const checkpoint = await loadCheckpoint();
  if (checkpoint.done) {
    console.log(
      `Checkpoint already complete (${checkpoint.players.length} players). Delete .data-import/ to start over.`,
    );
  } else {
    console.log(
      `Resuming from ${checkpoint.players.length} players already fetched, cursor=${checkpoint.cursor ?? "start"}...`,
    );
    const result = await fetchAllPlayers(apiKey, {
      cursor: checkpoint.cursor,
      maxRequests,
      onPage: async (page, nextCursor) => {
        checkpoint.players.push(...page);
        checkpoint.cursor = nextCursor;
        checkpoint.done = nextCursor === undefined;
        await saveCheckpoint(checkpoint); // persist after every page, not just at the end
        console.log(`  +${page.length} players (cursor now ${nextCursor ?? "done"})`);
      },
    });
    checkpoint.cursor = result.nextCursor;
    checkpoint.done = result.nextCursor === undefined;
    await saveCheckpoint(checkpoint);

    if (!checkpoint.done) {
      console.log(
        `Hit the ${maxRequests}-request budget for this run. Re-run \`npm run import:players\` to continue - ${checkpoint.players.length} players saved so far.`,
      );
      return;
    }
    console.log(`Done fetching. ${checkpoint.players.length} total players from balldontlie.`);
  }

  // The box-score dataset logs a handful of players under a common
  // nickname rather than their balldontlie legal name - resolved by hand
  // after the initial join left exactly these 5 out of 497 unmatched.
  const NAME_ALIASES: Record<string, string> = {
    [normalizePlayerName("Nicolas Claxton")]: normalizePlayerName("Nic Claxton"),
    [normalizePlayerName("Nah'Shon Hyland")]: normalizePlayerName("Bones Hyland"),
    [normalizePlayerName("Cameron Reddish")]: normalizePlayerName("Cam Reddish"),
    [normalizePlayerName("Aleksandar Vezenkov")]: normalizePlayerName("Sasha Vezenkov"),
    [normalizePlayerName("Kenyon Martin Jr.")]: normalizePlayerName("KJ Martin"),
  };

  const statsFile = JSON.parse(await readFile(STATS_PATH, "utf-8"));
  const statsByName = new Map<string, (typeof statsFile.players)[number]>();
  for (const player of statsFile.players) {
    statsByName.set(normalizePlayerName(player.personName), player);
  }

  const matched: unknown[] = [];
  const seenNames = new Set<string>();
  for (const bio of checkpoint.players) {
    const fullName = `${bio.first_name} ${bio.last_name}`;
    const key = normalizePlayerName(fullName);
    const stats = statsByName.get(key) ?? statsByName.get(NAME_ALIASES[key]);
    const matchKey = statsByName.has(key) ? key : NAME_ALIASES[key];
    if (!stats || seenNames.has(matchKey)) continue;
    seenNames.add(matchKey);

    matched.push({
      externalId: String(bio.id),
      fullName,
      position: mapPosition(bio.position),
      heightInches: parseHeight(bio.height),
      weightLbs: bio.weight ? Number(bio.weight) : null,
      draftYear: bio.draft_year,
      draftRound: bio.draft_round,
      draftPick: bio.draft_number,
      // Season-accurate team, not balldontlie's current (real-world-today)
      // team - `bio.team` reflects whatever team a player is on as of
      // whenever this import last ran, which drifts out of sync with the
      // 2023-24 stat line as real trades happen in the years since. Using
      // `stats.team` keeps every player's roster placement consistent with
      // the actual season this whole simulator is built on.
      teamAbbreviation: stats.team ?? bio.team?.abbreviation,
      stats: {
        gamesPlayed: stats.gamesPlayed,
        minutesPerGame: stats.minutesPerGame,
        pointsPerGame: stats.pointsPerGame,
        reboundsPerGame: stats.reboundsPerGame,
        assistsPerGame: stats.assistsPerGame,
        stealsPerGame: stats.stealsPerGame,
        blocksPerGame: stats.blocksPerGame,
        turnoversPerGame: stats.turnoversPerGame,
        fgPct: stats.fgPct,
        fg3Pct: stats.fg3Pct,
        ftPct: stats.ftPct,
        trueShootingPct: stats.trueShootingPct,
      },
    });
  }

  console.log(
    `Matched ${matched.length} / ${statsFile.players.length} stats-fixture players to a balldontlie bio.`,
  );

  await writeFile(
    OUT_PATH,
    JSON.stringify({ season: statsFile.season, players: matched }, null, 2),
  );
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
