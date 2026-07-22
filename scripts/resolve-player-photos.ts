/**
 * One-time, resumable pass over prisma/data/players.json that resolves a
 * real headshot for every real player via ESPN's public search API + CDN
 * (src/lib/data-sources/espnPlayerPhoto.ts), and writes photoUrl back into
 * the same file - the exact file prisma/seed.ts already reads, so no new
 * seed step is needed. Same checkpoint/resumability discipline as
 * scripts/import-players.ts: progress is saved after every player, so a
 * run can be safely interrupted and continued without re-resolving
 * players already handled.
 *
 * Run with: npx tsx scripts/resolve-player-photos.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildEspnHeadshotUrl,
  findEspnAthleteId,
  type FetchLike,
} from "../src/lib/data-sources/espnPlayerPhoto";

const CHECKPOINT_DIR = path.join(import.meta.dirname, "..", ".data-import");
const CHECKPOINT_PATH = path.join(CHECKPOINT_DIR, "player-photos.json");
const PLAYERS_PATH = path.join(import.meta.dirname, "..", "prisma", "data", "players.json");

interface PlayerRecord {
  externalId: string;
  fullName: string;
  photoUrl?: string | null;
  [key: string]: unknown;
}

interface PlayersFile {
  season: number;
  players: PlayerRecord[];
}

interface PhotoCheckpointEntry {
  espnId: string | null;
  photoUrl: string | null;
  matchConfidence: "exact" | "fuzzy" | null;
  contentLength: number | null;
}

interface Checkpoint {
  // Keyed by externalId, so re-runs skip players already resolved.
  resolved: Record<string, PhotoCheckpointEntry>;
}

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, "utf-8"));
  } catch {
    return { resolved: {} };
  }
}

async function saveCheckpoint(checkpoint: Checkpoint) {
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST_DELAY_MS = 300;

const fetchImpl: FetchLike = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "nba-front-office-simulator/1.0" } });
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

async function headImpl(url: string): Promise<{ ok: boolean; contentLength: number | null }> {
  const res = await fetch(url, { method: "HEAD" });
  const lengthHeader = res.headers.get("content-length");
  return { ok: res.ok, contentLength: lengthHeader ? Number(lengthHeader) : null };
}

async function main() {
  const checkpoint = await loadCheckpoint();
  const file: PlayersFile = JSON.parse(await readFile(PLAYERS_PATH, "utf-8"));

  const remaining = file.players.filter((p) => !checkpoint.resolved[p.externalId]);
  console.log(
    `${Object.keys(checkpoint.resolved).length} players already resolved, ${remaining.length} remaining.`,
  );

  let resolvedCount = 0;
  let fuzzyCount = 0;
  for (const player of remaining) {
    const match = await findEspnAthleteId(player.fullName, fetchImpl);
    let entry: PhotoCheckpointEntry;

    if (!match) {
      entry = { espnId: null, photoUrl: null, matchConfidence: null, contentLength: null };
    } else {
      const url = buildEspnHeadshotUrl(match.espnId);
      const headResult = await headImpl(url);
      entry = {
        espnId: match.espnId,
        photoUrl: headResult.ok ? url : null,
        matchConfidence: match.matchConfidence,
        contentLength: headResult.ok ? headResult.contentLength : null,
      };
      if (headResult.ok && match.matchConfidence === "fuzzy") fuzzyCount++;
      if (headResult.ok) resolvedCount++;
    }

    checkpoint.resolved[player.externalId] = entry;
    await saveCheckpoint(checkpoint);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `Resolved ${resolvedCount} real photos this run (${fuzzyCount} via a fuzzy name match - worth spot-checking).`,
  );

  // Log the content-length distribution of successful matches so a human
  // can spot a suspicious cluster of identical sizes (a likely sign of
  // ESPN serving a generic silhouette for players with no real photo,
  // rather than the photo simply not existing).
  const lengths = Object.values(checkpoint.resolved)
    .filter((e) => e.photoUrl && e.contentLength)
    .map((e) => e.contentLength as number);
  const lengthCounts = new Map<number, number>();
  for (const len of lengths) lengthCounts.set(len, (lengthCounts.get(len) ?? 0) + 1);
  const suspicious = [...lengthCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  if (suspicious.length > 0) {
    console.log(
      "Content-length values shared by 3+ players (possible generic/silhouette image, worth a manual look):",
      suspicious,
    );
  }

  // Write photoUrl back into players.json.
  const photoByExternalId = new Map(
    Object.entries(checkpoint.resolved).map(([id, entry]) => [id, entry.photoUrl]),
  );
  const updated: PlayersFile = {
    ...file,
    players: file.players.map((p) => ({
      ...p,
      photoUrl: photoByExternalId.get(p.externalId) ?? null,
    })),
  };
  await writeFile(PLAYERS_PATH, JSON.stringify(updated, null, 2));
  console.log(`Wrote photoUrl for ${file.players.length} players to ${PLAYERS_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
