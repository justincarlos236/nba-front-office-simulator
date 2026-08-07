# `simulation/simulateSeries.ts` — playing a best-of-7 playoff series

**What this whole file is about:** in the playoffs, a single game doesn't decide anything — teams play
a **series**, and the first to win 4 games advances. This file plays out a whole series, game by game,
handling home-court advantage (the higher seed hosts more games) until one team reaches 4 wins. It's a
great first example of a **`while` loop** — "keep going until a condition is met."

Open the real file: `src/lib/simulation/simulateSeries.ts`.

---

## Part 1 — the shapes and the home-court pattern

```ts
export interface SeriesState {
  higherSeedWins: number;
  lowerSeedWins: number;
}

export interface SeriesGameResult {
  gameNumber: number;
  isHigherSeedHome: boolean;
  homeScore: number;
  awayScore: number;
  higherSeedWonGame: boolean;
}

export function isHigherSeedHomeGame(gameNumber: number): boolean {
  return [1, 2, 5, 7].includes(gameNumber);
}
```

- `SeriesState` — the running score of the series: how many games each side has won so far.
- `SeriesGameResult` — the record of one game in the series.
- `isHigherSeedHomeGame(gameNumber)` — decides whether the higher seed hosts a given game. Real NBA
  series use a "2-2-1-1-1" home pattern, where the higher seed hosts games **1, 2, 5, and 7.** The code
  says exactly that: `[1, 2, 5, 7].includes(gameNumber)` — `.includes(...)` checks whether that list
  contains the game number. So for game 3, this returns `false` (the lower seed hosts game 3).

---

## Part 2 — playing the next game in a series

```ts
export function simulateNextSeriesGame(
  state: SeriesState,
  higherStrength: number,
  lowerStrength: number,
  rng: () => number = Math.random,
): { newState: SeriesState; game: SeriesGameResult } {
  const gameNumber = state.higherSeedWins + state.lowerSeedWins + 1;
  const isHigherSeedHome = isHigherSeedHomeGame(gameNumber);
  const homeStrength = isHigherSeedHome ? higherStrength : lowerStrength;
  const awayStrength = isHigherSeedHome ? lowerStrength : higherStrength;
  const result = simulateGame(homeStrength, awayStrength, rng);
  const higherSeedWonGame = isHigherSeedHome ? result.homeWon : !result.homeWon;

  const newState: SeriesState = {
    higherSeedWins: state.higherSeedWins + (higherSeedWonGame ? 1 : 0),
    lowerSeedWins: state.lowerSeedWins + (higherSeedWonGame ? 0 : 1),
  };

  return {
    newState,
    game: {
      gameNumber,
      isHigherSeedHome,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      higherSeedWonGame,
    },
  };
}
```

This plays exactly one game and reports the updated series score.

- `const gameNumber = state.higherSeedWins + state.lowerSeedWins + 1;` — which game are we on? It's the
  total games already played, plus 1. (If the series is 2-1, that's 3 games played, so this is game 4.)
- `const isHigherSeedHome = isHigherSeedHomeGame(gameNumber);` — does the higher seed host this game?
- The next two lines assign home/away strengths accordingly (ternaries): if the higher seed is home,
  it's the home strength; otherwise the lower seed is home. This is how home-court advantage gets
  applied to the right team each game.
- `const result = simulateGame(homeStrength, awayStrength, rng);` — play the game with the normal game
  model.
- `const higherSeedWonGame = isHigherSeedHome ? result.homeWon : !result.homeWon;` — figure out whether
  the _higher seed_ won, which depends on whether it was home. If the higher seed was home, it won iff
  the home team won. If it was away, it won iff the home team _lost_ (`!result.homeWon` — `!` flips
  true/false).
- `newState` — a fresh series score. `state.higherSeedWins + (higherSeedWonGame ? 1 : 0)` adds 1 to the
  higher seed's wins if it won this game, else 0. The lower seed's line does the opposite. (We build a
  _new_ state object rather than changing the old one — a clean habit.)
- Return both the new state and the game's result.

---

## Part 3 — playing the whole series

```ts
export function simulateSeriesToCompletion(
  higherStrength: number,
  lowerStrength: number,
  winsNeeded: number,
  startState: SeriesState = { higherSeedWins: 0, lowerSeedWins: 0 },
  rng: () => number = Math.random,
): SeriesResult {
  let state = startState;
  const games: SeriesGameResult[] = [];

  while (state.higherSeedWins < winsNeeded && state.lowerSeedWins < winsNeeded) {
    const { newState, game } = simulateNextSeriesGame(state, higherStrength, lowerStrength, rng);
    state = newState;
    games.push(game);
  }

  return { finalState: state, winnerIsHigherSeed: state.higherSeedWins >= winsNeeded, games };
}
```

- Inputs: both teams' strengths, `winsNeeded` (4 for a best-of-7), an optional `startState` (defaults to
  0-0), and the `rng`.
- `let state = startState;` — a **changeable** box holding the current series score, starting at 0-0.
- `const games = [];` — a list to collect every game played.
- **The `while` loop:**
  ```ts
  while (state.higherSeedWins < winsNeeded && state.lowerSeedWins < winsNeeded) { ... }
  ```
  - A `while` loop **keeps repeating its body as long as the condition is true.** The condition here:
    _both_ teams still have fewer than the needed wins (`&&` = "and"). In plain terms: "keep playing
    games while nobody has clinched yet."
  - Each time through: play the next game (`simulateNextSeriesGame`), update `state` to the new score,
    and add the game to the list. The moment one team reaches `winsNeeded`, the condition becomes false
    and the loop stops. So a series naturally runs 4 to 7 games — however long it takes for someone to
    win 4.
  - `const { newState, game } = simulateNextSeriesGame(...)` — destructuring again: pull the two pieces
    out of what the function returns.
- `return { finalState: state, winnerIsHigherSeed: state.higherSeedWins >= winsNeeded, games };` — hand
  back the final score, whether the higher seed won (did it reach the needed wins?), and every game.

---

## Zooming out

This file introduces the `while` loop, which is the natural tool for "repeat until something happens"
— here, "play games until someone wins 4." Everything else is bookkeeping: track the score, apply
home court to the right team each game, and stop at the finish line. Like the play-in, it invents no
new game logic — it just wraps repeated calls to `simulateGame` in the right structure. The playoff
system (all the rounds up to the Finals) is built on this one function.

**Next files:** the two big remaining `simulation/` files — `boxScore.md` (turning a team score into
individual player stat lines) and `generateSchedule.md` (building the 82-game calendar). Those are the
meatiest in the folder, so I'll give them their own passes.
