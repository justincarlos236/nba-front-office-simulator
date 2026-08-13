import type { BioProvider } from "./adapter";
import type { CanonicalPlayerBio } from "../canonical";
import { normalizePlayerName } from "../normalizeName";
import { mapPosition } from "../mapPosition";

/**
 * Current NBA rosters from balldontlie's `/players/active`.
 *
 * **This exists because hoopR is a season behind.** hoopR publishes rosters as
 * `rosters_<endYear>.parquet`, and that file does not appear until a season is
 * underway - checked on 2026-08-13, `rosters_2027.parquet` was a 404 while the
 * 2026-27 offseason was already over. Rebuilding the dataset from hoopR alone
 * in August therefore reproduces the *previous* season's lineups: measured, 177
 * of 585 active players were on a different team than hoopR had them.
 *
 * So roster placement comes from here, and everything hoopR does better -
 * birth dates it carries and this endpoint does not, finer positions than
 * balldontlie's coarse G/F/C - is merged on top. That split is what
 * `adapter.ts` describes: "real sources rarely cover everything well ... the
 * pipeline mixes them by role."
 *
 * Bios emitted here carry `birthDate: null` by design. The caller is expected
 * to enrich from a bio-detail provider and fall back to `draftYear` for anyone
 * genuinely new, which `resolvePlayerAge` already handles.
 */

const BASE_URL = "https://api.balldontlie.io/v1";
const PROVIDER_ID = "balldontlie";
const PAGE_SIZE = 100;

/** Rate-limit backoff. The endpoint 429s readily even on a paid tier. */
const RETRY_AFTER_MS = 10_000;
const BETWEEN_PAGES_MS = 1_200;

interface ActivePlayerRow {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  country: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_number: number | null;
  team?: { abbreviation?: string | null } | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** balldontlie reports height as feet-inches, e.g. "6-11". */
export function parseHeightInches(height: string | null | undefined): number | null {
  if (!height) return null;
  const [feet, inches] = height.split("-").map((part) => Number(part));
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  return feet * 12 + inches;
}

function toBio(row: ActivePlayerRow): CanonicalPlayerBio {
  const fullName = `${row.first_name} ${row.last_name}`.trim();
  const weight = Number(row.weight);
  return {
    normalizedName: normalizePlayerName(fullName),
    fullName,
    position: mapPosition(row.position),
    heightInches: parseHeightInches(row.height),
    weightLbs: Number.isFinite(weight) && weight > 0 ? weight : null,
    // Not carried by this endpoint - enriched from a bio-detail provider, or
    // left null so age falls back to draft year.
    birthDate: null,
    draftYear: row.draft_year,
    draftRound: row.draft_round,
    draftPick: row.draft_number,
    nationality: row.country,
    college: row.college,
    photoUrl: null,
    currentTeamAbbreviation: row.team?.abbreviation ?? null,
    refs: [{ provider: PROVIDER_ID, id: String(row.id) }],
  };
}

export function createBalldontlieRosterProvider(apiKey: string): BioProvider {
  return {
    id: PROVIDER_ID,
    displayName: "balldontlie (active rosters)",
    license: "Commercial - requires an API key",
    sourceUrl: "https://docs.balldontlie.io/",

    async fetchBios(): Promise<CanonicalPlayerBio[]> {
      const bios: CanonicalPlayerBio[] = [];
      let cursor: number | null = null;

      for (;;) {
        const url = new URL(`${BASE_URL}/players/active`);
        url.searchParams.set("per_page", String(PAGE_SIZE));
        if (cursor !== null) url.searchParams.set("cursor", String(cursor));

        const res = await fetch(url, { headers: { Authorization: apiKey } });
        if (res.status === 429) {
          await sleep(RETRY_AFTER_MS);
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `balldontlie rejected /players/active (${res.status}). This endpoint needs at ` +
              `least the ALL-STAR tier - check BALLDONTLIE_API_KEY and the subscription.`,
          );
        }
        if (!res.ok) {
          throw new Error(`balldontlie /players/active failed: ${res.status} ${await res.text()}`);
        }

        const body = (await res.json()) as {
          data?: ActivePlayerRow[];
          meta?: { next_cursor?: number | null };
        };
        for (const row of body.data ?? []) {
          if (!row.first_name && !row.last_name) continue;
          bios.push(toBio(row));
        }

        cursor = body.meta?.next_cursor ?? null;
        if (cursor === null) break;
        await sleep(BETWEEN_PAGES_MS);
      }

      return bios;
    },
  };
}
