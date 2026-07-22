import { normalizePlayerName } from "./normalizeName";

const SEARCH_URL = "https://site.web.api.espn.com/apis/common/v3/search";
const HEADSHOT_BASE_URL = "https://a.espncdn.com/i/headshots/nba/players/full";

interface EspnSearchItem {
  id: string;
  displayName: string;
  type: string;
  sport: string;
  league: string;
}

interface EspnSearchResponse {
  items?: EspnSearchItem[];
}

export interface EspnPhotoMatch {
  espnId: string;
  matchConfidence: "exact" | "fuzzy";
}

/** Injectable so tests never make a real network call. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Resolves a real player's name to an ESPN athlete id via ESPN's public,
 * unauthenticated search API - no API key, no manual URL curation. Prefers
 * an exact normalized-name match (same normalization used to join
 * balldontlie bios against box-score stats); falls back to the top result
 * flagged "fuzzy" so a human can spot-check the handful of uncertain ones
 * afterward, rather than silently trusting a possibly-wrong match.
 */
export async function findEspnAthleteId(
  fullName: string,
  fetchImpl: FetchLike,
): Promise<EspnPhotoMatch | null> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("query", fullName);
  url.searchParams.set("type", "player");
  url.searchParams.set("sport", "basketball");
  url.searchParams.set("league", "nba");
  url.searchParams.set("limit", "5");

  const res = await fetchImpl(url.toString());
  if (!res.ok) return null;

  const body = (await res.json()) as EspnSearchResponse;
  const candidates = (body.items ?? []).filter(
    (item) => item.type === "player" && item.sport === "basketball" && item.league === "nba",
  );
  if (candidates.length === 0) return null;

  const normalizedTarget = normalizePlayerName(fullName);
  const exact = candidates.find((c) => normalizePlayerName(c.displayName) === normalizedTarget);
  if (exact) return { espnId: exact.id, matchConfidence: "exact" };

  return { espnId: candidates[0].id, matchConfidence: "fuzzy" };
}

export function buildEspnHeadshotUrl(espnId: string): string {
  return `${HEADSHOT_BASE_URL}/${espnId}.png`;
}

/**
 * Only a real 200 counts as a usable photo - ESPN returns a clean 404 for
 * an invalid athlete id (verified empirically), so existence is a reliable
 * signal without needing to inspect image bytes.
 */
export async function headshotUrlExists(
  url: string,
  headImpl: (url: string) => Promise<{ ok: boolean }>,
): Promise<boolean> {
  const res = await headImpl(url);
  return res.ok;
}
