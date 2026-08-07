# `simulation/playInTournament.ts` — the play-in mini-tournament

**What this whole file is about:** the teams that finished 7th–10th don't go straight to the playoffs
— they play a short "play-in" tournament for the final two playoff spots (the 7th and 8th seeds). This
file runs those few games. It's a clear, concrete example of stringing single games together into a
mini-bracket, reusing `simulateGame` from earlier.

Open the real file: `src/lib/simulation/playInTournament.ts`.

The real format (which the code follows exactly): three games, higher seed always hosts.

- **Game A:** 7 vs 8 — the **winner** grabs the final 7-seed.
- **Game B:** 9 vs 10 — the **loser** is eliminated.
- **Game C:** the loser of Game A vs the winner of Game B — the **winner** gets the final 8-seed.

---

## Part 1 — the shapes

```ts
export interface PlayInSeeds {
  seven: string;
  eight: string;
  nine: string;
  ten: string;
}

export interface PlayInGameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeWon: boolean;
}

export interface PlayInResult {
  finalSeventhSeed: string;
  finalEighthSeed: string;
  games: PlayInGameResult[];
}
```

- `PlayInSeeds` — the four team ids by their seed (`seven`, `eight`, `nine`, `ten`).
- `PlayInGameResult` — one game's outcome (both teams, both scores, who won).
- `PlayInResult` — the final answer: which teams ended up as the 7th and 8th seeds, plus the list of
  games played (for display).

---

## Part 2 — the machine

```ts
export function simulatePlayIn(
  seeds: PlayInSeeds,
  strengthByTeam: Map<string, number>,
  rng: () => number = Math.random,
): PlayInResult {
  const strength = (teamId: string) => strengthByTeam.get(teamId) ?? 0;
  const games: PlayInGameResult[] = [];
```

- Inputs: the four `seeds`, a `strengthByTeam` (a lookup of each team's strength number), and the usual
  injectable `rng`.
- `strengthByTeam: Map<string, number>` — a **`Map`** is a lookup table (like `Record`, but a built-in
  object with `.get`/`.set` methods). This one maps a team id to its strength.
- `const strength = (teamId) => strengthByTeam.get(teamId) ?? 0;` — a tiny local helper function.
  `strengthByTeam.get(teamId)` looks up a team's strength; the `?? 0` gives `0` if it's somehow missing.
  So `strength("someId")` cleanly returns that team's strength. Defining a small helper like this keeps
  the code below readable.
- `const games = [];` — an empty list we'll fill with each game's result.

**Game A — 7 vs 8:**

```ts
const gameA = simulateGame(strength(seeds.seven), strength(seeds.eight), rng);
games.push({
  homeTeamId: seeds.seven,
  awayTeamId: seeds.eight,
  homeScore: gameA.homeScore,
  awayScore: gameA.awayScore,
  homeWon: gameA.homeWon,
});
const finalSeventhSeed = gameA.homeWon ? seeds.seven : seeds.eight;
const gameALoser = gameA.homeWon ? seeds.eight : seeds.seven;
```

- `simulateGame(strength(seeds.seven), strength(seeds.eight), rng)` — play 7 vs 8 by handing their
  strengths to the game model from the last doc. The 7-seed is listed first, so it's the "home" team
  (higher seed hosts).
- `.push({...})` — record the result in our `games` list.
- `const finalSeventhSeed = gameA.homeWon ? seeds.seven : seeds.eight;` — the **winner** becomes the
  final 7-seed (if the home team, the 7-seed, won, it stays the 7-seed; otherwise the 8-seed takes it).
- `const gameALoser = ...` — remember the loser; they get another chance in Game C.

**Game B — 9 vs 10:**

```ts
const gameB = simulateGame(strength(seeds.nine), strength(seeds.ten), rng);
games.push({/* ...9 vs 10 result... */});
const gameBWinner = gameB.homeWon ? seeds.nine : seeds.ten;
```

- Play 9 vs 10, record it. The **winner** (`gameBWinner`) advances to Game C; the loser is out.

**Game C — loser of A vs winner of B:**

```ts
  const gameC = simulateGame(strength(gameALoser), strength(gameBWinner), rng);
  games.push({ /* ...result... */ });
  const finalEighthSeed = gameC.homeWon ? gameALoser : gameBWinner;

  return { finalSeventhSeed, finalEighthSeed, games };
}
```

- Play the loser of Game A against the winner of Game B. (The Game A loser was a higher seed, so it
  hosts.) The **winner** of this becomes the final 8-seed.
- Return the two teams that earned playoff spots, plus all three games.

---

## Zooming out

This file is a nice, readable example of **orchestration** — it doesn't contain any new "rules," it
just calls `simulateGame` three times in the right order and tracks winners and losers between them. The
whole play-in format is expressed as a short, literal sequence of "play this, remember who won, play
that." Every game reuses the exact same game model the regular season uses, so the play-in behaves
consistently with everything else.

**Next file:** `simulation/simulateSeries.md` — the best-of-7 series that the actual playoff rounds use.
