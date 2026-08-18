/**
 * Real NBA contracts, from balldontlie's `/contracts/teams` endpoint.
 *
 * **Why this exists.** Every contract in a new save was generated - the seeded
 * dataset carried no salary field at all (docs/audits/CONTRACT_AUDIT.md §9). That is
 * defensible for contracts the simulator writes itself, but it meant the
 * opening league never resembled the real one: a backup centre could start on
 * $29M because the pricing model rated him a top-50 veteran. Seeding the real
 * deals makes year one true and leaves the generator to do what it is actually
 * good at - pricing the deals the simulation creates from year two onward.
 *
 * **This endpoint is not on the free tier.** Contracts are GOAT-tier
 * ($39.99/month) as of August 2026, but balldontlie offers a 48-hour GOAT
 * trial, and this is a one-time fetch whose output is committed to the repo -
 * so a refresh costs a trial, not a subscription. `scripts/import-contracts.ts`
 * is resumable for exactly that reason.
 *
 * The rate limiting, cursor and 429 handling mirror `balldontlie.ts` rather
 * than inventing a second style; the trial runs at 5 requests/minute, the same
 * budget the free tier gives.
 */

const BASE_URL = "https://api.balldontlie.io/v1";

/** One (player, season) row. A multi-year deal is several of these. */
export interface BallDontLieContract {
  id: number;
  player_id: number;
  season: number;
  team_id: number;
  /** Dollars. The cap figure, which is what a cap sheet needs. */
  cap_hit: number | null;
  total_cash: number | null;
  base_salary: number | null;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position: string | null;
    draft_year: number | null;
    draft_round: number | null;
    draft_number: number | null;
  };
  team: { id: number; abbreviation: string };
}

interface ContractsPage {
  data: BallDontLieContract[];
}

export interface FetchContractsOptions {
  /** Stop after this many requests, so one run need not cover every team. */
  maxRequests?: number;
  /**
   * Called after each team/season pair lands, for incremental persistence.
   * `key` is the pair that just completed, so a caller checkpointing to disk can
   * record progress without waiting for the whole run to return.
   */
  onBatch?: (batch: {
    rows: BallDontLieContract[];
    key: string;
    done: number;
    total: number;
  }) => void | Promise<void>;
  /** Pairs already fetched, as `${teamId}:${season}` - skipped on resume. */
  completed?: ReadonlySet<string>;
  /** Overridable so a paid tier can run faster than the trial's 5/min. */
  requestIntervalMs?: number;
}

export interface FetchContractsResult {
  rows: BallDontLieContract[];
  /** Pairs completed by this run, to be merged into `completed` on resume. */
  completedKeys: string[];
  /** True when every requested pair was fetched. */
  complete: boolean;
}

/**
 * Fetches contracts for every (team, season) pair given.
 *
 * Seasons matter: the endpoint returns one row per season, so a four-year deal
 * only looks like one if all four seasons are requested. Rows are returned flat
 * and grouped into contracts by the caller.
 */
export async function fetchTeamContracts(
  apiKey: string,
  teamIds: readonly number[],
  seasons: readonly number[],
  options: FetchContractsOptions = {},
): Promise<FetchContractsResult> {
  const interval = options.requestIntervalMs ?? 13_000; // 5 req/min, with headroom
  const completed = options.completed ?? new Set<string>();

  const pairs: [number, number][] = [];
  for (const season of seasons)
    for (const teamId of teamIds) {
      if (!completed.has(`${teamId}:${season}`)) pairs.push([teamId, season]);
    }

  const rows: BallDontLieContract[] = [];
  const completedKeys: string[] = [];
  let requests = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (options.maxRequests !== undefined && requests >= options.maxRequests) {
      return { rows, completedKeys, complete: false };
    }
    const [teamId, season] = pairs[i];

    const url = new URL(`${BASE_URL}/contracts/teams`);
    url.searchParams.set("team_id", String(teamId));
    url.searchParams.set("season", String(season));

    const res = await fetch(url, { headers: { Authorization: apiKey } });
    requests++;

    if (res.status === 429) {
      await sleep(15_000);
      requests--;
      i--; // retry the same pair
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `balldontlie rejected the contracts request (${res.status}). This endpoint is ` +
          `GOAT-tier only - start the 48-hour GOAT trial, or upgrade, then re-run. ` +
          `Progress so far is saved and the script resumes where it stopped.`,
      );
    }
    if (!res.ok) {
      throw new Error(`balldontlie /contracts/teams failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as ContractsPage;
    const key = `${teamId}:${season}`;
    rows.push(...body.data);
    completedKeys.push(key);
    await options.onBatch?.({
      rows: body.data,
      key,
      done: completedKeys.length,
      total: pairs.length,
    });

    if (i < pairs.length - 1) await sleep(interval);
  }

  return { rows, completedKeys, complete: true };
}

export interface SeededContractYear {
  season: number;
  salaryCents: number;
}

/**
 * Groups flat (player, season) rows into one contract per player.
 *
 * Only seasons at or after `fromSeason` are kept, and only a contiguous run
 * starting there - a gap means the player's deal ends and a later row belongs
 * to a different contract the simulator has no business seeding.
 */
export function groupContractYears(
  rows: readonly BallDontLieContract[],
  fromSeason: number,
): Map<number, SeededContractYear[]> {
  const byPlayer = new Map<number, Map<number, number>>();

  for (const row of rows) {
    const dollars = row.cap_hit ?? row.base_salary;
    if (dollars === null || dollars <= 0) continue;
    if (row.season < fromSeason) continue;
    const seasons = byPlayer.get(row.player_id) ?? new Map<number, number>();
    // Cents, as integers - the money boundary this codebase keeps everywhere.
    seasons.set(row.season, Math.round(dollars * 100));
    byPlayer.set(row.player_id, seasons);
  }

  const out = new Map<number, SeededContractYear[]>();
  for (const [playerId, seasons] of byPlayer) {
    const years: SeededContractYear[] = [];
    for (let season = fromSeason; seasons.has(season); season++) {
      years.push({ season, salaryCents: seasons.get(season)! });
    }
    if (years.length > 0) out.set(playerId, years);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
