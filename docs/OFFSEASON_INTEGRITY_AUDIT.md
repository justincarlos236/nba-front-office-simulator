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
| O-P1-1 | P1 | **Open.** `advanceSeasonAction` is non-atomic across 30 writes; both failure windows leave a permanently unadvanceable league. Recommended fix: make the path idempotent, then move the guard onto `league.currentSeason`. |

## Reproducing

The write map is derived by scanning the function for `prisma.<model>.<write>`
between L197 and L2264 and partitioning on the `$transaction` at L2224. The two
windows follow from the sentinel at L1577 against the marker at L2120.
