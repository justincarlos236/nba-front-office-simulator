# `simulation/generateSchedule.ts` — building the 82-game season calendar

**What this whole file is about:** before a season is played, the sim needs a **schedule** — which
teams play whom, how many times, and on which day. This file builds a realistic one: it reproduces the
real NBA's exact mix of opponents (you play division rivals most, the other conference least) and lays
the games out on a calendar with sensible rules (no team plays three days in a row). It's a big file
with one genuinely clever bit of math — I'll explain the _goal_ of that bit and let you skim the proof.

Open the real file: `src/lib/simulation/generateSchedule.ts`. It works in three stages, which the main
function ties together at the very end:

1. **How many times** does each pair of teams meet? (`buildPairGames`)
2. Turn each pairing into individual **home/away games.** (`expandPairToGames`)
3. Lay those games out on a **calendar of days.** (`assignDays`)

---

## Part 1 — the shapes and a setting

```ts
export interface ScheduleTeam {
  leagueTeamId: string;
  conference: "EAST" | "WEST";
  division: string;
}
export interface ScheduledGame {
  gameNumber: number;
  dayIndex: number;
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
}

const SEASON_LENGTH_DAYS_TARGET = 175;
```

- `ScheduleTeam` — the info the scheduler needs about a team: its id, conference, and division.
- `ScheduledGame` — one finished schedule entry: a game number, a day index (1st day of season, 2nd,
  …), and the home/away teams.
- `SEASON_LENGTH_DAYS_TARGET = 175` — the season should span roughly 175 days (about October–April, like
  the real NBA).

There's also a small shuffle helper:

```ts
function shuffledIndices(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

This makes a list `[0, 1, 2, …]` and randomly **shuffles** it. The loop swaps each item with a random
earlier one (a standard, fair shuffle called Fisher–Yates). The odd-looking `[arr[i], arr[j]] =
[arr[j], arr[i]]` is a one-line way to **swap** two items in a list. It's used to add randomness so
every generated schedule is a bit different.

---

## Part 2 — how many times does each pair meet? (`buildPairGames`)

The real NBA formula (which this reproduces exactly): each team plays its **4 division rivals** 4 times
(16 games), its **10 other same-conference** teams a mix of 3 and 4 times (36 games), and all **15
other-conference** teams twice (30 games). `16 + 36 + 30 = 82`.

The straightforward parts:

- Division rivals: every pair within a division is set to meet **4** times.
- Cross-conference: every East-West pair is set to meet **2** times.

**The clever part — the 6-and-4 same-conference split.** Within a conference, each team must play _some_
non-division opponents 4 times and others 3 times, and it has to work out to exactly 6 of them at 4
games and 4 of them at 3 games — _for every team simultaneously._ Making that balance out is a real
puzzle. The code solves it with a trick from graph theory:

```ts
const bonusMatchings = new Set(shuffledIndices(5, rng).slice(0, 3));
for (let k = 0; k < 5; k++) {
  const count = bonusMatchings.has(k) ? 4 : 3;
  for (let i = 0; i < teamsX.length; i++) {
    const j = (i + k) % teamsY.length;
    pairs.push({ teamA: teamsX[i].leagueTeamId, teamB: teamsY[j].leagueTeamId, count });
  }
}
```

Here's the idea in plain terms (the exact proof is in the code's comment — feel free to skim it): the
matchups between two 5-team divisions can be split into **5 tidy "rounds"** where, in each round, every
team in division X plays exactly one team in division Y (`j = (i + k) % teamsY.length` rotates the
pairing — `%` is the "remainder" operator, which wraps around). If you mark **3** of those 5 rounds as
"4-game" and the other **2** as "3-game," then every single team automatically ends up with exactly
6 four-game and 4 three-game opponents. So instead of a complicated search, the balance falls out of
this rotation structure. **You don't need to follow the math** — the point is: _this stage produces,
for every pair of teams, how many times they'll meet, matching the real NBA distribution exactly._

---

## Part 3 — turning a pairing into home/away games (`expandPairToGames`)

```ts
function expandPairToGames(pair: PairGames): UnscheduledGame[] {
  let homeForA: number;
  if (pair.count % 2 === 0) {
    homeForA = pair.count / 2;
  } else {
    homeForA = pair.teamA < pair.teamB ? Math.ceil(pair.count / 2) : Math.floor(pair.count / 2);
  }
  const homeForB = pair.count - homeForA;
  // ...push that many "A home" games and that many "B home" games...
}
```

If two teams meet, say, 4 times, that's 2 games at each team's home. This splits a pairing into actual
home-and-away games:

- `if (pair.count % 2 === 0)` — `% 2` gives the remainder when divided by 2, so `count % 2 === 0` means
  "even." An even count splits evenly (`count / 2` home games each).
- For an **odd** count (the 3-game pairings), someone hosts the extra game. `pair.teamA < pair.teamB`
  compares the two team ids alphabetically as a simple, consistent tiebreaker (`Math.ceil` rounds _up_
  to give one team the extra home game; `Math.floor` rounds _down_ for the other).
- The rest builds that many "A is home" games and that many "B is home" games.

---

## Part 4 — laying games on a calendar (`assignDays`)

This is the other meaty part: given all the games, decide which **day** each is played, with real rules.

```ts
function isEligible(teamId: string, day: number): boolean {
  const last = lastPlayedDay.get(teamId);
  if (last === undefined || last !== day - 1) return true;
  return (consecutiveStreak.get(teamId) ?? 0) < 2;
}
```

- The key rule: **no team plays three days in a row.** This checks: if the team didn't play yesterday
  (`last !== day - 1`), it's fine to play. If it _did_ play yesterday, it can only play today if its
  current streak of consecutive days is under 2 (so at most a "back-to-back" of two days). A companion
  `markPlayed` function updates each team's last-played day and streak whenever it's scheduled.

The day-by-day loop (simplified):

```ts
while (remainingCount > 0 && day < maxDays) {
  day += 1;
  // sort the remaining pairings so the team FURTHEST BEHIND on games goes first
  // for each candidate, if both teams are free today and eligible, schedule it
}
```

- It walks day by day (`day += 1`). Each day, it looks at the games still unscheduled and **prioritizes
  the teams that are furthest behind** on their remaining games. This keeps all 30 teams finishing
  around the same time instead of some racing ahead. It schedules a game only if both teams are free
  that day and pass the no-three-in-a-row check.
- The loop keeps going until every game is placed (`remainingCount > 0` becomes false). There's a safety
  cap (`day < maxDays`) so it can never loop forever.

**Why bother with a real calendar** instead of just numbering games? Because it lays a foundation for
future date-based features (an All-Star break, a trade deadline, injury recovery timed to games), and it
makes the season feel real — with rivalries you see often and no team playing an impossible three-in-a-
row.

---

## Part 5 — the conductor (`generateRoundRobinSchedule`)

```ts
export function generateRoundRobinSchedule(teams: ScheduleTeam[], seed: string): ScheduledGame[] {
  const rng = createSeededRandom(seed);
  const pairs = buildPairGames(teams, rng);
  const games = pairs.flatMap(expandPairToGames);
  const scheduled = assignDays(games, rng);

  scheduled.sort((a, b) => a.dayIndex - b.dayIndex);
  return scheduled.map((game, index) => ({ ...game, gameNumber: index + 1 }));
}
```

- `const rng = createSeededRandom(seed);` — a **repeatable** random generator (from `seededRandom.md`),
  so the same seed builds the same schedule.
- The three stages, in order: figure out the pairings, expand them into individual games (`.flatMap` is
  like `.map` but flattens the lists-of-games into one big list), and assign days.
- `scheduled.sort((a, b) => a.dayIndex - b.dayIndex)` — sort all games by day (earliest first). Then
  `.map((game, index) => ({ ...game, gameNumber: index + 1 }))` numbers them 1, 2, 3… in that order
  (`{ ...game, gameNumber: ... }` copies each game and adds a `gameNumber`). Because games are numbered
  in day order, other code that processes "game by game" automatically goes in calendar order.

---

## Zooming out

This file has two clever ideas wrapped in a lot of bookkeeping: (1) reproducing the exact NBA opponent
counts using a rotation trick so the 6-and-4 split balances automatically, and (2) laying games on a
real calendar with a no-three-in-a-row rule and a "keep everyone caught up" priority. You don't need to
internalize the graph-theory proof — the takeaway is that the schedule isn't a random jumble; it's a
faithful, calendar-aware copy of a real NBA season, generated repeatably from a seed.

**Next file:** `simulation/leagueEvents.md` — the injuries and computer-vs-computer trades that happen
around the league as games are played.
