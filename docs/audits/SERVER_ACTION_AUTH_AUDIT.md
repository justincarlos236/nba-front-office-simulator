# Server action authorization audit

The layer none of the gameplay audits touched, and the only one whose failures
are reachable by other people. Every fix this session landed in the pure
functional core; the 1,559 unit tests exercise none of the imperative shell.

The question: **with the Vercel link shared, can one player read or mutate
another player's league?**

## The surface

- 32 files in `src/lib/actions`, **22** carrying `"use server"`
- **43** exported actions in those files

In the App Router every export of a `"use server"` module is a callable POST
endpoint. Authentication is not automatic and there is no middleware gate here,
so each export must prove ownership itself.

## Method, and a correction

A first pass grepped for guard tokens per *file* and reported 18 unguarded
actions across 12 files. **That number was wrong and overstated the risk twice
over.**

- 10 of those 12 files are not `"use server"` at all - they are internal
  modules (`leagueEvents`, `offseasonFinances`, `fanNarrative`, ...) called from
  guarded actions. Auth belongs at the boundary, not in every helper, so their
  lack of a check is correct.
- A per-*function* pass then flagged 28, but most delegate to a shared guard
  rather than inlining `auth()`. Counting delegation brought it to 8.

Only a per-function scan that follows delegation gives a true figure.

## What the guards look like

Three patterns, all correct where present:

| Guard | Files | Checks |
| --- | --- | --- |
| `requireOwnedLeague` | draft, draftLottery, offseason, playoffs | auth, `ownerId`, rejects |
| `requireOwnedLeagueTeam` | capitalProjects, financing, scoutingAssignments | the above plus `userControlledTeamId` |
| `loadOwnedProposal` | tradeOffers | the above plus the trade belongs to the league |
| inline | trade, simulation, freeagency, ... | auth then `league.ownerId !== session.user.id` |

`trade.ts` additionally refuses to move players off a team the caller does not
control. `loadOwnedProposal` is 404-shaped rather than 403-shaped so a non-owner
cannot learn a league exists - the right choice, and worth keeping consistent.

**All are equivalent.** Verified across all seven copies: every one checks
`auth()`, compares `ownerId`, and rejects.

## Findings

### A-P1-1 — internal helpers published as endpoints — FIXED

`allStarWeekend.ts` needs `"use server"` for `resolveAllStarWeekendAction`,
which a client component calls. Two *internal* helpers were exported from the
same module and so were independently reachable:

| Action | Writes | Reachable | Guard |
| --- | --- | --- | --- |
| `generateAllStarWeekend` | **7** | yes | none anywhere in an 18,782-char body |
| `buildAllStarPerformancePool` | 0 | yes | none |

Their real callers (`simulation.ts:607`, `leagueEvents.ts:967`) are both
guarded, which is exactly what made this easy to miss - the code path a user
travels is safe, and the endpoint beside it was not. A direct POST could force
All-Star weekend generation, with its seven writes, into any league whose id the
caller knows.

**Fixed** by adding `requireOwnedLeague` to both, 404-shaped to match
`tradeOffers.ts`.

### A-P2-1 — cross-tenant read — FIXED

`getScoutingBudgetSummary` looked a league up by id alone and returned its
scouting capacity and spend. No mutation and low-value data, but it is another
save's data. **Fixed** by calling the `requireOwnedLeagueTeam` already defined
in that file.

### A-P2-2 — the guard is duplicated seven times — OPEN

`requireOwnedLeague` / `requireOwnedLeagueTeam` are defined privately in seven
files rather than shared. All seven currently agree, so this is not a live
defect - it is the condition under which one becomes possible, since a new
action file gets no help and the eighth copy is the one that drifts. Worth
extracting to `src/lib/auth/requireOwnedLeague.ts`, which would also have made
A-P1-1 visible immediately.

### A-P2-3 — `ensureDraftClassGenerated` — OPEN BY DECISION

Still `"use server"`, still exported, still no ownership check, one write. This
has been raised twice and declined twice; recorded here for completeness rather
than re-argued. It generates a draft class for a league by id, so the blast
radius is bounded - it creates data rather than destroying it, and only in a
league already at the draft.

## Deliberately not flagged

`signUpAction` and `signInAction` in `auth.ts` are unauthenticated because they
must be.

## Status

| ID | Severity | Outcome |
| --- | --- | --- |
| A-P1-1 | P1 | **Fixed** - two internal helpers were public endpoints, one with 7 writes |
| A-P2-1 | P2 | **Fixed** - cross-tenant read of scouting budget |
| A-P2-2 | P2 | Open - guard duplicated seven times, all currently correct |
| A-P2-3 | P2 | Open by decision - `ensureDraftClassGenerated` |

Remaining unguarded exports after the fixes: the two `auth.ts` actions (correct)
and `ensureDraftClassGenerated` (above). Nothing else in the shell is reachable
without proving ownership.
