# `gm/teamIdentity.ts` — is this team a contender, a rebuilder, or what?

**What this whole file is about:** a lot of the AI's behavior depends on _what kind of team_ it is — a
contender chases wins now, a rebuilder collects youth and picks. This small file labels a team as one of
five identities, based on how good it is relative to the league and how old its roster is.

Open the real file: `src/lib/gm/teamIdentity.ts`. It's a short threshold function, like `apron.md`.

---

## Part 1 — the five identities

```ts
export type TeamIdentity = "CONTENDER" | "PLAYOFF_TEAM" | "PLAY_IN_TEAM" | "REBUILDING" | "TANKING";
```

A string-literal union: a team is exactly one of these five. From best to worst: a championship
`CONTENDER`, a solid `PLAYOFF_TEAM`, a bubble `PLAY_IN_TEAM`, a young-and-building `REBUILDING` team, or a
`TANKING` team (bad and not young — effectively playing for next year's draft). There are the usual
`_LABEL` and `_DESCRIPTION` lookup tables (not shown) for display text.

---

## Part 2 — the settings

```ts
const CONTENDER_PERCENTILE = 0.8;
const PLAYOFF_PERCENTILE = 0.6;
const PLAY_IN_PERCENTILE = 0.33;

const YOUNG_ROSTER_AGE_THRESHOLD = 26;
```

- The three `_PERCENTILE` numbers are cutoffs on a **0-to-1 "how good is this team vs. the league" scale**
  (0 = league's worst, 1 = league's best). Roughly: the top ~20% are contenders/playoff teams, the next
  ~13% are play-in teams, and the bottom ~33% are rebuilding or tanking.
- `YOUNG_ROSTER_AGE_THRESHOLD = 26` — the average age below which a _bad_ team counts as "young and
  building" rather than just "bad."

---

## Part 3 — the machine

```ts
export function computeTeamIdentity(
  competitivenessPercentile: number,
  avgRosterAge: number,
): TeamIdentity {
  if (competitivenessPercentile >= CONTENDER_PERCENTILE) return "CONTENDER";
  if (competitivenessPercentile >= PLAYOFF_PERCENTILE) return "PLAYOFF_TEAM";
  if (competitivenessPercentile >= PLAY_IN_PERCENTILE) return "PLAY_IN_TEAM";
  return avgRosterAge <= YOUNG_ROSTER_AGE_THRESHOLD ? "REBUILDING" : "TANKING";
}
```

- It takes two inputs: the team's `competitivenessPercentile` (0–1) and its `avgRosterAge`.
- The first three lines are a highest-first threshold chain (like `getApronLevel`): if the team is in the
  top 80% cutoff it's a `CONTENDER`; else top 60% a `PLAYOFF_TEAM`; else top 33% a `PLAY_IN_TEAM`. The
  first cutoff it clears wins, and it returns immediately.
- The last line handles the bottom third with a **ternary on age**: a bad team that's **young** (average
  age ≤ 26) is `REBUILDING` (building toward the future); a bad team that's **old** is `TANKING` (not
  young, not winning — playing for the draft). This distinction matters: a bad-but-young team is going
  somewhere, so the AI treats it differently than a bad-and-old one.
- One nice design note: `competitivenessPercentile` is left as a plain input rather than computed here.
  That lets the caller decide _how_ to measure "how good is this team" — by actual win percentage once
  enough games are played, or by roster strength early in the season before records mean much. This file
  just buckets the number.

---

## Zooming out

Tiny file, big influence. This one label feeds the trade AI (a rebuilder over-values youth, a contender
over-values veterans — from `trade/evaluateTradeOffer.md`), the draft AI (same idea for prospects), and
the CPU trade-seeking logic. Deriving a clean "who is this team?" label from two numbers, once, keeps all
those systems consistent.

**Next file:** `gm/teamNeeds.md` — figuring out the specific holes on a team's roster.
