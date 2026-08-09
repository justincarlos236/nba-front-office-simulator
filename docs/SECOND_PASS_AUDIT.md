# Second-Pass Whole-Simulator Audit

**Date:** 2026-08-10 · **Method:** code trace + direct measurement against 13
live saves (one six seasons deep, 6,278 played games, 129,046 box-score rows).

Every claim below was verified against the running code or the database. Nothing
is marked fixed because we worked on it.

---

## Headline: the premise needed correcting — and has since been addressed

At the time of writing, the revamp phase was **not** complete: a P0 found by the
roster/progression audit was outstanding in code. Every seeded player was
permanently 27 years old, so nobody aged, declined, or retired; a six-season
save held 777 players and had recorded zero retirements.

**That defect is now fixed (`ffec212`).** Ages resolve from `birthDate`, all
three development branches are populated, and retirement fires. Release
readiness moves from 6/10 to roughly 7/10; the remaining blockers are P1-2
(event frequency) and P1-4 (no canonical roster page), neither of which is
critical.

---

## Verdict

**Strong but not finished.** The simulator is much further along than the first
audit found, and the integration layer in particular is genuinely good — most of
what I expected to find hollow is actually wired end to end. What remains is one
critical defect, two structural realism gaps, and a set of small unfinished
edges.

This is **not** a system-design problem any more. It is a finishing problem.

---

## Scores

| Dimension | Score | Note |
|---|---|---|
| Feature completeness | 8/10 | Every pillar exists and produces real state |
| Gameplay depth | 6/10 | Real decisions exist; several systems are safely ignorable |
| NBA realism | 6/10 | Games are realistic now; careers and the trade market are not |
| System integration | 8/10 | Verified populated end to end — the strongest dimension |
| Long-save stability | 4/10 → 6/10 | Attrition now works; DB growth still unaddressed |
| Exploit resistance | 7/10 | Stage 1 closed the severe ones; no new reproducible exploit found |
| UX clarity | 7/10 | Attention model is real; a few dead ends remain |
| Technical robustness | 8/10 | State integrity verified perfect across 13 saves |
| Test confidence | 6/10 | 1,220 tests, but no cross-system integration coverage |
| **Release readiness** | **6/10 → 7/10** | P0 since fixed (`ffec212`); the rest is finishing work |

---

## 1. Previous audit findings — verified status

Checked against code and database, not diffs.

### VERIFIED FIXED

| Finding | Evidence |
|---|---|
| **P0** Notification fragmentation | `getLeagueAttention` is the single source; consumed by the league layout |
| **P1** Free agency: no filters | Position, search, affordable-only, rights-only, sort all present |
| **P1** Free agency: no cap context | Cap space passed in and drives the affordable filter |
| **P1** Trade partner browse flat | Now a Ledger with cap space and computed needs per team |
| **P1** Finances inbox duplicated | Overview shows two most urgent, links to the full inbox |
| **P1** Trade outcome visually plain | Rebuilt: Broadcast on execution, Record on revisit, immutable cap snapshot |
| **P1** Lottery no return edge | Returns to `/leagues/{id}/draft` |
| **P2** Focus states absent | `:where(...):focus-visible` in `globals.css` covers every interactive element |
| **P2** Raw `err.message` as UI | **0** occurrences in `src/lib/actions/*.ts` |
| **P2** `/all-star` orphaned | Present in `subNavSections` |
| **P2** Sub-nav "News" mislabelled | Now `label: "Transactions"` |
| **Step 3** Continuity schema | `lastSeenAt` + `newsReadThroughAt` in schema |
| **Step 5** Primitive layer | 12 exported primitives |

### STILL PRESENT

| Finding | Evidence | Severity |
|---|---|---|
| No canonical roster page | `/leagues/[id]/roster` does not exist | P1 |
| Nav: 14 targets in one row | Still exactly **14** | P2 |
| Scouting has no cross-session summary | Absent | P2 |
| "Projected this season" duplicated | **2** occurrences across tabs | P2 |
| `/fans` is a dead end | **0** outbound links on the page | P3 |

### LEDGER ACCURACY — a finding in itself

`docs/REDESIGN_PLAN.md` listed **five** items as open that are demonstrably
fixed, and contradicted itself on Steps 3 and 5 (marked done in the sequence
table, open in the body). It had already drifted once and been re-verified;
it drifted again. **A ledger nobody trusts is worse than no ledger** — the last
re-verification pass nearly caused free agency to be rebuilt from scratch.

---

## 2. Integration audit — the strongest part of the system

This is where I expected to find hollow systems. I mostly did not. Measured on
the six-season save:

| System | Rows | Reads as |
|---|---|---|
| PlayerGameStat | 129,046 | Real per-game box scores |
| LeagueTransaction | 3,139 | News actually generated |
| FanSentimentEvent | 1,079 | Fan reactions attributed to causes |
| DraftPick | 600 | Full pick inventory incl. traded picks |
| FanHappinessSnapshot | 120 | Per-team, per-season history |
| FinancialSnapshot | 120 | Per-team, per-season history |
| Staff | 103 | Populated |
| PlayoffSeries | 60 | 4 completed finals |
| LotteryResult | 56 | Real lottery history |
| BusinessDecision | 49 | Inbox actually fires |
| SeasonAward | 20 | 5 per season, every season |
| Trade | 12 | See P1-2 below |

Two tables are empty, both legitimately: `CapitalProject` (user never started
one) and `CareerRecord` (only written on retirement or firing, neither of which
has occurred — itself downstream of P0-1).

**Conclusion: the "systems that exist but nobody consumes" failure mode is
largely absent.** This should be protected, not re-architected.

---

## 3. Remaining findings

### P0-1 — Nobody ages, declines, or retires · *Bug* · **FIXED** (`ffec212`)

Carried from `docs/ROSTER_PROGRESSION_AUDIT.md`, unfixed in code.

`estimateAge` returns a hardcoded `27` when `draftYear` is null, and **all 537
seeded players have null `draftYear`** — while all 537 have a usable
`birthDate` (real ages 22–44). Eighteen call sites are affected: development,
retirement, trade valuation, CPU free agency, draft context, contracts, six UI
surfaces.

Consequences, measured: age 27 sits between the growth ceiling (26) and decline
start (30), so every real player is in an unbiased ±1 random walk forever.
Retirement risk starts at 33, so its probability is **exactly zero by
construction** — zero retirements in six seasons, population exactly
537 + 240 drafted = 777.

**This is the only finding that blocks release.** The fix is wiring:
`ageFromBirthDate` already exists and is correct.

---

### P1-2 — League event frequency is coupled to an implementation constant · *Bug / Realism*

**Observed.** 12 trades in six seasons — **2 per season, league-wide**. The NBA
averages roughly 40.

**Root cause.** `shouldTriggerEvent` computes the probability that *at least one*
event occurs across the batch, then performs a **single roll**:

```ts
const chance = 1 - (1 - chancePerGame) ** gamesInBatch;
return rng() < chance;
```

At most one trade can fire per batch regardless of how many games it covers.
With `CHUNK_SIZE = 50`, a 1,230-game season allows ~24 opportunities at ~26%
each — and `rollForCpuTrade` returns null often enough to halve that again.

**Why it matters beyond frequency:** league activity is a function of a
performance constant, not the calendar. Change `CHUNK_SIZE` for speed and the
trade market silently changes with it. Not currently user-exploitable
(`CHUNK_SIZE` is fixed), but it is the wrong coupling.

**Fix.** Draw the event *count* for the batch (binomial or Poisson) rather than a
single boolean, so frequency depends on games played and nothing else.

---

### P1-3 — Talent never concentrates into contenders · *Missing integration*

Carried and confirmed. The ceiling is right (a team can hold 3 of the top 30) but
the floor is wrong: talent spreads across 21–24 teams where the real league
concentrates it in ~15. Nothing moves stars toward contenders — CPU free agency
routes players to clubs with cap space and roster holes (i.e. bad teams), and CPU
trades are value-matched one-for-one swaps.

**Deliberately not proposed for fix yet.** With nobody ageing out of the league,
the roster market is not behaving normally; tuning talent flow now would be
tuning against a broken baseline. Re-measure after P0-1.

---

### P1-4 — No canonical roster page · *Missing expected functionality*

Unchanged from the first audit. The dashboard has a roster table and `/rotation`
has a depth chart; neither is "the place you manage your team". For a franchise
simulator this is a conspicuous gap.

---

### P2-5 — `/contracts` is unreachable · *Dead code*

**Zero** links to it anywhere in the codebase. The page exists and renders; no
user can arrive at it. Either wire it into navigation or delete it.

---

### P2-6 — Three deep-dive docs describe a simulation model that no longer exists

`docs/code-deep-dive/02-simulation.md`, `docs/code-guide/04-simulation-code.md`
and `docs/extreme-deep-dive/simulation/simulateGame.md` all document
`WIN_PROB_STEEPNESS` and `MIN_MARGIN`, both deleted in the Stage 2 rework. These
are personal reference docs, so the cost is confusion rather than user-facing
error — but they now actively mislead.

---

### P2-7 — Nav still carries 14 targets · *UX*

Unchanged. Most are inert in any given phase.

### P2-8 — Scouting has no cross-session summary · *UX*

"You scouted 6 of 12" still absent. Scouting is a multi-session activity with no
progress surface.

### P2-9 — "Projected this season" duplicated across two tabs · *UX*

Two occurrences of the same figure.

### P3-10 — `/fans` is a dead end · *UX*

Zero outbound links from the deepest page in the information architecture.

---

## 4. Long-save audit

| Signal | 6 seasons | Assessment |
|---|---|---|
| Active players | 777 (from 537) | **Unbounded growth** — P0-1 |
| Retirements | 0 | **Broken** — P0-1 |
| PlayerGameStat rows | 129,046 | ~21.5k/season → ~430k at 20 seasons |
| Scoring drift | 118.0 → 118.4 | Stable, no inflation |
| Standings integrity | Perfect | Wins = losses = games played, every save |
| Awards | 5/season, every season | Working |
| Team strength spread | 13.3 → 8.9 | Mild decline; downstream of P0-1/P1-3 |

**Database growth is the sleeper risk.** At ~21.5k box-score rows per season, a
20-season save reaches ~430k rows in one table for one league. No pagination or
archival strategy exists. Not yet a problem; would become one.

**No 20-season save exists**, and the headless harness to create one has still
not been built — flagged in both prior audits and still true. Every long-save
claim rests on a single six-season save.

---

## 5. Testing audit

1,220 tests across 137 files, plus 4 Playwright specs
(`draft`, `free-agency`, `league-creation`, `multiple-leagues`).

**Strongly covered:** finances (160), draft (152), fans (132), gm (127),
simulation (104), development (47), free agency (42), cap (38), trade (37).

**The gap: there are no cross-system integration tests.** Every test is either a
unit test of a pure function or a UI-level e2e spec. Nothing exercises a chain.

### Could a game-breaking issue still ship while every test passes?

**Yes, demonstrably — it already has, three times:**

1. **P0-1 (age)** passes every test today. `estimateAge` is unit-tested and
   correct; `retirementProbability` is unit-tested and correct. Nothing asserts
   that a league *actually retires anybody*.
2. **The stale-rotation P0** (a signed superstar contributing +0.00) passed the
   full suite. `resolveRotation` was tested; the roster-change interaction was not.
3. **The margin/win-probability defects** passed 1,135 tests. Nothing tested
   emergent distributions until the statistical suite was added.

The pattern is consistent: **units are correct, integrations are untested.**

### Required regression tests

- **Invariant:** after N simulated seasons, active population stays roughly flat
  and retirements are non-zero (would have caught P0-1)
- **Invariant:** no roster exceeds 15 (Stage 1's cap)
- **Integration:** trade execution propagates to roster, cap, morale, fans, news
- **Integration:** season rollover produces awards, expectations, and a draft class
- **Statistical:** league event counts scale with games played, not batch size
- **Statistical:** the nine existing game-model safeguards (already added)

---

## 6. Systems that are now strong — protect these

Verified, not assumed. **Do not rewrite these.**

- **State integrity.** Across 13 saves and ~5,000 completed games, wins always
  equalled losses always equalled games played. Zero drift.
- **Box-score reconciliation.** 240 sampled games, **zero** mismatches between
  player points and team score.
- **The integration layer.** Twelve downstream tables verified populated with
  real, attributed data.
- **The game model** (post-Stage 2). Win spread, margin distribution, scoring
  mean and variance all in real NBA bands.
- **The attention model.** `getLeagueAttention` is a genuine single source.
- **The Wire design system.** Six archetypes, consistently applied.
- **Schedule generation.** Exactly 82 games per team, verified.
- **Series-length distribution.** Matches real NBA frequencies without tuning.

---

## 7. Intentional simplifications worth preserving

- **Possession-free game model.** Fast, deterministic, testable. Now produces
  realistic distributions. Do not replace with possession-level simulation.
- **Contracts generated from a valuation model** rather than real salary data.
- **Box scores explaining an already-decided score** rather than driving it.
- **No player likenesses or team marks** — a licensing constraint, correctly
  respected.
- **Estimated experience/age from draft year** — sound *as a fallback*; the bug
  is that it is the primary path (P0-1).

---

## 8. Answers to the direct questions

### Is the simulator feature-complete?

**Nearly — but not while P0-1 stands.** Every pillar exists and produces real,
consumed state. What is missing is not a feature but a *consequence*: players do
not age out, so career arcs, succession pressure and the draft's purpose are all
inert. A franchise simulator where no player ever retires is not complete
regardless of how many systems it has.

Fix P0-1 and the honest answer becomes yes.

### Are there significant missing mechanics — should I stop adding systems?

**Stop adding systems.** Only one genuinely missing mechanic surfaced across
three audits: something that lets talent concentrate into contenders (P1-3), and
even that should not be built until ageing works, because the roster market is
currently not behaving normally.

Everything else on the list is finishing an existing system, not adding one.

### After the remaining P0/P1/P2, is further refinement meaningful or diminishing returns?

**P0-1 is high value and cheap.** P1-2 and P1-4 are worth doing. After those,
returns drop sharply — P2s are polish that players will mostly not notice, with
two exceptions worth taking: the unreachable `/contracts` page and the stale
docs, both of which cause future confusion rather than present harm.

The single highest-leverage remaining investment is **not a feature at all**: it
is the headless multi-season harness that all three audits have now asked for
and none has built. Without it, every long-save claim rests on one six-season
save, and the invariant tests that would have caught P0-1 cannot be written.

### Ready to transition to balancing, playtesting, polish and release prep?

**Not yet — but close.** One P0 and two P1s away.

Sequence I would defend:

1. Fix P0-1 (age → decline → retirement). Re-measure everything downstream.
2. Build the headless harness. Add the population and roster invariants.
3. Fix P1-2 (event frequency) and P1-4 (roster page).
4. Re-measure P1-3 against a league that now turns over; decide then.
5. *Then* transition to balancing and playtesting.

Steps 1–2 are the real work. Everything after is finishing.

---

## Limitations of this audit

- No 20-season save exists; long-save findings rest on one six-season save.
- The trade-market frequency was diagnosed from code plus a 12-trade sample; the
  expected rate was computed, not simulated.
- UX findings are structural (dead ends, duplication, nav weight) — no usability
  testing was performed, and none of the surfaces were viewed as rendered pixels.
- Contract/cap consequences of ageing were not examined and belong to their own
  audit once P0-1 is fixed.
