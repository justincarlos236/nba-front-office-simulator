# `trade/validateTrade.ts` — the referee that decides if a trade is legal

**What this whole file is about:** a player proposes a trade — some players and picks moving
between teams. This file is the referee. It checks the deal against all the rules (salary matching,
no-trade clauses, the aprons, the draft-pick "Stepien" rule) and hands back either "yes, this is
legal" or "no, and here's exactly what's wrong." It's a bigger file, so we'll take it in stages.

Open the real file: `src/lib/trade/validateTrade.ts`. New ideas we'll meet: a "list of possible
shapes" type, a `Set`, and looping over teams.

---

## Part 1 — describing what a trade looks like

```ts
export type TradeAssetInput =
  | {
      type: "PLAYER";
      fromTeamId: string;
      toTeamId: string;
      playerId: string;
      salaryCents: bigint;
      noTradeClause?: boolean;
    }
  | {
      type: "DRAFT_PICK";
      fromTeamId: string;
      toTeamId: string;
      pickId: string;
      season: number;
      round: 1 | 2;
    }
  | { type: "CASH"; fromTeamId: string; toTeamId: string; amountCents: bigint };
```

A trade is made of **assets** — the things being swapped. But the three kinds of asset (a player, a
draft pick, or cash) have _different_ details, so this describes all three at once:

- The `|` between the three `{ ... }` blocks means **"or"** — a `TradeAssetInput` is one of these
  three shapes. This is called a **"tagged union"**: each shape has a `type` field (`"PLAYER"`,
  `"DRAFT_PICK"`, or `"CASH"`) that _tags_ which kind it is.
- Every kind shares `fromTeamId` and `toTeamId` (who's sending it, who's receiving it).
- A **`PLAYER`** also has a `playerId`, a `salaryCents` (needed for the matching math), and an
  optional `noTradeClause?` (the `?` = might be missing).
- A **`DRAFT_PICK`** has a `pickId`, a `season`, and a `round: 1 | 2` (the round is literally the
  number `1` or `2` — nothing else allowed).
- **`CASH`** just has an `amountCents`.

Why tag them? Because later, when the code loops over the assets, it can check `asset.type` and know
exactly which details are safe to read. (You wouldn't read `salaryCents` off a cash asset.)

---

## Part 2 — the other input shapes and the "violation" shape

```ts
export interface TradeTeamCapState {
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
  ownedFutureFirstRoundPickSeasons: number[];
}

export interface TradeValidationInput {
  season: number;
  assets: TradeAssetInput[];
  teamCapStates: Record<string, TradeTeamCapState>;
}
```

- `TradeTeamCapState` — the facts the referee needs about **one** team: its spending tier, its cap
  space, and a list of the future seasons it still owns its own first-round pick for (a
  `number[]` = a list of numbers). That last one is for the Stepien check at the end.
- `TradeValidationInput` — the full input: the `season`, the list of `assets`, and `teamCapStates` —
  a lookup table (`Record`) from a team's id (`string`) to its `TradeTeamCapState`. So "look up any
  team's cap situation by its id."

```ts
export interface TradeViolation {
  rule:
    | "SALARY_MATCHING"
    | "NO_AGGREGATION_AT_SECOND_APRON"
    | "NO_TRADE_CLAUSE"
    | "STEPIEN_RULE"
    | "MISSING_TEAM_CAP_STATE"
    | "INVALID_STRUCTURE";
  teamId?: string;
  message: string;
}

export interface TradeValidationResult {
  isValid: boolean;
  violations: TradeViolation[];
}
```

- `TradeViolation` — describes **one thing that's wrong** with a trade: a `rule` (one of six named
  problems — again a string-literal union), optionally which `teamId` it applies to, and a
  human-readable `message`. Returning a _named rule_ (not just "invalid") means the app can tell the
  user _exactly_ why a trade failed.
- `TradeValidationResult` — the final answer: `isValid` (true/false) and a list of `violations`
  (empty if the trade is legal).

---

## Part 3 — a small helper: who's involved?

```ts
function teamIdsInTrade(assets: TradeAssetInput[]): string[] {
  const ids = new Set<string>();
  for (const asset of assets) {
    ids.add(asset.fromTeamId);
    ids.add(asset.toTeamId);
  }
  return [...ids];
}
```

This figures out the list of teams taking part in a trade.

- `const ids = new Set<string>();` — a **`Set`** is like a list, but it automatically **ignores
  duplicates** — each value appears at most once. Perfect here, because the same team shows up on
  many assets, and we only want each team listed once.
- The `for (const asset of assets)` loop goes through every asset and `.add()`s both the sending and
  receiving team's id to the set. Duplicates are silently dropped.
- `return [...ids];` — the `[...ids]` spread turns the set back into a normal list to hand back.

So `teamIdsInTrade` gives you the unique teams in the deal.

---

## Part 4 — the referee itself, stage by stage

```ts
export function validateTrade(input: TradeValidationInput): TradeValidationResult {
  const violations: TradeViolation[] = [];
  const rules = getSeasonCapRules(input.season);
  const teamIds = teamIdsInTrade(input.assets);
```

- It starts an empty `violations` list. The whole strategy is: **check every rule, and push any
  problems into this list.** At the very end, if the list is empty, the trade is legal.
- Look up the season's dollar rules, and get the list of involved teams.

### Stage 1 — is the trade even structured sensibly?

```ts
if (teamIds.length < 2) {
  violations.push({
    rule: "INVALID_STRUCTURE",
    message: "A trade must involve at least two teams.",
  });
  return { isValid: false, violations };
}

for (const teamId of teamIds) {
  if (!input.teamCapStates[teamId]) {
    violations.push({
      rule: "MISSING_TEAM_CAP_STATE",
      teamId,
      message: `No cap state provided for team ${teamId}.`,
    });
  }
}
if (violations.length > 0) return { isValid: false, violations };
```

- `if (teamIds.length < 2)` — a trade needs at least two teams. If not, `.push(...)` records the
  problem (`.push` adds an item to the end of a list) and we return immediately — no point checking
  further.
- Then it loops over each team and checks we were actually _given_ that team's cap info:
  `if (!input.teamCapStates[teamId])` reads "if there is **no** (`!`) cap state for this team." Any
  missing one gets recorded.
- `if (violations.length > 0) return ...` — if any of those basic problems came up, stop here and
  report them. (The later stages assume every team's cap state exists, so we must bail first.)

### Stage 2 — no-trade clauses

```ts
for (const asset of input.assets) {
  if (asset.type === "PLAYER" && asset.noTradeClause) {
    violations.push({
      rule: "NO_TRADE_CLAUSE",
      teamId: asset.fromTeamId,
      message: `Player ${asset.playerId} has a no-trade clause and has not consented to this deal.`,
    });
  }
}
```

- Loop over every asset. `if (asset.type === "PLAYER" && asset.noTradeClause)` — `&&` means **"and"**:
  the asset must be a player **and** have a no-trade clause. (Checking `asset.type === "PLAYER"`
  first is also what makes it _safe_ to read `asset.noTradeClause` — remember only players have that
  field.) If both are true, that's a violation.

### Stage 3 — salary matching (the core money check), per team

```ts
  for (const teamId of teamIds) {
    const capState = input.teamCapStates[teamId];
    const outgoingPlayers = input.assets.filter(
      (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> => a.type === "PLAYER" && a.fromTeamId === teamId,
    );
    const incomingPlayers = input.assets.filter(
      (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> => a.type === "PLAYER" && a.toTeamId === teamId,
    );

    const outgoingSalaryCents = outgoingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);
    const incomingSalaryCents = incomingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);

    if (incomingSalaryCents === 0n) continue;
```

- For each team, grab its cap state, then find the **players it's sending out** and the **players
  it's receiving.**
- `.filter(...)` keeps only matching items. `(a) => a.type === "PLAYER" && a.fromTeamId === teamId`
  reads: "keep assets that are players _and_ are being sent _from_ this team." The scary-looking
  `(a): a is Extract<TradeAssetInput, { type: "PLAYER" }>` part is a promise to the type-checker:
  "everything that survives this filter is definitely a PLAYER asset" — which then lets the code
  safely read `.salaryCents` below. (You can mentally skip that annotation; it changes nothing about
  what the code _does_, it just keeps the type-checker happy.)
- `.reduce(...)` (the running-total trick again) adds up the outgoing and incoming salaries.
- `if (incomingSalaryCents === 0n) continue;` — **`continue`** means "skip the rest of this loop
  turn and move to the next team." If a team isn't receiving any salary, there's nothing to match, so
  we move on.

```ts
if (isUnderCapSpace(capState.apronLevel)) {
  const availableRoomCents = capState.capSpaceCents + outgoingSalaryCents;
  if (incomingSalaryCents > availableRoomCents) {
    violations.push({ rule: "SALARY_MATCHING", teamId, message: `...` });
  }
  continue;
}
```

- If this team has cap **space** (checked with the helper from the last file), it doesn't need the
  matching formula — it can just absorb salary into its room. The room available is its cap space
  **plus** whatever salary it's sending out. If the incoming salary is bigger than that, it doesn't
  fit → a `SALARY_MATCHING` violation. Either way, `continue` to the next team (cap-space teams skip
  the formula below).

```ts
    if (
      capState.apronLevel === ApronLevel.SECOND_APRON &&
      outgoingPlayers.length > 1 &&
      incomingPlayers.length < outgoingPlayers.length &&
      !canAggregateSalaries(capState.apronLevel)
    ) {
      violations.push({ rule: "NO_AGGREGATION_AT_SECOND_APRON", teamId, message: "Second-apron teams cannot aggregate multiple outgoing salaries in a trade." });
    }

    const maxIncoming = maxIncomingSalaryCents(outgoingSalaryCents, capState.apronLevel, rules);
    if (incomingSalaryCents > maxIncoming) {
      violations.push({ rule: "SALARY_MATCHING", teamId, message: `...` });
    }
  }
```

- The first `if` catches the "no aggregation" rule: a second-apron team can't combine several
  outgoing players into fewer incoming ones. All four conditions joined by `&&` must be true (it's
  a second-apron team, it's sending more than one player, receiving fewer than it sends, and can't
  aggregate). If so → a violation.
- Then the real matching check: call `maxIncomingSalaryCents` (the whole previous file!) to get the
  most this team may take back, and if the incoming salary is bigger than that max →
  `SALARY_MATCHING` violation.

### Stage 4 — the Stepien rule (can't be pick-less two years running)

```ts
  for (const teamId of teamIds) {
    const capState = input.teamCapStates[teamId];
    const seasonsLosingPick = new Set(
      input.assets
        .filter((a): a is Extract<TradeAssetInput, { type: "DRAFT_PICK" }> => a.type === "DRAFT_PICK" && a.fromTeamId === teamId && a.round === 1)
        .map((a) => a.season),
    );
    if (seasonsLosingPick.size === 0) continue;

    const remainingOwnedSeasons = new Set(
      capState.ownedFutureFirstRoundPickSeasons.filter((s) => !seasonsLosingPick.has(s)),
    );
    for (const season of seasonsLosingPick) {
      const hasNextYear = remainingOwnedSeasons.has(season + 1);
      const hasPriorYear = remainingOwnedSeasons.has(season - 1);
      if (!hasNextYear && !hasPriorYear) {
        violations.push({ rule: "STEPIEN_RULE", teamId, message: `Trading the ${season} first-round pick would leave the team without a first-round pick in consecutive future years.` });
      }
    }
  }

  return { isValid: violations.length === 0, violations };
}
```

- For each team, build a **`Set` of the seasons it's giving away a first-round pick.** The chain is:
  `.filter(...)` keeps only that team's outgoing _round-1_ draft picks, then `.map((a) => a.season)`
  turns each into just its season number, and `new Set(...)` collects them (no duplicates).
- `if (seasonsLosingPick.size === 0) continue;` — if this team isn't trading any first-rounders,
  skip it (`.size` is how many items a Set has).
- `remainingOwnedSeasons` = the seasons it _still_ owns a pick for, _after_ removing the ones it's
  giving away (`.filter((s) => !seasonsLosingPick.has(s))` keeps seasons **not** in the giving-away
  set; `.has(...)` checks if a Set contains a value).
- Then, for each pick it's trading, it checks: does it still own a first-rounder in the year
  **before** (`season - 1`) or the year **after** (`season + 1`)? `if (!hasNextYear && !hasPriorYear)`
  means "if it has **neither** the next year **nor** the prior year." If so, trading this pick would
  leave a **two-year gap** with no first-rounder — banned by the Stepien rule → violation.
- **Finally:** `return { isValid: violations.length === 0, violations };` — the trade is valid only
  if the violations list ended up **empty** (`violations.length === 0` is true when there are zero
  problems). Hand back the verdict and any problems found.

---

## Zooming out

Notice the whole strategy: **collect problems into a list, then judge at the end.** Each stage is
independent and just pushes any violations it finds. This is clean because it can report _all_ the
things wrong with a trade at once (not just the first), and each rule is easy to read on its own.

And notice what this file does **not** do: it never touches the database. It works entirely on plain
data handed to it. That's why the _same_ function can run in your browser (to show a live "this trade
is legal/illegal" preview as you build it) _and_ on the server (to double-check before actually
executing the trade) — one rulebook, used in both places, so they can never disagree.

**Next file:** `trade/evaluateTradeOffer.md` — separate from legality, this is how the _computer_
team decides whether it actually _wants_ the trade.
