# `gm/careerRecord.ts` — scoring a finished GM tenure into a reputation

**What this whole file is about:** when a franchise ends (you're fired or you retire), this file turns
what you accomplished into a change in your lifetime **reputation** — the score that follows you across
every team you'll ever run. It also maps reputation to a career **title** and describes your best playoff
finish.

Open the real file: `src/lib/gm/careerRecord.ts`. It's pure math over an already-collected career summary.

---

## Part 1 — the reputation change

```ts
export type CareerEndReason = "FIRED" | "RETIRED";

export interface ReputationDeltaInput {
  seasons: number;
  wins: number;
  losses: number;
  championships: number;
  playoffAppearances: number;
  endReason: CareerEndReason;
}

const MIN_REPUTATION_DELTA = -40;
const MAX_REPUTATION_DELTA = 60;

export function computeReputationDelta(input: ReputationDeltaInput): number {
  const gamesPlayed = input.wins + input.losses;
  const winPct = gamesPlayed > 0 ? input.wins / gamesPlayed : 0.5;

  const raw =
    input.championships * 15 +
    input.playoffAppearances * 5 +
    Math.round((winPct - 0.5) * 40) +
    (input.endReason === "FIRED" ? -20 : 0);

  return Math.max(MIN_REPUTATION_DELTA, Math.min(MAX_REPUTATION_DELTA, raw));
}
```

- `ReputationDeltaInput` — the summary of a tenure: seasons, total wins/losses, championships, playoff
  appearances, and how it ended (fired or retired).
- `const winPct = gamesPlayed > 0 ? input.wins / gamesPlayed : 0.5;` — the career winning percentage (with
  a ternary guarding against dividing by zero for a tenure with no games, defaulting to a neutral 0.5).
- The `raw` reputation change adds up four contributions:
  - `input.championships * 15` — each title is a huge boost (+15).
  - `input.playoffAppearances * 5` — each playoff appearance helps (+5).
  - `Math.round((winPct - 0.5) * 40)` — your record vs. .500. A winning tenure adds points; a losing one
    subtracts. `(winPct - 0.5)` is how far above/below .500 you were; `× 40` scales it (a .600 GM gets
    `(0.6-0.5)*40 = +4`; a .400 GM gets −4).
  - `(input.endReason === "FIRED" ? -20 : 0)` — a ternary: getting **fired** costs 20 points; retiring on
    your own terms costs nothing.
- `return Math.max(-40, Math.min(60, raw));` — **clamp** the total change to between −40 and +60, so no
  single tenure can swing your reputation too wildly.

---

## Part 2 — the career title

```ts
export type CareerTitle =
  | "HALL_OF_FAME_EXECUTIVE"
  | "RESPECTED_EXECUTIVE"
  | "STEADY_HAND"
  | "JOURNEYMAN_GM"
  | "UNDER_SCRUTINY"
  | "CAUTIONARY_TALE";

export function computeCareerTitle(gmReputation: number): CareerTitle {
  if (gmReputation >= 90) return "HALL_OF_FAME_EXECUTIVE";
  if (gmReputation >= 75) return "RESPECTED_EXECUTIVE";
  if (gmReputation >= 60) return "STEADY_HAND";
  if (gmReputation >= 40) return "JOURNEYMAN_GM";
  if (gmReputation >= 20) return "UNDER_SCRUTINY";
  return "CAUTIONARY_TALE";
}
```

- `computeCareerTitle(gmReputation)` — the by-now-familiar highest-first threshold chain, bucketing your
  0–100 lifetime reputation into a title. At the top, a 90+ reputation makes you a **Hall of Fame
  Executive**; at the bottom, under 20 is a **Cautionary Tale**. (There's a `CAREER_TITLE_LABEL` table for
  display text.)

---

## Part 3 — describing your best playoff finish

```ts
export function describeBestPlayoffFinish(
  maxRoundReached: number | null,
  wonFinals: boolean,
): string {
  if (maxRoundReached === null) return "Missed the Playoffs";
  if (maxRoundReached === 4) return wonFinals ? "NBA Champion" : "NBA Finals";
  if (maxRoundReached === 3) return "Conference Finals";
  if (maxRoundReached === 2) return "Conference Semifinals";
  return "First Round";
}
```

- Takes the furthest playoff round the tenure ever reached (`maxRoundReached`, or `null` if it never made
  the playoffs) and whether it won the Finals, and returns a text label for display on the career page.
- `maxRoundReached === null` → "Missed the Playoffs." Round 4 (the Finals) → "NBA Champion" if won,
  otherwise "NBA Finals." Round 3 → "Conference Finals," round 2 → "Conference Semifinals," and anything
  else (round 1) → "First Round."

---

## Zooming out

This file is what makes the sim a _career_ rather than a series of disconnected save files. When a tenure
ends, it scores your body of work — championships and winning records lift your reputation, a firing dents
it — and that reputation (stored on your account, not any one team) determines which jobs you can get next.
The honest design note in the code: it only scores what's actually tracked (titles, playoff appearances,
record, how it ended), not fuzzy things like "great trades" — because scoring those would need data the
game doesn't collect, and it's better to be honest than to fake it.

**Next file:** `gm/jobMarket.md` — how your reputation gates which teams will hire you for your _next_
franchise.
