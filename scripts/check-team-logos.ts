/**
 * Resolves every club's logo against Wikipedia's current canonical file, and
 * reports the aspect ratio each one renders at.
 *
 * Two failures prompted this. Chicago's URL pointed at the `en` wiki for a file
 * that lives on Commons, so it 404'd and the card showed nothing. And San
 * Antonio's logo is 2.21:1 - inside a square box with `object-contain` it fits
 * to width and fills less than half the height, which reads as "the logo is
 * broken" rather than "this logo is wide".
 *
 * Run with: npx tsx scripts/check-team-logos.ts
 */
import { TEAM_SEEDS } from "../prisma/data/teams";

const UA = "nba-front-office-simulator/1.0 (logo integrity check)";
const THUMB_WIDTH = 330;
/** Wikimedia throttles bursts. This is a maintenance script; it can wait. */
const REQUEST_GAP_MS = 1500;
const MAX_RETRIES = 4;
/** Matches MAX_ASPECT in src/components/teams/TeamLogo.tsx. */
const MAX_COMFORTABLE_ASPECT = 1.6;

interface Row {
  team: string;
  status: number | string;
  aspect: string;
  canonical: string;
  matchesSeed: boolean;
}

/** Wikipedia's current lead image for a club's article, at our thumbnail width. */
async function canonicalLogo(title: string): Promise<{ url: string; aspect: number } | null> {
  const api =
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages` +
    `&piprop=thumbnail&pithumbsize=${THUMB_WIDTH}&titles=${encodeURIComponent(title)}&format=json`;
  const res = await fetchPolitely(api);
  if (!res?.ok) return null;
  const body = (await res.json()) as {
    query?: {
      pages?: Record<string, { thumbnail?: { source: string; width: number; height: number } }>;
    };
  };
  const page = Object.values(body.query?.pages ?? {})[0];
  if (!page?.thumbnail) return null;
  // The API appends analytics query params; the bare file URL is what we store.
  return {
    url: page.thumbnail.source.split("?")[0],
    aspect: page.thumbnail.width / page.thumbnail.height,
  };
}

/** Retries a 429 with growing backoff, so throttling is never read as a dead link. */
async function fetchPolitely(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status !== 429) return res;
      await sleep(REQUEST_GAP_MS * 2 ** (attempt + 1));
    } catch {
      await sleep(REQUEST_GAP_MS * 2 ** (attempt + 1));
    }
  }
  return null;
}

async function statusOf(url: string): Promise<number | string> {
  const res = await fetchPolitely(url);
  return res ? res.status : "throttled";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows: Row[] = [];
  for (const team of TEAM_SEEDS) {
    const title = `${team.city} ${team.name}`;
    // Serial, not parallel. Wikimedia answers a burst with 429s, and a run
    // full of 429s looks exactly like a run full of dead links - the first
    // attempt at this reported 21 of 30 "broken" when none of them were.
    const status = await statusOf(team.logoUrl);
    await sleep(REQUEST_GAP_MS);
    const canonical = await canonicalLogo(title);
    rows.push({
      team: team.abbreviation,
      status,
      aspect: canonical ? canonical.aspect.toFixed(2) : "?",
      canonical: canonical?.url ?? "(none)",
      matchesSeed: canonical?.url === team.logoUrl,
    });
    // Wikimedia rate-limits bulk requests; this is a maintenance script, not a
    // hot path, so it can afford to be polite.
    await sleep(REQUEST_GAP_MS);
  }

  console.table(rows.map(({ canonical, ...rest }) => rest));

  const broken = rows.filter((r) => r.status !== 200);
  // A lookup that returned nothing is not evidence of anything. Reporting it
  // as drift is how a first run claimed 26 of 30 URLs had moved when the only
  // thing that had happened was Wikipedia declining to answer.
  const unresolved = rows.filter((r) => r.canonical === "(none)");
  const drifted = rows.filter(
    (r) => r.status === 200 && r.canonical !== "(none)" && !r.matchesSeed,
  );
  const wide = rows.filter((r) => Number(r.aspect) >= MAX_COMFORTABLE_ASPECT);

  console.log(`\nbroken (${broken.length}):`);
  for (const r of broken) console.log(`  ${r.team}  ${r.status}  -> ${r.canonical}`);
  console.log(`\nurl drifted from Wikipedia's current file (${drifted.length}):`);
  for (const r of drifted) console.log(`  ${r.team}  -> ${r.canonical}`);
  console.log(`\ncould not be checked against Wikipedia (${unresolved.length}) - rerun for these:`);
  console.log(`  ${unresolved.map((r) => r.team).join(", ") || "none"}`);
  console.log(
    `\nwider than ${MAX_COMFORTABLE_ASPECT}:1, drawn short in a square box (${wide.length}):`,
  );
  for (const r of wide) console.log(`  ${r.team}  ${r.aspect}`);
}

main();
