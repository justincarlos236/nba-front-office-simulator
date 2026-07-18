const BASE_URL = "https://api.balldontlie.io/v1";

export interface BallDontLiePlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string; // "G" | "F" | "C" | "G-F" | "F-G" | "F-C" | "C-F" | ""
  height: string | null; // "6-6"
  weight: string | null; // "190"
  jersey_number: string | null;
  college: string | null;
  country: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_number: number | null;
  team: {
    id: number;
    abbreviation: string;
    full_name: string;
  } | null;
}

interface PlayersPage {
  data: BallDontLiePlayer[];
  meta: { next_cursor?: number; per_page: number };
}

export interface FetchAllPlayersOptions {
  /** Resume from a previous run instead of starting from page 1. */
  cursor?: number;
  /** Stop after this many requests in this call (for splitting the fetch across multiple runs). */
  maxRequests?: number;
  onPage?: (players: BallDontLiePlayer[], nextCursor: number | undefined) => void | Promise<void>;
}

export interface FetchAllPlayersResult {
  players: BallDontLiePlayer[];
  nextCursor?: number; // set if the fetch stopped before reaching the end
}

/**
 * The free tier is limited to 5 requests/minute, so this paginates the
 * entire player database (thousands of historical players - there's no
 * "just active players" endpoint on the free tier) slowly and
 * deliberately, with an optional per-call request budget and resumable
 * cursor so a single run doesn't have to cover the whole database.
 */
export async function fetchAllPlayers(
  apiKey: string,
  options: FetchAllPlayersOptions = {},
): Promise<FetchAllPlayersResult> {
  const players: BallDontLiePlayer[] = [];
  let cursor = options.cursor;
  let requests = 0;

  for (let page = 0; ; page++) {
    if (options.maxRequests !== undefined && requests >= options.maxRequests) {
      return { players, nextCursor: cursor };
    }

    const url = new URL(`${BASE_URL}/players`);
    url.searchParams.set("per_page", "100");
    if (cursor !== undefined) url.searchParams.set("cursor", String(cursor));

    const res = await fetch(url, { headers: { Authorization: apiKey } });
    requests++;
    if (res.status === 429) {
      await sleep(15_000);
      requests--;
      page--;
      continue;
    }
    if (!res.ok) {
      throw new Error(`balldontlie /players request failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as PlayersPage;
    players.push(...body.data);
    cursor = body.meta.next_cursor;
    await options.onPage?.(body.data, cursor);

    if (!cursor) return { players, nextCursor: undefined };
    await sleep(13_000); // stay under the 5 req/min free-tier limit
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
