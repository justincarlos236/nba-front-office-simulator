# `trade/evaluateTradeOffer.ts` — how the computer decides if it _wants_ a trade

**What this whole file is about:** legality (the last file) is only half of a trade. Even a legal
trade only happens if the _other_ team agrees to it. This file is the computer opponent's brain: it
looks at a proposed swap from **its own** point of view and decides **ACCEPT**, **REJECT**, or
**COUNTER**. It's the biggest file we've done, so we'll go stage by stage.

Open the real file: `src/lib/trade/evaluateTradeOffer.ts`. The core idea: add up the value of what
the team would _receive_, add up the value of what it would _give away_, and compare the two —
adjusting for the team's personality, situation, and needs.

---

## Part 1 — the imports

```ts
import { computePlayerTradeValue } from "../gm/playerTradeValue";
import { computeDraftPickTradeValue } from "../gm/draftPickTradeValue";
import { GM_PERSONALITY_WEIGHTS, type GmPersonality } from "../gm/gmPersonality";
import type { TeamIdentity } from "../gm/teamIdentity";
import { type TeamNeed } from "../gm/teamNeeds";
import { getPlayerValueTier } from "../valuation/playerValueTier";
```

These borrow the pieces this brain is built from (all from neighboring folders, `../`):

- `computePlayerTradeValue` / `computeDraftPickTradeValue` — machines that give a **base value in
  cents** for a player or a pick (covered in their own docs later). This file _adjusts_ those base
  values.
- `GM_PERSONALITY_WEIGHTS` and `GmPersonality` — a team's front-office personality and the number
  "dials" that go with it (e.g. a "win-now" team values veterans more).
- `TeamIdentity` — is this team a contender, rebuilder, etc.
- `TeamNeed` — the roster holes a team has (needs a point guard, a rim protector, etc.).
- `getPlayerValueTier` — turns a rating into a label (SUPERSTAR, STAR, …).

---

## Part 2 — describing the assets and the answer

```ts
export interface TradePlayerAsset {
  type: "PLAYER";
  overallRating: number;
  potentialRating: number;
  age: number;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  currentSalaryCents: bigint;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
}

export interface TradePickAsset {
  type: "DRAFT_PICK";
  pickSeason: number;
  round: 1 | 2;
  overallPickNumber: number | null;
  originalTeamCompetitivenessPercentile: number;
}

export type TradeAssetForEvaluation = TradePlayerAsset | TradePickAsset;

export type TradeOfferDecision = "ACCEPT" | "REJECT" | "COUNTER";
export type TradeOfferReasonCode =
  "UNTOUCHABLE_PLAYER" | "BELOW_FAIR_VALUE" | "FILLS_A_NEED" | "FAIR_VALUE";
```

- `TradePlayerAsset` and `TradePickAsset` describe the two kinds of thing being evaluated, each with
  the details this brain needs (a player's rating, age, salary, injury history; a pick's season and
  projected slot).
- `TradeAssetForEvaluation` is "one or the other" (the `|` union again).
- `TradeOfferDecision` is the answer type: the three possible verdicts. `TradeOfferReasonCode` is a
  set of short reason tags (e.g. `"UNTOUCHABLE_PLAYER"`) so the app can explain the decision.

```ts
export interface EvaluateTradeOfferInput {
  respondingTeam: {
    identity: TeamIdentity;
    needs: TeamNeed[];
    personality: GmPersonality;
    roster: { overallRating: number; age: number }[];
  };
  currentSeason: number;
  incoming: TradeAssetForEvaluation[];
  outgoing: TradeAssetForEvaluation[];
}

export interface EvaluateTradeOfferResult {
  decision: TradeOfferDecision;
  score: number;
  reasons: TradeOfferReasonCode[];
}
```

- The **input**: the team doing the deciding (`respondingTeam`, with its identity, needs, personality,
  and roster), the season, and two lists — `incoming` (what it would receive) and `outgoing` (what it
  would give up).
- The **output**: the `decision`, a `score` (the value ratio — above 1 means the team comes out
  ahead), and a list of `reasons`.

---

## Part 3 — the tuning dials

```ts
const ACCEPT_THRESHOLD = 0.95;
const COUNTER_THRESHOLD = 0.75;

export const YOUNG_AGE_THRESHOLD = 25;
export const VETERAN_AGE_THRESHOLD = 30;
export const CONTENDER_VETERAN_BONUS = 1.15;
export const REBUILDING_YOUTH_PICK_BONUS = 1.15;
export const NEED_FIT_BONUS_MULTIPLIER = 1.25;

const UNTOUCHABLE_COUNT = 2;
const UNTOUCHABLE_IDENTITIES: TeamIdentity[] = ["CONTENDER", "PLAYOFF_TEAM"];
const UNTOUCHABLE_OVERPAY_MULTIPLIER = 1.75;

const STARTER_THRESHOLD = 72;
const ROTATION_THRESHOLD = 65;
```

These fixed numbers are the "settings" that shape the brain's behavior:

- `ACCEPT_THRESHOLD = 0.95` / `COUNTER_THRESHOLD = 0.75` — the value ratios that decide the verdict.
  If the team gets at least 95% of fair value it accepts; 75–95% it counters; below 75% it rejects.
  (It'll accept slightly _below_ perfectly fair because a real GM will make a _close_ deal.)
- `YOUNG_AGE_THRESHOLD = 25` / `VETERAN_AGE_THRESHOLD = 30` — the ages that count as "young" and
  "veteran."
- The three `*_BONUS`/`*_MULTIPLIER` values (`1.15`, `1.15`, `1.25`) are little value boosts: a
  contender values incoming veterans a bit more, a rebuilder values incoming youth/picks a bit more,
  and any team values a player who fills a real need more.
- The `UNTOUCHABLE_*` settings define the "you can't have my best players cheaply" gate: a contender's
  top 2 players are off-limits unless you overpay by 1.75×.
- `STARTER_THRESHOLD = 72` / `ROTATION_THRESHOLD = 65` — rating cutoffs used to judge whether a player
  actually fills a need.

---

## Part 4 — three small helper machines

```ts
function scaleCents(cents: bigint, multiplier: number): bigint {
  return BigInt(Math.round(Number(cents) * multiplier));
}
```

The same "multiply `bigint` money by a decimal safely" helper we've seen: to number, multiply,
round, back to `bigint`. Used to apply all those `1.15`-style bonuses to a value.

```ts
function isUntouchable(
  player: { overallRating: number; age: number },
  rosterRatingsDesc: number[],
  identity: TeamIdentity,
): boolean {
  if (getPlayerValueTier(player.overallRating) === "SUPERSTAR") return true;

  if (!UNTOUCHABLE_IDENTITIES.includes(identity)) return false;
  const topThreshold = rosterRatingsDesc[Math.min(UNTOUCHABLE_COUNT, rosterRatingsDesc.length) - 1];
  return topThreshold !== undefined && player.overallRating >= topThreshold;
}
```

Decides whether a player is "untouchable" (a team won't trade them without a huge overpay):

- `if (getPlayerValueTier(player.overallRating) === "SUPERSTAR") return true;` — a genuine superstar
  is _always_ untouchable, no matter what.
- `if (!UNTOUCHABLE_IDENTITIES.includes(identity)) return false;` — the softer rule (below) only
  applies to contenders and playoff teams. `.includes(...)` checks if a list contains a value; `!`
  flips it, so this reads "if this team's identity is **not** in the untouchable list, it has no
  untouchable non-superstars — return false."
- `rosterRatingsDesc` is the team's player ratings sorted highest-first. `rosterRatingsDesc[Math.min(2,
length) - 1]` grabs the rating of the team's **2nd-best** player (position index 1). `Math.min`
  guards against a tiny roster. So `topThreshold` is "the rating of my 2nd-best guy."
- `return topThreshold !== undefined && player.overallRating >= topThreshold;` — true if this player
  is at least as good as the team's 2nd-best player, i.e. one of its **top two**. So a contender
  protects its top two players.

```ts
export function playerFillsNeed(player: TradePlayerAsset, need: TeamNeed): boolean {
  switch (need) {
    case "STAR_SCORER": {
      const tier = getPlayerValueTier(player.overallRating);
      return tier === "SUPERSTAR" || tier === "STAR";
    }
    case "POINT_GUARD":
      return player.position === "PG" && player.overallRating >= STARTER_THRESHOLD;
    case "RIM_PROTECTOR":
      return player.position === "C" && player.overallRating >= STARTER_THRESHOLD;
    case "WING_DEFENDER":
      return (
        (player.position === "SF" || player.position === "SG") &&
        player.overallRating >= STARTER_THRESHOLD
      );
    case "BENCH_DEPTH":
      return player.overallRating >= ROTATION_THRESHOLD;
  }
}
```

Given a player and a specific team need, does this player _fill_ it? It's a `switch` on the need:

- A `STAR_SCORER` need is filled by any STAR-or-better player.
- A `POINT_GUARD` need is filled by a PG rated at least 72 (starter-caliber). Similar for a
  `RIM_PROTECTOR` (a center) and a `WING_DEFENDER` (an SF or SG).
- `BENCH_DEPTH` is filled by anyone rated at least 65 (rotation-caliber).

This is exported (note `export`) because other files — like the draft AI — reuse this exact "does
this player fill this need?" check.

---

## Part 5 — turning assets into base values

```ts
function objectivePlayerValue(asset: TradePlayerAsset, currentSeason: number): bigint {
  return computePlayerTradeValue({
    season: currentSeason,
    overallRating: asset.overallRating,
    potentialRating: asset.potentialRating,
    age: asset.age,
    currentSalaryCents: asset.currentSalaryCents,
    injuryStatus: asset.injuryStatus,
    careerGamesMissedToInjury: asset.careerGamesMissedToInjury,
  });
}

function objectivePickValue(asset: TradePickAsset, currentSeason: number): bigint {
  return computeDraftPickTradeValue({
    currentSeason,
    pickSeason: asset.pickSeason,
    round: asset.round,
    overallPickNumber: asset.overallPickNumber,
    originalTeamCompetitivenessPercentile: asset.originalTeamCompetitivenessPercentile,
  });
}
```

Two thin wrappers: hand a player (or pick) to the imported value machine and get back its **objective
base value in cents** — the value _before_ any team-specific opinion. These base machines get their
own docs later; for now, just "asset in, dollar value out."

---

## Part 6 — the main brain, stage by stage

```ts
export function evaluateTradeOffer(input: EvaluateTradeOfferInput): EvaluateTradeOfferResult {
  const { identity, needs, personality, roster } = input.respondingTeam;
  const weights = GM_PERSONALITY_WEIGHTS[personality];
  const isWinNowIdentity = identity === "CONTENDER" || identity === "PLAYOFF_TEAM";
  const isRebuildingIdentity = identity === "REBUILDING" || identity === "TANKING";
  const rosterRatingsDesc = [...roster.map((p) => p.overallRating)].sort((a, b) => b - a);

  const reasons = new Set<TradeOfferReasonCode>();
```

- `const { identity, needs, personality, roster } = input.respondingTeam;` — this is
  **"destructuring."** It's a shortcut that pulls those four fields out of `respondingTeam` into their
  own named boxes in one line (instead of writing `input.respondingTeam.identity`, etc., every time).
- `weights = GM_PERSONALITY_WEIGHTS[personality]` — look up this team's personality dials.
- Two simple true/false flags for whether the team is in "win now" mode or "rebuild" mode.
- `rosterRatingsDesc` — take the roster, `.map` it down to just the ratings, copy-and-`.sort` them
  **highest first** (`(a, b) => b - a` sorts descending). This is the sorted list `isUntouchable`
  needs.
- `reasons` — a `Set` to collect reason tags as we go.

### Stage 1 — value what the team would RECEIVE (with opinions applied)

```ts
let totalIncomingCents = 0n;
for (const asset of input.incoming) {
  if (asset.type === "PLAYER") {
    let value = objectivePlayerValue(asset, input.currentSeason);
    if (asset.age <= YOUNG_AGE_THRESHOLD) {
      value = scaleCents(value, weights.youthValueMultiplier);
      if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
    }
    if (asset.age >= VETERAN_AGE_THRESHOLD) {
      value = scaleCents(value, weights.veteranValueMultiplier);
      if (isWinNowIdentity) value = scaleCents(value, CONTENDER_VETERAN_BONUS);
    }
    if (needs.some((need) => playerFillsNeed(asset, need))) {
      value = scaleCents(value, NEED_FIT_BONUS_MULTIPLIER);
      reasons.add("FILLS_A_NEED");
    }
    totalIncomingCents += value;
  } else {
    let value = objectivePickValue(asset, input.currentSeason);
    value = scaleCents(value, weights.pickValueMultiplier);
    if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
    totalIncomingCents += value;
  }
}
```

This is the heart of the personality system. Start a running total at `0n`, then loop over each
incoming asset:

- If it's a **player**, start from its objective value, then adjust based on _this team's_ view:
  - If the player is **young** (≤25), multiply by the team's youth dial; if the team is also
    rebuilding, add the extra youth bonus.
  - If the player is a **veteran** (≥30), multiply by the veteran dial; if the team is win-now, add
    the veteran bonus.
  - `if (needs.some((need) => playerFillsNeed(asset, need)))` — `.some(...)` returns true if **any**
    item in a list passes a test. So this reads "if this player fills **any** of our needs." If so,
    boost the value and record a `"FILLS_A_NEED"` reason.
  - Add the adjusted value to the running total.
- If it's a **pick**, start from its objective value, multiply by the team's "how much do we love
  picks?" dial, and add a bonus if rebuilding. (`else` here means "the asset wasn't a player, so it's
  a pick.")

The result, `totalIncomingCents`, is **how much this team subjectively values what it's getting.**

### Stage 2 — the untouchable gate (a hard stop)

```ts
for (const asset of input.outgoing) {
  if (asset.type !== "PLAYER") continue;
  if (!isUntouchable(asset, rosterRatingsDesc, identity)) continue;

  const requiredOverpayCents = scaleCents(
    objectivePlayerValue(asset, input.currentSeason),
    UNTOUCHABLE_OVERPAY_MULTIPLIER,
  );
  if (totalIncomingCents < requiredOverpayCents) {
    return { decision: "REJECT", score: 0, reasons: ["UNTOUCHABLE_PLAYER"] };
  }
}
```

Before doing the final math, check whether the deal asks the team to give up an **untouchable**
player:

- Loop over the outgoing assets; skip anything that isn't a player (`continue`), and skip players who
  aren't untouchable.
- For an untouchable player, compute the **overpay required** to even consider it: 1.75× their
  objective value.
- `if (totalIncomingCents < requiredOverpayCents)` — if the incoming value doesn't clear that bar,
  **immediately** `return` a REJECT with the reason `"UNTOUCHABLE_PLAYER"`. This is a _hard gate_: no
  personality or situation can talk a team into giving up its franchise player cheaply. Only a
  genuine, massive overpay gets past it.

### Stage 3 — value what the team would GIVE UP

```ts
let totalOutgoingCents = 0n;
for (const asset of input.outgoing) {
  if (asset.type === "PLAYER") {
    totalOutgoingCents += objectivePlayerValue(asset, input.currentSeason);
  } else {
    totalOutgoingCents += scaleCents(
      objectivePickValue(asset, input.currentSeason),
      weights.pickValueMultiplier,
    );
  }
}
```

Add up the value of everything the team gives away. Players use plain objective value here. A pick
uses the personality dial too — a "pick hoarder" personality feels the _loss_ of a pick more, so
giving one up "costs" it more.

### Stage 4 — compare, and decide

```ts
  const score =
    totalOutgoingCents > 0n
      ? Number(totalIncomingCents) / Number(totalOutgoingCents)
      : totalIncomingCents > 0n
        ? Number.POSITIVE_INFINITY
        : 1;

  const effectiveAcceptThreshold = ACCEPT_THRESHOLD * weights.acceptanceThresholdMultiplier;
  const effectiveCounterThreshold = COUNTER_THRESHOLD * weights.acceptanceThresholdMultiplier;

  let decision: TradeOfferDecision;
  if (score >= effectiveAcceptThreshold) {
    decision = "ACCEPT";
    reasons.add("FAIR_VALUE");
  } else if (score >= effectiveCounterThreshold) {
    decision = "COUNTER";
  } else {
    decision = "REJECT";
    reasons.add("BELOW_FAIR_VALUE");
  }

  return { decision, score, reasons: [...reasons] };
}
```

- `score` is the key number: **incoming value ÷ outgoing value.** Above 1 = the team comes out ahead;
  below 1 = it's giving up more than it gets. The nested ternary handles edge cases: if the team gives
  up nothing but receives something, the score is "infinity" (a free gift); if it's getting and
  giving nothing, the score is a neutral `1`. (We divide with `Number(...)` because ratios need
  decimals.)
- The two thresholds are nudged by the personality's `acceptanceThresholdMultiplier` — a picky
  ("conservative") team demands better than fair; an aggressive one accepts slightly worse.
- Then the verdict: `score >= acceptThreshold` → **ACCEPT**; else `score >= counterThreshold` →
  **COUNTER**; else **REJECT** — each recording a reason.
- `return { decision, score, reasons: [...reasons] };` — hand back the verdict, the score, and the
  reasons (turning the `Set` back into a list with `[...reasons]`).

---

## Zooming out

The whole thing is one clean idea: **value what you get, value what you give, compare the two — but
color everything with _who this team is_.** A rebuilder and a contender, handed the _identical_ offer,
genuinely reach different answers, because they run the same math with different dials. And two
guardrails keep it sensible: the untouchable gate (no giving away your stars cheaply) and the fact
that all the personality dials are gentle (0.7–1.3 range) — so no personality can be tricked into an
obviously lopsided trade. It's the same "evaluate from your own perspective and pick the best" idea
you'll see again in how the computer drafts.

That's the whole `trade/` folder done. **Next up:** the `valuation/` folder — starting with the rating
formula (`valuation/playerValue.md`) that turns a player's stats into a 60–99 number, which almost
everything else builds on.
