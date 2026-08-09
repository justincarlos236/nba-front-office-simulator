# 04 — The Simulation Engine

Files: `src/lib/simulation/` (pure) + `src/lib/actions/simulation.ts` (the shell
that persists results). This is where "algorithms" and "time complexity" come up.

## 1. Purpose

Turn rosters into results. The engine decides who wins each game, produces
believable scores and box scores, and rolls those up into standings, a play-in
tournament, playoffs, and awards. It has to be **fast** (a season is ~1,230
games), **deterministic** when seeded (so tests are reliable), and **easy to
reason about**.

## 2. The core algorithm — a logistic win model

The key decision: this is **not** a possession-by-possession simulation. Instead,
each game is modeled statistically from the two teams' **strength ratings** (a
single number per team, derived from its players' overall ratings).

**Step 1 — the margin (a normal draw around the strength difference):**

```
diff          = homeStrength + homeCourtAdvantage - awayStrength
expectedMargin = diff · marginPerStrengthPoint        (≈ 2.31 points per rating point)
homeMargin     = expectedMargin + normal(0, marginSd)  (marginSd ≈ 15)
```

- **Why a margin rather than a coin flip?** Because it answers two questions at
  once. A better team is expected to win *by more*, and the spread means the same
  matchup produces a nail-biter one night and a rout the next — from a single draw.
- **Home-court advantage** is a small additive bonus (~1.1 rating points, which is
  worth about 2.5 points of margin — close to the real thing).

**Step 2 — the winner is just the sign of the margin.** No separate roll. Win
probability is derived from the same two constants:

```
homeWinProbability = Φ(expectedMargin / marginSd)
```

`Φ` is the normal CDF — literally "how often is this margin positive." Because
the displayed probability and the simulated result come from one model, they
**cannot disagree**. A much better team is, say, 80% to win, not 100%, so upsets
stay possible.

`rng` is **passed in**. In production it's `Math.random`; in tests you pass a
deterministic generator, so the same inputs always produce the same game. **This
is how a "random" simulation stays unit-testable.**

**Step 3 — generate a plausible score:** draw how high-scoring the game was in
total (~228 combined, with spread), then split the already-decided margin out of
it. Cheap and believable.

> **This replaced an earlier logistic model** in which the winner and the margin
> were drawn separately. Measured over 246,000 games, that version gave a 97.5%
> favourite the same margin distribution as a coin flip, and produced no game
> decided by 1-2 points and none by more than 22. See `docs/SIMULATION_AUDIT.md`.

### Why this design (defend it)

- **Speed:** one game is a handful of arithmetic operations, so 1,230 games is
  trivial — vs. a possession model that would be thousands of operations per game.
- **Determinism:** seed the RNG → reproducible seasons → reliable tests.
- **Simplicity:** the whole model is a few constants you can reason about, and
  strength is reused elsewhere (trade valuation, GM expectations) so there's one
  definition of "how good is this team."
- **The trade-off:** box scores are _approximated_ from the team result rather
  than emerging from real play. That's the honest limitation (see doc 01's "what
  I'd improve").

## 3. The scaling problem — simulating a season without timing out

**The problem:** a full season is ~1,230 games, each needing a database write. On
a **serverless** host (functions have a time limit), doing all of that in one web
request would time out.

**The solution (in `simulation.ts`):** simulate in **bounded chunks**.

- A `CHUNK_SIZE` (50) caps how many games one inner pass resolves.
- When you click "simulate my next 10 games," an outer loop keeps pulling chunks
  **in chronological order** (by day) until _your_ team has played its 10 —
  meanwhile every other team's games in that window also resolve, so the whole
  league stays in sync.
- Each chunk simulates → generates box scores → applies league events (injuries,
  milestones, streaks) → writes to the DB → repeats.

**Why this matters (interview gold):** it shows you understand a real deployment
constraint (serverless timeouts) and designed around it with **batching/chunking**
instead of one giant transaction. It's a concrete "I thought about how this runs
in production" story.

## 4. Complexity (when they ask "what's the time complexity?")

- **One game:** O(1) — constant arithmetic.
- **A batch of G games:** O(G).
- **Team strength:** computed from a team's ~15 players, O(P) per team, done once
  per simulation pass, not per game.
- The practical bottleneck isn't CPU — it's the **database writes** (one row per
  game + box scores), which is exactly why the work is chunked to stay under the
  serverless time limit.

## 5. Other simulation pieces

| File                                       | Responsibility                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulateGame.ts`                          | The core single-game model above (win prob + score).                                                                                           |
| `boxScore.ts`                              | Distributes a team's score into believable per-player lines using minutes/role.                                                                |
| `teamStrength.ts`                          | Rolls a roster's player ratings into one team-strength number (weighted toward the best players, since NBA games are star-driven).             |
| `generateSchedule.ts`                      | Builds a round-robin schedule (who plays whom, on which day).                                                                                  |
| `simulateSeries.ts`                        | A best-of-7 playoff series (repeatedly simulate games until one team gets 4 wins, with home-court alternating by seed).                        |
| `playoffSeeding.ts`, `playInTournament.ts` | Seed the bracket and run the modern play-in (7–10 seeds).                                                                                      |
| `simulateLiveGame.ts`                      | A quarter-by-quarter "watch it live" version for playoff games — reuses the same strength differential so it can't drift from the batch model. |

## 6. The season "life cycle"

1. **Regular season** — simulate games (chunked) until all are played.
2. **All-Star Weekend** — triggered around midseason.
3. **Play-in tournament** — decides the 7–8 seeds.
4. **Playoffs** — best-of-7 series through the bracket.
5. **Awards** — MVP, DPOY, etc.
6. **Offseason** (`offseason.ts`) — this is where the long-term systems fire:
   player development/decline, contract expirations, the owner evaluating your
   season (job security), finances P&L, fan happiness, and setting up next
   season. Then the draft and free agency.

## 7. Interview questions & strong answers

**Q: Why not simulate possession-by-possession?**

> Speed, determinism, and simplicity. A season is over a thousand games; a
> statistical model runs in constant time per game and is easy to seed for
> reproducible tests. The trade-off is that box scores are approximated rather
> than emergent — which I'd change if realistic per-player stats were the goal.

**Q: How is a "random" simulation testable?**

> The random generator is a parameter. Production passes `Math.random`; tests pass
> a deterministic fake, so a given input always yields the same result and I can
> assert exact outcomes.

**Q: How do you simulate a whole season without the request timing out?**

> I chunk it. Each pass resolves a bounded number of games and writes them, and an
> outer loop repeats until the user's team has advanced far enough. That keeps any
> single serverless invocation short while still advancing all 30 teams.

**Q: Why a logistic function specifically?**

> It maps an unbounded strength difference to a probability in (0,1) with the
> right shape — near 50/50 for even teams, a growing but never-certain edge for
> favorites — which matches how real upsets work. It's the same curve as logistic
> regression and Elo.

## 8. Elevator explanation (30s)

> The simulation engine models each game as a logistic win probability from the
> two teams' strength ratings plus home court, then draws a winner and a plausible
> score. It's deliberately statistical rather than possession-by-possession, so
> it's fast and — because the random generator is injected — fully deterministic
> and testable. To simulate a whole ~1,200-game season without hitting serverless
> timeouts, it runs in bounded chunks, advancing every team's schedule in
> chronological order.
