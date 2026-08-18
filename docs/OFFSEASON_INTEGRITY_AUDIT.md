# Offseason transactional integrity

`advanceSeasonAction` is the longest and most stateful path in the codebase:
lines 197-2264 of `src/lib/actions/offseason.ts`, a little over 2,000 lines in
one function. It is also the only operation that rewrites nearly every table for
a league at once.

The question: **if it fails partway, what state is the save left in?**

## What is atomic, and what is not

| | Count |
| --- | --- |
| Writes before the single `$transaction` at L2224 | **30** |
| Writes inside it | 3 |

The 30 are issued through `Promise.all`, which is concurrency, not atomicity.
There is no interactive `$transaction(async (tx) => ...)` anywhere in the
function and no `tx` client - every one of those writes commits on its own.

So a failure at any point leaves the league **partially advanced**, with no
rollback. The relevant question becomes whether a retry can recover, and that
turns on the idempotency guard.

## The guard, and why its sentinel is in the wrong place

```ts
const alreadyAdvanced = await prisma.game.count({ where: { leagueId, season: newSeason } });
if (alreadyAdvanced > 0) throw new Error("This season has already been advanced.");
```

The sentinel it reads - next season's games - is written at **L1577**. The
authoritative marker, `league.currentSeason`, is not advanced until **L2120**,
543 lines and many writes later. That gap is the defect, and it produces two
failure windows, both unrecoverable.

### Window 1 — failure before L1577

`alreadyAdvanced` is still 0, so a retry proceeds from the top. But player
development (L1170), contract deletion (L1195), CPU re-signings (L1233-L1300),
staff moves (L1365-L1379) and awards (L1447, L1515) have already committed.

The retry does not merely double-apply development and duplicate
`leagueTransaction` rows. **It cannot complete at all**: `SeasonAward` and
`StaffAward` both carry `@@unique([leagueId, season, category])`
(`schema.prisma` L597, L676), so re-creating the same MVP row throws a unique
constraint violation. The league can never be advanced again.

### Window 2 — failure between L1577 and L2120

`alreadyAdvanced` is now greater than 0, so every retry throws "This season has
already been advanced." But `league.currentSeason` was never updated. The save
holds next season's schedule while still reporting the old season, and refuses
to move. Also permanently stuck.

## This is not hypothetical

`src/app/leagues/[id]/offseason/page.tsx` sets `export const maxDuration = 60`.
A 60-second ceiling is configured on precisely the route that triggers this,
and season advance is the heaviest operation in the game - 30 write batches
across every table for a 450-player league. A timeout, a Neon connection blip,
or a redeploy mid-advance lands in one of the two windows above.

No unit test can catch it: all 1,559 exercise the pure functional core, and this
is entirely in the imperative shell.

## Why nothing was changed here

Three candidate fixes, and none is a small edit:

- **Wrap it all in one interactive transaction.** The obvious move and probably
  the wrong one. Prisma interactive transactions carry their own timeout, and
  holding one open across 30 write batches against a pooled Neon endpoint
  (PgBouncer, transaction mode) risks converting a rare partial failure into a
  routine transaction timeout - worse, because it would fail every time rather
  than occasionally.
- **Make the whole path idempotent** so a retry from the top is always safe.
  Correct, and the real fix, but it means auditing all 30 writes individually -
  awards become upserts keyed on their unique constraint, transactions
  de-duplicate, development guards on a per-season marker.
- **Move the sentinel.** Advancing `league.currentSeason` in the same statement
  that writes the schedule would collapse the two windows into one, which is a
  genuine improvement and much smaller. It does not fix window 1.

Attempting a transactional rewrite of a 2,000-line function at the end of a long
session is how a save-corrupting bug gets *introduced* rather than removed. The
finding is recorded with its evidence so the fix can be done deliberately, with
the idempotency route as the recommended one.

## Status

| ID | Severity | Outcome |
| --- | --- | --- |
| O-P1-1 | P1 | **Fixed for both windows.** Neither failure window leaves an unadvanceable league; a retry now completes. `advanceSeasonAction` remains non-atomic, so a retry still re-runs committed work - documented as an accepted trade, not as done. |

## Partial fix — the awards no longer make window 1 permanent

The two award writes were the *only* thing making window 1 unrecoverable. Both
are now idempotent:

- `seasonAward.createMany` takes `skipDuplicates: true`
- `staffAward.create` becomes `createMany` with `skipDuplicates: true` - the
  return value was never used

**What this changes.** A failure before L1577 used to leave a league that could
never be advanced: every retry reached the award write and threw on the unique
constraint. The retry now gets past the awards and completes the advance. The
save survives and stays playable.

**What it does not change.** A retry still re-runs the work that already
committed before the failure, so it can double-apply a season of player
development, write duplicate `leagueTransaction` news rows, and re-run CPU
re-signings. Those degrade a save; they do not end it. The trade is
deliberate - a blemished league the player can keep playing beats a pristine
one they cannot open.

## Window 2 closed — the guard became a recovery path

The plan had been to move the guard onto `league.currentSeason`. That turned out
to be impossible and unnecessary in the same breath: `season` is *read from*
`league.currentSeason`, so it is the function's input, not something a guard can
be moved onto.

Reading the condition properly settled it. Next season's games existing while
`currentSeason` has not moved is not a double-advance - a completed advance
cannot reach that line looking for `newSeason`, because it would be computing
`season + 2` and would already have been stopped by the champion check. **The
condition fires in exactly one situation: an advance that died partway.**

So it no longer throws. The orphaned schedule is discarded and rebuilt - those
games are unplayed by definition, since the season they belong to has not
started - and the retry runs to completion.

## Securing the widened retry path

Allowing window-2 retries to proceed exposed writes that had never been re-run
before, and a check of every uniquely-keyed model on the path found **five more
that would each have thrown**, simply relocating the brick:

| Write | Constraint | Recovery |
| --- | --- | --- |
| `seasonExpectation.create` | `[leagueId, season]` | upsert |
| `fanHappinessSnapshot.createMany` | `[leagueId, leagueTeamId, season]` | `skipDuplicates` |
| CPU re-signing `contract.create` | `leaguePlayerId` unique | skip players already re-signed |
| CPU free-agent `contract.create` | `leaguePlayerId` unique | skip players already signed |
| `staffContract.createMany` (hires) | `staffId` unique | `skipDuplicates` |

The contract cases are skips rather than upserts on purpose: a contract that
already exists for one of these players *is this pass's own work* from the
attempt that died, so re-creating it would be wrong even if it were possible.

`Game`, `LeagueTransaction`, `Staff` and `BusinessDecision` carry no unique
constraint, so their re-runs duplicate rows rather than throwing - cosmetic, and
covered under the accepted trade above.

## Reproducing

The write map is derived by scanning the function for `prisma.<model>.<write>`
between L197 and L2264 and partitioning on the `$transaction` at L2224. The two
windows follow from the sentinel at L1577 against the marker at L2120.

## The remaining residual — double-applied development

Both failure windows now recover, but a retry still re-runs work that already
committed. The largest of those side effects, and the only one a player would
actually notice, is **player development running twice in one offseason**.

`developPlayerRating` is applied to every active player at L1170 and the result
written straight to `overallRating`. On a retry it runs again from the
already-developed rating, so a league recovered from a mid-advance failure has
had one season of growth applied twice. That is not cosmetic like a duplicate
news row - it is the league's talent distribution being wrong from then on.

### Why it cannot be fixed the way the others were

Every other recovery in this document keyed off something already in the
schema - a unique constraint, or a row whose existence proved a step had run.
Development has neither:

- `overallRating` is mutated in place, so the new value is indistinguishable
  from a legitimately high one
- age is derived from `birthDate` at read time, not stored, so no aging marker
  exists either
- the first write in the whole function *is* the development write, so there is
  no earlier row whose presence could mark it

`SeasonAward` rows for `season` do prove development already ran, since awards
are written at L1481 and development at L1170 - but only for a failure that got
past the awards. A crash in between is unmarked, which is most of the window.

### The fix

A per-player marker is needed:

1. `developedThroughSeason Int?` on `LeaguePlayer`, migration alongside
2. set it to `newSeason` in the same L1170 update that writes `overallRating`
3. skip development for any player already at `newSeason`, carrying the current
   values into `playerUpdates` unchanged

Nullable so existing rows read as "unknown" and develop once normally; from then
on the marker is authoritative. The same column would let a future pass make the
advance genuinely resumable rather than merely re-runnable.

| ID | Severity | Outcome |
| --- | --- | --- |
| O-P2-1 | P2 | **Open.** A recovered save can carry a doubly-developed season. Needs the schema change above - it cannot be keyed off anything currently stored. |
