# `gm/gmPersonality.ts` — the seven front-office "personalities"

**What this whole file is about:** two computer teams shouldn't react to the _same_ trade offer in the
same way — a "win-now" team and a "prospect lover" want different things. This file defines seven
front-office **personalities** and the number "dials" that go with each. Those dials are what the trade
AI (from `trade/evaluateTradeOffer.md`) multiplies values by to color a team's judgment.

Open the real file: `src/lib/gm/gmPersonality.ts`. It's mostly data (lists and tables) plus one tiny
function.

---

## Part 1 — the list of personalities

```ts
export type GmPersonality =
  | "AGGRESSIVE"
  | "CONSERVATIVE"
  | "WIN_NOW"
  | "PROSPECT_LOVER"
  | "PICK_HOARDER"
  | "SALARY_CONSCIOUS"
  | "BALANCED";
```

- A string-literal union (we've seen these): a `GmPersonality` is exactly one of these seven words. Each
  is a distinct "philosophy": aggressive (bold), conservative (cautious), win-now (wants veterans),
  prospect-lover (wants youth), pick-hoarder (loves draft picks), salary-conscious (hates bad contracts),
  and balanced (no strong bias).

There are also two lookup tables, `GM_PERSONALITY_LABEL` and `GM_PERSONALITY_DESCRIPTION` (not shown),
mapping each code to its display name ("Win-Now") and a sentence describing it — the same "internal code
vs. display text" pattern from earlier files.

---

## Part 2 — the dials

```ts
export interface GmPersonalityWeights {
  pickValueMultiplier: number;
  youthValueMultiplier: number;
  veteranValueMultiplier: number;
  badContractSensitivityMultiplier: number;
  acceptanceThresholdMultiplier: number;
}
```

- `GmPersonalityWeights` — the shape of one personality's five dials. Each is a multiplier applied
  somewhere in the trade AI:
  - `pickValueMultiplier` — how much this team values draft picks.
  - `youthValueMultiplier` — how much it values young incoming players.
  - `veteranValueMultiplier` — how much it values veteran incoming players.
  - `badContractSensitivityMultiplier` — how much a bad incoming contract bothers it.
  - `acceptanceThresholdMultiplier` — how picky it is overall (above 1 = demands a better deal).

```ts
export const GM_PERSONALITY_WEIGHTS: Record<GmPersonality, GmPersonalityWeights> = {
  BALANCED: {
    pickValueMultiplier: 1.0,
    youthValueMultiplier: 1.0,
    veteranValueMultiplier: 1.0,
    badContractSensitivityMultiplier: 1.0,
    acceptanceThresholdMultiplier: 1.0,
  },
  WIN_NOW: {
    pickValueMultiplier: 0.75,
    youthValueMultiplier: 0.75,
    veteranValueMultiplier: 1.3,
    badContractSensitivityMultiplier: 0.9,
    acceptanceThresholdMultiplier: 0.95,
  },
  PROSPECT_LOVER: {
    pickValueMultiplier: 1.15,
    youthValueMultiplier: 1.3,
    veteranValueMultiplier: 0.8,
    badContractSensitivityMultiplier: 1.0,
    acceptanceThresholdMultiplier: 1.0,
  },
  // ...AGGRESSIVE, CONSERVATIVE, PICK_HOARDER, SALARY_CONSCIOUS...
};
```

- `GM_PERSONALITY_WEIGHTS` — a lookup table (`Record`) mapping each personality to its five dials. This
  is the heart of the file: pure data.
- Read the examples to see the personalities come alive:
  - **`BALANCED`** — all dials are `1.0` (no change). It judges trades at objective value.
  - **`WIN_NOW`** — values picks and youth _less_ (`0.75`) and veterans _much more_ (`1.3`): it wants
    proven help now, not future assets.
  - **`PROSPECT_LOVER`** — the mirror image: youth `1.3`, veterans `0.8`. It bets on upside.
- **Notice all the numbers sit between roughly 0.7 and 1.3.** That's deliberate — personality _nudges_ a
  team's preferences, but the nudges are gentle enough that no personality can be talked into an
  obviously lopsided trade (there's a test that checks exactly this).

---

## Part 3 — the list and the random picker

```ts
export const ALL_GM_PERSONALITIES: GmPersonality[] = [
  "AGGRESSIVE",
  "CONSERVATIVE",
  "WIN_NOW",
  "PROSPECT_LOVER",
  "PICK_HOARDER",
  "SALARY_CONSCIOUS",
  "BALANCED",
];

export function pickRandomGmPersonality(rng: () => number = Math.random): GmPersonality {
  return ALL_GM_PERSONALITIES[Math.floor(rng() * ALL_GM_PERSONALITIES.length)];
}
```

- `ALL_GM_PERSONALITIES` — a plain list of all seven, for when the code needs to loop over or randomly
  choose one.
- `pickRandomGmPersonality(rng)` — picks a random personality (the same "random index into a list" trick
  from earlier: `Math.floor(rng() * length)` gives a random position). Every team gets one of these at
  the start of a save and keeps it — real GMs don't flip their whole philosophy year to year. Note
  `BALANCED` isn't a fallback default; it's an equally valid personality that's just as likely to be
  chosen as any other.

---

## Zooming out

This file is almost entirely _data_ — a table of dials — with one tiny function to pick a personality at
random. But that data is what gives the league character: hand the identical trade to a `WIN_NOW` team
and a `PROSPECT_LOVER`, and they genuinely reach different answers, because the trade AI runs the same
value math with their different dials. It's a clean way to create varied, believable behavior without
writing separate logic for each personality — you just change the numbers.

**Next file:** `gm/teamIdentity.md` — classifying a team as a contender, rebuilder, etc., which the AI
also factors in.
