# `simulation/playoffSeeding.ts` — ranking teams for the playoffs

**What this whole file is about:** after the regular season, teams are ranked by their records to
decide who makes the playoffs and in what order (their "seed"). This file does that ranking: it can
compare two teams, and it can sort a whole conference into the top-6 (who go straight to the playoffs)
and seeds 7–10 (who go to the play-in tournament).

Open the real file: `src/lib/simulation/playoffSeeding.ts`. It teaches win-percentage math, sorting
with a tiebreaker, and `.slice`.

---

## Part 1 — the shapes

```ts
export interface StandingsEntry {
  leagueTeamId: string;
  wins: number;
  losses: number;
}

export interface ConferenceSeeding {
  directQualifiers: string[];
  playInTeams: string[];
}
```

- `StandingsEntry` — one team's record: its id, its `wins`, its `losses`.
- `ConferenceSeeding` — the result of ranking a conference: `directQualifiers` (the ids of seeds 1–6,
  who make the playoffs directly) and `playInTeams` (the ids of seeds 7–10, who play the play-in).

---

## Part 2 — win percentage

```ts
export function winPct(entry: StandingsEntry): number {
  const gamesPlayed = entry.wins + entry.losses;
  return gamesPlayed > 0 ? entry.wins / gamesPlayed : 0;
}
```

- Teams are ranked by **winning percentage**, not raw wins (in case they've played different numbers of
  games).
- `const gamesPlayed = entry.wins + entry.losses;` — total games.
- `return gamesPlayed > 0 ? entry.wins / gamesPlayed : 0;` — wins divided by games played (e.g. 50 wins
  in 82 games = `0.61`). The ternary guards against dividing by zero for a team that hasn't played yet
  (returns 0).

---

## Part 3 — comparing two teams (with a tiebreaker)

```ts
export function pickHigherSeed(a: StandingsEntry, b: StandingsEntry): StandingsEntry {
  const pctDiff = winPct(b) - winPct(a);
  if (pctDiff !== 0) return pctDiff < 0 ? a : b;
  return b.wins - a.wins > 0 ? b : a;
}
```

Given two teams, this returns whichever gets the higher seed (and thus home-court advantage).

- `const pctDiff = winPct(b) - winPct(a);` — the difference in win percentage.
- `if (pctDiff !== 0) return pctDiff < 0 ? a : b;` — if their win percentages aren't equal, the higher
  one wins. `pctDiff < 0` means `a`'s percentage was higher (so `b - a` came out negative) → return
  `a`; otherwise `b`.
- `return b.wins - a.wins > 0 ? b : a;` — a **tiebreaker**: if their percentages are exactly equal, the
  team with more total wins gets the edge. (This is a simplification — the real NBA has more elaborate
  tiebreakers involving head-to-head records, etc.)

---

## Part 4 — seeding a whole conference

```ts
export function seedConference(standings: StandingsEntry[]): ConferenceSeeding {
  const sorted = [...standings].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);
  return {
    directQualifiers: sorted.slice(0, 6).map((s) => s.leagueTeamId),
    playInTeams: sorted.slice(6, 10).map((s) => s.leagueTeamId),
  };
}
```

- `[...standings].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins)` — copy the list of teams and
  sort them best-first. The sort rule has a **built-in tiebreaker** using `||` ("or"):
  - `winPct(b) - winPct(a)` sorts by win percentage, highest first (same descending trick as before).
  - `|| b.wins - a.wins` — the `||` here means "if the first part is `0` (a tie in percentage), use the
    second part instead" (sort by wins). This is a neat one-liner way to say "sort by percentage, break
    ties by total wins."
- `sorted.slice(0, 6)` — **`.slice(start, end)`** takes a _section_ of a list, from position `start` up
  to (but not including) `end`. So `.slice(0, 6)` grabs the **top 6** teams (positions 0 through 5).
- `.map((s) => s.leagueTeamId)` — turn those team objects into just their ids.
- `sorted.slice(6, 10)` — grabs positions 6 through 9, i.e. the **7th through 10th** teams → the play-in
  field.
- The result: the top 6 are direct playoff qualifiers; 7–10 go to the play-in.

---

## Zooming out

This file is the "who's in and in what order" step. It's pure sorting and slicing over records. The
`winPct`/`pickHigherSeed` helpers are reused elsewhere too — for example, to decide which team hosts a
playoff series (the higher seed), including the Finals across conferences. Small, focused, reused
everywhere — the usual pattern.

**Next file:** `simulation/playInTournament.md` — the mini-tournament that fills the last two playoff
spots.
