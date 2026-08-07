# 02 — A Real Request, Traced Block by Block

We'll follow **`executeTradeAction`** in `src/lib/actions/trade.ts` from start to
finish. It's the best single example in the codebase — it authenticates,
authorizes, loads a lot of data in parallel, calls two different pure engines
(legality, then AI acceptance), and writes atomically with side effects. If you
understand this one function, every other action is a simpler version of it.

## The input

```ts
interface ExecuteTradeInput {
  leagueId: string;
  fromTeamId: string; // the user's team (LeagueTeam id)
  toTeamId: string; // the CPU team
  myPlayerIds: string[];
  theirPlayerIds: string[]; // LeaguePlayer ids each side sends
  myPickIds: string[];
  theirPickIds: string[]; // DraftPick ids each side sends
}
```

Note it takes **ids**, not objects. The client sends _what_ it wants to trade; the
server re-loads the real rows itself and never trusts the client's copy of the
data. That's the security spine of the whole thing.

## Block 1 — Authenticate

```ts
const session = await auth();
if (!session?.user) redirect("/sign-in");
```

`auth()` reads the JWT session. No user → bounce to sign-in. Every action starts
this way.

## Block 2 — Authorize (three checks, not one)

```ts
const league = await prisma.league.findUnique({
  where: { id: input.leagueId },
  include: { teams: true },
});
if (!league || league.ownerId !== session.user.id) throw new Error("League not found");
if (league.userControlledTeamId !== input.fromTeamId)
  throw new Error("You can only trade away players from your own team");
```

1. The league exists **and you own it** (`ownerId === session.user.id`).
2. `fromTeamId` is actually **your** team — you can't initiate a trade _for_ the CPU.

Notice it throws `"League not found"` even when the league exists but you don't own
it — it doesn't leak that someone else's league exists.

## Block 3 — Load everything in parallel with `Promise.all`

```ts
const [ myPlayers, theirPlayers, myPicks, theirPicks,
        myCapSheet, theirCapSheet,
        myOwnedFirstRoundSeasons, theirOwnedFirstRoundSeasons,
        fromLeagueTeam, toLeagueTeam, toTeamRoster, fromTeamRoster,
        competitivenessPercentiles ] = await Promise.all([ ...13 queries... ]);
```

**Why `Promise.all`:** these 13 reads don't depend on each other, so they run
**concurrently** instead of one-after-another. That's the difference between one
slow request and thirteen stacked round-trips. This is _the_ performance pattern in
the actions layer.

Things worth seeing in those queries:

- `myPlayers` is loaded with `where: { id: { in: input.myPlayerIds }, leagueTeamId: input.fromTeamId }` — it re-checks the players are **actually on your team right
  now**, so a stale/forged id can't smuggle in someone else's player.
- Each player includes `contract: { include: { years: { where: { season } } } }` —
  only this season's salary year is pulled (that's what cap matching needs).
- `myCapSheet`/`theirCapSheet` come from a helper `loadCapState()` that loads the
  team's contracts and calls the **pure** `computeCapSheet()` — so the shell fetches
  rows and the pure engine does the math.
- `...OwnedFirstRoundSeasons` feeds the **Stepien rule** (can't trade away
  first-round picks in back-to-back future years).
- `toTeamRoster` (the CPU's whole active roster) is loaded separately from
  `theirPlayers` (just what's being dealt) because the AI needs the full roster to
  judge fit.

## Block 4 — Integrity checks

```ts
if (myPlayers.length !== input.myPlayerIds.length) throw new Error("... no longer on your roster");
// same for theirPlayers, myPicks, theirPicks
```

If the number of rows loaded doesn't match the number of ids requested, something
the client sent is stale or invalid (a player was already traded, a pick already
used). Fail loudly rather than silently trade fewer assets.

## Block 5 — Build the asset list (a discriminated union)

```ts
const assets: TradeAssetInput[] = [
  ...myPlayers.map((lp): TradeAssetInput => ({ type: "PLAYER", fromTeamId, toTeamId, playerId: lp.id, salaryCents: lp.contract!.years[0].salaryCents, noTradeClause: lp.contract!.noTradeClause })),
  ...theirPlayers.map(... reversed direction ...),
  ...myPicks.map((p): TradeAssetInput => ({ type: "DRAFT_PICK", ..., season: p.season, round: p.round as 1|2 })),
  ...theirPicks.map(...),
];
```

Every tradeable thing is normalized into a `TradeAssetInput`, a **discriminated
union** (`type: "PLAYER" | "DRAFT_PICK" | "CASH"`). The pure validator can then
loop over one flat list and switch on `type`. This is how the shell hands clean,
uniform data to the pure core.

## Block 6 — Validate legality (pure engine #1)

```ts
const validation = validateTrade({
  season: league.currentSeason,
  assets,
  teamCapStates: {
    [fromTeamId]: { apronLevel: myCapSheet.apronLevel, capSpaceCents: myCapSheet.capSpaceCents, ownedFutureFirstRoundPickSeasons: myOwnedFirstRoundSeasons },
    [toTeamId]:   { ...theirs... },
  },
});
if (!validation.isValid) throw new Error(validation.violations.map(v => v.message).join(" "));
```

`validateTrade` (doc 03) is **pure** — it gets everything it needs as plain data
(no DB) and returns `{ isValid, violations }`. If illegal, the action throws with
the human-readable reasons. **This is the server-side re-validation**: the trade
builder UI ran the same function for a live preview, but the authoritative check is
here.

## Block 7 — Ask the CPU if it _wants_ the deal (pure engine #2)

Only after legality passes does it build the CPU's decision context —
`computeTeamIdentity` (contender vs. rebuilder), `computeTeamNeeds` (positional
holes), the roster, the GM personality — and call `evaluateTradeOffer(...)`.
**Why this order:** "is it legal?" is cheap and absolute; "does the AI accept?" is
only meaningful for a legal deal. A real GM never evaluates a trade its team can't
legally make.

Each traded asset is mapped into a `TradeAssetForEvaluation` (rating, potential,
age, salary, injury history for players; pick season/round/slot and the original
team's competitiveness for picks — because a pick from a bad team is more valuable).

## Block 8 — Execute atomically + side effects

If the CPU accepts, the action writes the result. The moves are:

- players change `leagueTeamId` (and their contract's team), picks change
  `currentOwnerId`,
- **side effects** fire from the pure domains: fan reaction
  (`computeTradeSentimentDelta` → `applyFanHappinessDelta`), player morale
  (`computeMoraleAfterTrade`), and if a genuine **franchise icon** left, a
  value/fan hit (`computeFranchiseIconScore` → `computeIconDepartureImpact`) plus an
  "end of an era" story,
- a **news entry** is written (`describeTrade` + `newsImportance` to rank it in the
  feed).

These related writes happen together so the database can't end up half-traded.
Then `revalidatePath(...)` refreshes the affected pages.

## The shape you just learned

```
auth ─► authorize ─► parallel load (Promise.all) ─► integrity check ─►
normalize to plain data ─► pure validate ─► pure AI decision ─► atomic write + effects ─► revalidate
```

Every other action is a subset of this. `createLeagueAction` skips the AI step but
adds a huge parallel _creation_ step. `simulateGamesAction` replaces the middle
with the chunked simulation loop. `signFreeAgentAction` is basically blocks 1–6 with
a single-team cap check. Read those next and you'll recognize every block.
