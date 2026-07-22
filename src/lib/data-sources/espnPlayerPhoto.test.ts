import { describe, expect, it, vi } from "vitest";
import { buildEspnHeadshotUrl, findEspnAthleteId, headshotUrlExists } from "./espnPlayerPhoto";

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve(body),
  });
}

describe("findEspnAthleteId", () => {
  it("picks an exact normalized-name match over other candidates", async () => {
    const fetchImpl = mockFetch({
      items: [
        { id: "1", displayName: "Jayson Tate", type: "player", sport: "basketball", league: "nba" },
        {
          id: "4065648",
          displayName: "Jayson Tatum",
          type: "player",
          sport: "basketball",
          league: "nba",
        },
      ],
    });
    const result = await findEspnAthleteId("Jayson Tatum", fetchImpl);
    expect(result).toEqual({ espnId: "4065648", matchConfidence: "exact" });
  });

  it("matches despite accents/suffixes via normalizePlayerName", async () => {
    const fetchImpl = mockFetch({
      items: [
        {
          id: "99",
          displayName: "Luka Doncic",
          type: "player",
          sport: "basketball",
          league: "nba",
        },
      ],
    });
    const result = await findEspnAthleteId("Luka Dončić", fetchImpl);
    expect(result).toEqual({ espnId: "99", matchConfidence: "exact" });
  });

  it("falls back to the top result flagged fuzzy when no exact match exists", async () => {
    const fetchImpl = mockFetch({
      items: [
        {
          id: "5",
          displayName: "J. Somebody Else",
          type: "player",
          sport: "basketball",
          league: "nba",
        },
      ],
    });
    const result = await findEspnAthleteId("Some Obscure Player", fetchImpl);
    expect(result).toEqual({ espnId: "5", matchConfidence: "fuzzy" });
  });

  it("filters out non-player/non-nba results before matching", async () => {
    const fetchImpl = mockFetch({
      items: [
        { id: "1", displayName: "Jayson Tatum", type: "team", sport: "basketball", league: "nba" },
        { id: "2", displayName: "Jayson Tatum", type: "player", sport: "football", league: "nfl" },
      ],
    });
    const result = await findEspnAthleteId("Jayson Tatum", fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null when there are no results", async () => {
    const fetchImpl = mockFetch({ items: [] });
    const result = await findEspnAthleteId("Nobody At All", fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null when the request itself fails", async () => {
    const fetchImpl = mockFetch({}, false);
    const result = await findEspnAthleteId("Anyone", fetchImpl);
    expect(result).toBeNull();
  });
});

describe("buildEspnHeadshotUrl", () => {
  it("builds the expected CDN URL from an athlete id", () => {
    expect(buildEspnHeadshotUrl("4065648")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/4065648.png",
    );
  });
});

describe("headshotUrlExists", () => {
  it("treats a 200 response as existing", async () => {
    const headImpl = vi.fn().mockResolvedValue({ ok: true });
    expect(await headshotUrlExists("https://example.com/a.png", headImpl)).toBe(true);
  });

  it("treats a non-200 response as not existing", async () => {
    const headImpl = vi.fn().mockResolvedValue({ ok: false });
    expect(await headshotUrlExists("https://example.com/a.png", headImpl)).toBe(false);
  });
});
