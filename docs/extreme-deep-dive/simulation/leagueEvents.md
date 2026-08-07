# `simulation/leagueEvents.ts` — injuries and computer-vs-computer moves

**What this whole file is about:** a real NBA season isn't just games — players get injured, and other
teams make trades and signings without you. This file produces that "around the league" activity as
games are simulated. The amount of activity scales with **how many games** were just played, so
simming 3 games is quiet and simming 50 is eventful — like a real season's news ebb and flow.

Open the real file: `src/lib/simulation/leagueEvents.ts`. It has two big parts: **injuries** and
**computer-vs-computer trades** (plus a small signings piece). I'll walk the core logic and flag the
tuning knobs.

---

## Part 1 — a tiny helper and the injury name lists

```ts
const MINOR_INJURIES = ["a sprained ankle", "back spasms" /* ... */];
const MODERATE_INJURIES = ["a hamstring strain" /* ... */];
const MAJOR_INJURIES = ["a torn ACL", "a torn Achilles" /* ... */];

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}
```

- Three lists of injury descriptions, grouped by severity (minor, moderate, major). These are just the
  flavor text for the news ("Player X is out with a hamstring strain").
- `pick<T>(pool, rng)` — a small helper that **picks a random item from a list.** `pool[Math.floor(rng()
  - pool.length)]`= a random position from 0 to the list length, floored to a whole number, used to
grab that item. The`<T>`is a "generic" — it just means "this works for a list of *any* type of thing"
(a list of injury strings, a list of players, whatever). You'll see`pick(...)` used all over this file.

---

## Part 2 — rolling for an injury (`rollForTeamInjury`)

```ts
export function rollForTeamInjury(healthyRoster, rng = Math.random, chance = 0.02, medicalStaffQuality = null, medicalInvestmentDelta = 0): InjuryRollResult | null {
  if (healthyRoster.length === 0) return null;

  const staffFrequencyFactor = medicalStaffQuality === null ? 1 : clamp(1 - (medicalStaffQuality - 72) * 0.01, 0.6, 1.3);
  const investmentFrequencyFactor = clamp(1 - medicalInvestmentDelta * 0.015, 0.8, 1.2);
  const frequencyFactor = staffFrequencyFactor * investmentFrequencyFactor;
  if (rng() >= chance * frequencyFactor) return null;

  const injured = pick(healthyRoster, rng);
  const tierRoll = rng();

  if (tierRoll < 0.6) {
    return { ...injured, durationGames: /* 1-5 */, injuryName: pick(MINOR_INJURIES, rng), severity: "DAY_TO_DAY" };
  }
  if (tierRoll < 0.9) {
    return { ...injured, durationGames: /* 6-15 */, injuryName: pick(MODERATE_INJURIES, rng), severity: "OUT" };
  }
  return { ...injured, durationGames: /* 16-30 */, injuryName: pick(MAJOR_INJURIES, rng), severity: "SEASON_ENDING" };
}
```

This rolls for one injury for one team, once per game. Reading the important lines:

- `if (healthyRoster.length === 0) return null;` — if nobody's healthy to injure, return `null` ("no
  event happened"). **`null` here means "nothing occurred."**
- `chance = 0.02` — a **default** 2% chance of an injury per team per game.
- The two "factor" lines are the medical staff/investment effects — a good medical staff and sports-
  science spending make injuries _less_ frequent (they scale the 2% down). These are anchored so that
  "no staff" (null) has no effect. (`clamp` keeps the factors in a sensible range.) You can treat these
  as tuning knobs.
- `if (rng() >= chance * frequencyFactor) return null;` — the actual roll. If the random number is
  **not** below the (adjusted) injury chance, nothing happens — return `null`. So ~98% of the time,
  this returns "no injury."
- If we get past that, someone is injured: `const injured = pick(healthyRoster, rng);` picks a random
  healthy player. (**Random, not weighted by rating** — real injuries hit stars and scrubs alike.)
- `const tierRoll = rng();` then decides severity: under 0.6 (60%) → a **minor** day-to-day injury (out
  1–5 games); under 0.9 (the next 30%) → **moderate**, out 6–15 games; otherwise (10%) → a
  **season-ending** injury, out 16–30 games. Each picks a matching flavor name and returns the result.

---

## Part 3 — "did at least one event happen?" (`shouldTriggerEvent`)

```ts
export function shouldTriggerEvent(
  gamesInBatch: number,
  chancePerGame: number,
  rng = Math.random,
): boolean {
  if (gamesInBatch <= 0) return false;
  const chance = 1 - (1 - chancePerGame) ** gamesInBatch;
  return rng() < chance;
}
```

Some events (like a CPU trade) have a per-game chance, but the sim runs a _batch_ of games at once. This
converts "chance per game" into "chance across the whole batch."

- `1 - (1 - chancePerGame) ** gamesInBatch` — a standard probability formula. `(1 - chancePerGame)` is
  the chance an event _doesn't_ happen in one game; raising it to the power of the number of games
  (`** gamesInBatch`) gives the chance it doesn't happen in _any_ of them; `1 - that` is the chance it
  happens **at least once.** So more games → higher chance something occurs, which is why big sims are
  eventful.
- `return rng() < chance;` — roll against that combined chance.

---

## Part 4 — computer-vs-computer trades (`rollForCpuTrade`)

This is the most involved part: making two computer teams actually trade with each other, believably.
The interfaces `CpuRosterPlayer` and `CpuTeam` describe a team and its players (rating, age, salary,
needs, personality, etc.). Then a few helpers pick who to trade:

- `pickTradeablePlayer(roster, rng)` — a fallback that picks a random player, biased toward the _lower_-
  rated ~70% of the roster (so stars aren't randomly dealt).
- `pickTradeTarget(...)` — the _smart_ version: the team looking to acquire someone prefers a player who
  fills one of **its own needs** and matches its strategy (a win-now team eyes veterans; a rebuilder eyes
  youth), reusing the exact same `playerFillsNeed`/personality ideas from the trade AI.
- `pickTradeOffer(...)` — picks what to offer _back_: a "surplus" player (one that doesn't fill the
  team's own needs) whose value is closest to the target's, so the offer is plausible, not lopsided.

Then the main function ties it together:

```ts
export function rollForCpuTrade(teams, season, rng = Math.random, maxAttempts = 5): CpuTradeResult | null {
  if (teams.length < 2) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // pick two different random teams A and B
    const target = pickTradeTarget(teamB.roster, ...) ?? pickTradeablePlayer(teamB.roster, rng);
    if (!target) continue;
    const offer = pickTradeOffer(teamA.roster, ...) ?? pickTradeablePlayer(teamA.roster, rng);
    if (!offer) continue;

    const aAccepts = evaluateTradeOffer({ /* team A receiving target for offer */ });
    if (aAccepts.decision !== "ACCEPT") continue;

    const bAccepts = evaluateTradeOffer({ /* team B receiving offer for target */ });
    if (bAccepts.decision !== "ACCEPT") continue;

    const validation = validateTrade({ /* the two-player swap */ });
    if (validation.isValid) {
      return { /* the executed swap + both teams' scores */ };
    }
  }
  return null;
}
```

- `for (let attempt = 0; attempt < maxAttempts; attempt++)` — it **tries up to 5 times** to find a deal
  both teams like. Each attempt:
  - Picks two random teams, a target player from one, and an offer player from the other. (`?? pickTradeablePlayer(...)` is a fallback if the smart picker finds nothing; `if (!target) continue` skips to
    the next attempt if there's still nothing.)
  - `evaluateTradeOffer(...)` — the **exact same trade AI** the user faces (from `trade/evaluateTradeOffer.md`).
    **Both** teams must independently return `"ACCEPT"`; if either doesn't, `continue` to the next attempt.
  - `validateTrade(...)` — and it must be **cap-legal** (from `trade/validateTrade.md`).
  - Only if all three pass does it return the completed trade. Otherwise, after 5 failed attempts, it
    returns `null` (a quiet "no CPU trade happened this time," not an error).
- **The big idea:** the computer teams are held to the _same standards a human is_ — a fair, mutually-
  agreeable, cap-legal deal. The AI can't magically make a trade the user couldn't.

---

## Part 5 — computer free-agent signings (`rollForCpuSigning`)

```ts
export function rollForCpuSigning(
  cpuTeamIds: string[],
  freeAgentIds: string[],
  rng = Math.random,
): CpuSigningResult | null {
  if (cpuTeamIds.length === 0 || freeAgentIds.length === 0) return null;
  return { leagueTeamId: pick(cpuTeamIds, rng), leaguePlayerId: pick(freeAgentIds, rng) };
}
```

Much simpler than trades: minimum-salary signings are _always_ cap-legal (any team can always add a
minimum player), so there's no need to check legality or re-roll. It just picks a random computer team
and a random available free agent and pairs them. (If there are no teams or no free agents, it returns
`null`.)

---

## Zooming out

This file is what makes the league feel _alive_ around you: players get hurt (with a realistic
frequency and severity mix), and rival teams wheel and deal on their own. The two ideas worth keeping:
(1) event frequency scales with games played, so the season's activity feels natural, and (2) the
computer teams reuse the _exact same_ trade evaluation and legality rules the human plays under — so
their moves are believable and fair, never cheating. It's a great example of building new behavior
almost entirely out of functions we've already met (`evaluateTradeOffer`, `validateTrade`,
`playerFillsNeed`).

**Next file:** `simulation/simulateLiveGame.md` — the quarter-by-quarter "watch it live" experience for
your own playoff games. That's the last file in `simulation/`.
