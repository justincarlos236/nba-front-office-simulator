# The Scouting Pillar — Redesign

Status: **Phases 1-5 built.**

Phase 1 delivered the structural prerequisite: `pre-draft` now exists as a
real `LeaguePhase`, sitting between `playoffs-incomplete` and
`draft-incomplete`. The draft class is generated the moment a league enters
it (via the same idempotent `ensure*` convention as `ensureStaffGenerated`),
independently of the lottery - so the class exists for players to look at
before pick order is known, which is the ordering the whole design depends
on.

Phase 2 delivered the core loop: per-prospect Scouting Depth (0-3), a
whole-window assignment budget set by the Scouting department level, the
Focused Look action, and Recommend mode. `generateScoutingReport` now keys
off Depth instead of the flat department level.

Phase 3 delivered the disagreement fantasy: the Big Board (a public
ranking built from a believable public-evaluation model - age, physical
profile, competition level/visibility, generated production, and a
scouting-activity-gated tournament reveal - never true rating), and "My
Board," the player's own ranked list built from bookmarks, which now leads
Draft Night as its own tab. `computeProjectedDraftRange` was deleted, not
duplicated, per Part 5's overlap review.

Phase 4 delivered texture and longevity: real prospect Pathways (Power
Conference/Mid-Major/International Professional/Development Pathway) that
now survive Draft Night onto the real `Player` row and surface in profiles
and news, not just scouting; Regional Sweeps and Private Workouts (the
third and final assignment types from Part 3.3); and Class-Character
Variance (Part 3.6) perturbing both the rating curve and the Big Board's
noise profile.

Phase 5 delivered the payoff (Part 3.5): a durable `Player.draftProspectId`
link (`onDelete: SetNull` - a league's deletion must never destroy a real
`Player` row) so draft-time scouting data survives to be looked up years
later; a post-draft resolution recap shown once, right when the user's own
pick resolves, showing Scouting Depth reached, My Board rank vs. Big Board
rank, and which hidden axes got resolved vs. stayed unresolved -
deliberately never `potentialRating` or a steal/bust verdict; and the
long-tail News beat, refined at the user's explicit request (2026-08-06)
into **two distinct narrative types** rather than one beat with a boolean
flip - `GOT_AWAY` (an under-scouted prospect who ended up thriving on
another team - regret) and `GAMBLE_PAID_OFF` (an under-scouted prospect the
user drafted anyway who's now thriving - vindication of instinct, never
framed as luck). Both fire only on a player's first career All-Star
selection, reusing the existing `priorSelectionIds` first-timer gate in
`generateAllStarWeekend`. A new `/guide/scouting` article consolidates what
had been scattered across `/guide/season-flow` and adds coverage of
delegation, resolution, and the long-tail payoff.

Goal, in the user's words: make the pre-draft offseason "one of the most
engaging parts of an entire franchise save," and scouting "one of the
primary things the player actively does between the end of the season and
Draft Night." Explicitly **not** "better scouting reports."

---

## Part 1 — Audit: what scouting actually is today

### 1.1 The finding that reframes the entire request

> **There is no pre-draft offseason to put scouting into.**
>
> The draft class does not exist until the moment the lottery is run —
> and the lottery is run _at_ Draft Night, from the same action. The
> prospects are conjured, the pick order is set, and the draft begins,
> all inside one call.

The evidence:

- `generateDraftClass(rng)` has exactly **one** non-test caller:
  `src/lib/actions/draftLottery.ts:112`, inside `runDraftLotteryAction`.
- That same function immediately writes all 60 `DraftProspect` rows
  (`draftLottery.ts:114-130`) and assigns `overallPickNumber` to every
  pick, which is itself the signal `computeLeaguePhase` uses to decide the
  draft has started (`leaguePhase.ts:33-36`).
- `LeaguePhase` has four values: `regular-season`, `playoffs-incomplete`,
  `draft-incomplete`, `ready`. **There is no offseason phase.** The
  moment a champion is crowned, the league is in `draft-incomplete` — the
  draft is already the current business.

So the request's premise — "the pre-draft offseason" — describes a period
of time that **does not currently exist in the simulation**. Everything
below follows from that. This is not a scouting-report problem; it is a
missing phase of the calendar.

### 1.2 What scouting is today, stated plainly

A **pure display function computed at render time**. `deriveScoutingProfile`
and `generateScoutingReport` are called inside `ProspectProfile.tsx:32-33`,
on a prospect the player is already looking at, in a draft that has already
begun. Nothing is persisted. Nothing accumulates. Nothing is chosen.

It has exactly one input the player controls: the **Scouting department
budget level**, set on the Operations page, which "takes effect next
season." That single slider is the entirety of scouting as _gameplay_.

### 1.3 The three honest problems

1. **Scouting is a passive filter, not an activity.** The player's only
   scouting decision is a budget slider set months earlier, in a different
   part of the UI, whose effect they cannot observe until Draft Night. No
   decision is ever made _about a specific prospect_.
2. **Effort cannot be concentrated.** Department level applies uniformly
   to all 60 prospects. There is no way to know one prospect better than
   another — which is the entire fantasy of running a scouting
   department. "We've spent months on this guy" is currently
   unexpressible.
3. **There is no consensus to disagree with.** `computeProjectedDraftRange`
   ranks prospects by their _true_ `overallRating` (`scoutingProfile.ts:119-128`).
   It is not a public board — it is the answer key, lightly disguised. So
   "everyone else has him ranked too low" is impossible: there is no
   "everyone else," and the ranking shown is already correct.

### 1.4 What is genuinely good and must survive

- **Ratings are never hidden or falsified.** Uncertainty lives in the
  qualitative read (bust risk, ceiling range, work ethic), never in a
  fake `overallRating`. This is a real design decision, documented at
  `scoutingProfile.ts:4-11` and enforced by a test. **Keep it.**
- **Deterministic seeding.** Same prospect + same level = same read.
  Re-rolling by refreshing is impossible. **Keep it.**
- **Two traits with no underlying stat** (work ethic, injury outlook) are
  already pure hidden information — the only genuinely unknowable things
  in the system. These are the seed of everything below.
- **The department system** is a good home for "how much do we invest,"
  and already carries a clean identity string. **Keep it as the strategic
  layer**; add the tactical layer beneath it.

---

## Part 2 — Philosophy

Six principles. Every mechanic below must trace to one, or it doesn't ship.

1. **Scouting is the allocation of a scarce resource against uncertainty.**
   Not a data-gathering chore. The fun is in _choosing where not to look_.
2. **Ratings stay honest; opinions are what's uncertain.** Extends the
   existing rule. The player always sees a real `overallRating`. What they
   don't know is whether this kid works, stays healthy, or grows.
3. **The board must be able to be wrong — publicly.** A consensus that is
   merely the truth re-sorted creates no drama. There must be a public
   ranking that is _independently_ wrong, so private knowledge has value.
4. **Time is the resource, and it must run out.** Preparation only means
   something if you cannot prepare for everything.
5. **Every scouting action is a bet, and bets must resolve visibly.**
   The player must later learn whether they were right — including when
   they never looked.
6. **A 25-year save must not repeat itself.** Class-level variance, not
   just prospect-level variance.

**Anti-goals:** no clicking "scout" 60 times; no minigames; no per-prospect
micromanagement queue; no second hidden rating; no mechanic whose optimal
play is "always do the same thing."

---

## Part 3 — The redesign

### 3.0 The structural prerequisite: a real offseason

Split what is currently one instant into a **Pre-Draft window**:

| Today                                                 | Redesigned                                          |
| ----------------------------------------------------- | --------------------------------------------------- |
| Champion crowned                                      | Champion crowned                                    |
| —                                                     | **Draft class revealed (raw, barely known)**        |
| —                                                     | **Pre-Draft window: N weeks of scouting decisions** |
| —                                                     | **Lottery night (pick order revealed)**             |
| Lottery + class generated + draft begins, all at once | Draft Night                                         |

Concretely: `generateDraftClass` moves out of `runDraftLotteryAction` and
into the end-of-playoffs transition. A new `pre-draft` phase sits between
`playoffs-incomplete` and `draft-incomplete`. **This is the single highest-
impact change in this document**, and every mechanic below depends on it.

Note the deliberate ordering: **the class is revealed before the lottery.**
You scout not knowing where you pick. That is what makes it a bet.

### 3.1 The Big Board (the consensus to disagree with)

A league-wide public ranking of the class, generated _independently of true
rating_. It is visible to everyone and it moves during the Pre-Draft window
as the fictional media reacts.

**Its errors must be explainable, not planted** (refinement, 2026-08-06).
Rather than ranking by truth + arbitrary noise, the Big Board is computed
from a **public-evaluation model**: a weighted read of the things a real
public evaluator can actually see. Every input below already exists on
`DraftProspect` or is cheap to generate alongside it:

| Public factor          | Source                                  | Bias it introduces                                                                         |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Age                    | `age`                                   | Younger reads as more upside; a 22-year-old with the same rating ranks lower               |
| Physical profile       | `heightInches`, `weightLbs`, `position` | Prototypical size for the position is overvalued                                           |
| Competition level      | `collegeOrTeam`, `isInternational`      | International and small-program prospects are systematically under-scouted                 |
| Public visibility      | derived from program/nationality        | Low-visibility prospects drift down regardless of ability                                  |
| Production             | generated per-prospect stat line        | Overvalues counting stats; a productive low-ceiling player outranks a raw high-ceiling one |
| Tournament performance | a late-window generated event           | A strong showing moves a prospect up _publicly_ without changing his truth                 |

The Big Board is then `publicEvaluation` ranked — **never** true rating
ranked. A prospect whose truth and public profile disagree is
_systematically_ mis-ranked, and the player can reason about **why**: "he's
22 and played in Lithuania, so nobody's on him." That is a far better
version of the same fantasy than a randomly-planted sleeper, and it means
sweeps targeting under-scouted regions have a _legible_ edge.

This also lets the board **move for reasons**: the tournament event is a
public shock that reprices a prospect mid-window without touching his
underlying ability.

This creates the two headline emotions directly:

- **"Everyone else has him ranked too low"** — your private read says 8th,
  the Big Board says 24th.
- **"Do we trust our scouts or the consensus?"** — when your own report is
  low-confidence and the board disagrees, that is a genuine coin-flip with
  real stakes.

It also gives CPU teams something honest to draft from (see 3.6), and it
gives the trade market a public price for picks.

### 3.2 Scouting Focus — the core loop

The player has a limited number of **scouting assignments per Pre-Draft
week**, determined by their Scouting department level (this is what the
budget slider now _buys_ — capacity, not just accuracy). Each assignment
is directed at **one prospect**, and deepens knowledge of that prospect
specifically.

Knowledge is a per-prospect **Scouting Depth** (0-3, say: _Unknown → Seen →
Studied → Known_). Depth is what `generateScoutingReport` should key off,
**replacing the flat department level** as its reliability input. Same
function, same uncertainty model, same labels — now driven by a number the
player actually moved.

Why this is the right core loop:

- It is a **budget**, so it forces choosing whom _not_ to scout (principle 1, 4).
- It is **few decisions, high weight** — a handful of assignments per week,
  not 60 clicks (anti-tedium).
- It makes "we've spent months on this guy" literally true and legible.
- It makes ignoring a prospect a _decision with consequences_ (principle 5).

### 3.3 Three assignment types (the strategic texture)

Not all scouting is the same look. Three types, each a different bet:

| Type                | Cost                            | What it does                                                                                           |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Regional sweep**  | 1 assignment                    | Shallow depth on _several_ prospects sharing a region/college tier. Broad, cheap, finds nobody deeply. |
| **Focused look**    | 1 assignment                    | +1 Depth on one prospect. The workhorse.                                                               |
| **Private workout** | 2 assignments, late window only | Resolves one _hidden trait_ (work ethic / injury) outright, no uncertainty.                            |

This is where "hidden gem" becomes reachable: sweeps surface a name you
weren't tracking, focused looks confirm it, a workout de-risks it. Three
mechanics, one clean escalation, zero busywork.

### 3.4 The Draft Board (the player's own ranking)

The player maintains a personal ranked board, distinct from the Big Board.
It updates as depth reveals information — **"the draft board keeps
changing as we learn more"** is this, directly.

At Draft Night, when the pick is on the clock, the board is what's
presented first. Draft Night stops being "open a list of 60 strangers" and
becomes "here is the board you spent six weeks building, and the three guys
you wanted are gone." That is the culmination the request asks for.

### 3.5 Resolution — the payoff that makes it a story

Scouting is only a bet if it settles. But **it must not settle immediately**
(refinement, 2026-08-06): revealing a prospect's true potential right after
the draft would collapse the long-term suspense that player development
already provides, and would make the draft a graded quiz rather than a bet.

**The post-draft recap deliberately shows only what the player already
earned the right to know:**

- how deeply you scouted him (Depth reached, assignments spent)
- where _you_ ranked him vs. where the **Big Board** ranked him
- which risks you **resolved** (a completed workout) and which stayed
  **unresolved** — "you never got a read on his health"
- the qualitative reads you held at the time

It explicitly does **not** reveal `potentialRating`, nor pronounce
"steal"/"bust." Whether the pick was right emerges over seasons through the
existing development system, exactly as it does for every other player.
Unresolved risk stays unresolved — that is the suspense.

**Years later, via existing systems**, the real payoff lands: a `News`/
League History beat when a prospect becomes an All-Star — flagged against
your stored Depth record. **"We ignored this player all year — was that a
mistake?"** is unanswerable at the time and devastating three seasons
later. This needs no new system: it is a News item keyed off existing
award data plus the stored depth record.

The division of labor is the point: **scouting resolves what you knew;
development resolves what was true.**

### 3.5b Delegation — depth for those who want it, competence for those who don't

(Refinement, 2026-08-06.) Scouting must not become mandatory homework for a
player who wants to sim to Draft Night. Three escalating levels of
involvement, all reading the same underlying assignment system:

| Mode                | Interaction                                                                  | For whom                                 |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| **Manual**          | Assign every sweep, focused look, and workout by hand                        | The player who wants the pillar          |
| **Recommend**       | Staff propose a full week's assignments; player accepts, edits, or overrides | The default — a real decision, one click |
| **Delegate window** | Choose a _strategy_ once; staff run the whole Pre-Draft window               | The player who'd rather sim              |

The delegated strategies are themselves the strategic choice, so even full
delegation is one meaningful decision rather than an opt-out:

- **Best Player Available** — concentrate depth on the top of the Big Board
- **Fill Our Needs** — weight toward positions `computeTeamNeeds` flags
- **Find Sleepers** — favor sweeps into low-visibility/international pools
- **Balanced** — spread depth, resolve risk on the top target late

Delegation must be **competent, not crippled**: it should produce a
respectable board. Manual play earns its edge through _precision_ —
concentrating on the right three prospects, timing workouts, exploiting a
specific under-scouted pool — not because the auto-scout is deliberately
bad. A player who always delegates should still enjoy Draft Night; a player
who scouts manually should reliably out-prepare them.

This also gives the Action Center a natural, non-nagging role: one item per
Pre-Draft week ("Your scouts have a plan for this week") that resolves in a
click for the casual player and is ignorable for the manual one.

### 3.6 Class variance (the 25-year requirement)

Each class gets a generated **character** — e.g. _top-heavy_, _deep but
flat_, _international-heavy_, _injury-riddled_, _weak class_. This shifts
the rating curve constants that `generateDraftClass` already uses, plus the
Big Board's noise profile.

This is cheap (it perturbs existing constants) and does the most work for
longevity: a weak class makes trading down correct; a top-heavy class makes
tanking correct; a deep class rewards broad sweeps over focused looks. The
_optimal strategy changes per class_, which is the only real defense
against a 25-year save going stale.

---

## Part 4 — What the player does, week by week

Assumes a ~6-week Pre-Draft window.

| Week | What's happening                                                                                                              | The decision                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0    | Playoffs end. Class revealed: 60 names, real ratings, almost no read. Big Board v1 published. Class character hinted in News. | Orientation — read the board, spot the gaps.                                                       |
| 1-2  | Assignments open. Most efficient use is breadth.                                                                              | Sweeps vs. early focus. Do you commit before you know where you pick?                              |
| 3    | **Lottery night.** Pick order revealed.                                                                                       | Everything reprices. Scouting done for a top-3 board may now be wasted — or vindicated.            |
| 4-5  | Depth accumulates; Big Board drifts; your board diverges from consensus.                                                      | Focused looks on your real targets. Trade-up/down conversations, now priced against the Big Board. |
| 6    | Private workouts unlock.                                                                                                      | Spend double cost to de-risk the one guy you're betting the franchise on.                          |
| —    | **Draft Night.**                                                                                                              | Your board, your picks, your bet.                                                                  |

The lottery landing in the _middle_ is the key structural beat: it converts
scouting from a planning exercise into a gamble that gets graded live.

---

## Part 4B — Existing saves & phase-transition safety

(Refinement, 2026-08-06 — verified against the code, not assumed.)

### 4B.1 Where the new phase sits

`deriveLeaguePhase` currently returns, in order: `regular-season` →
`playoffs-incomplete` → `draft-incomplete` → `ready`. The new value slots
in as:

```
regular-season → playoffs-incomplete → pre-draft → draft-incomplete → ready
```

`pre-draft` means: **a champion is crowned, the class exists, the lottery
has not yet run.** The existing "draft started" signal
(`overallPickNumber != null` on any pick) still marks the boundary into
`draft-incomplete` — so the transition rule stays exactly as it is today,
with one new condition ahead of it.

### 4B.2 What breaks, deliberately (the type system as a safety net)

Two consumers are exhaustive `Record<LeaguePhase, …>` maps, so adding the
enum value is a **compile error** at each until handled — which is the
desired behavior, not a problem:

- `src/app/leagues/page.tsx:34` — `PHASE_LABEL` (needs a new label)
- `src/lib/league/subNavSections.ts:33` — `PRIMARY_BY_PHASE` (needs a new
  primary-tab set; Draft/Offseason promoted during the window)

### 4B.3 What is already safe (verified)

Both draft-facing pages collapse every post-playoff phase into a single
`"active"` gate, so they keep working with no change:

- `src/app/leagues/[id]/draft/page.tsx:43-44`
- `src/app/leagues/[id]/draft/lottery/page.tsx:31-32`

`actionCenter.ts` takes `phase` as a plain field and only ever compares it
against specific values (`=== "ready"`, `=== "regular-season"`,
`=== "draft-incomplete"`), so no existing rule mis-fires; new Pre-Draft
rules are additive.

### 4B.4 Existing saves — the actual migration question

The risk case is a save **already sitting in `draft-incomplete`**: champion
crowned, lottery run, class generated, draft not finished. Under the new
ordering that save has skipped the Pre-Draft window entirely.

**Resolution: it stays skipped, and that is correct.** `pre-draft` requires
the lottery _not_ to have run; such a save has already run it, so
`deriveLeaguePhase` returns `draft-incomplete` for it exactly as it does
today. The save finishes its draft normally and gets its first real
Pre-Draft window next offseason. No backfill, no migration, no half-state.

Saves in `regular-season`, `playoffs-incomplete`, or `ready` are entirely
unaffected — they reach the new window naturally at the next playoff end.

The one genuine schema question is **where the class-generation trigger
moves to**. Generating at the playoffs→pre-draft transition (rather than
inside `runDraftLotteryAction`) means `runDraftLotteryAction` must become
tolerant of a class that already exists, instead of always creating one.
That is a small, contained change to a single action, and it is what makes
the whole reordering safe for a save mid-flight.

## Part 5 — Overlap review

| Proposed                       | Existing system                                    | Resolution                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scouting Depth                 | `generateScoutingReport`'s `DepartmentLevel` input | **Replaces it as the per-prospect reliability input.** Same function, same labels, same uncertainty model — different driver. Department level becomes assignment _capacity_. No second uncertainty engine. |
| Big Board                      | `computeProjectedDraftRange`                       | **Replaces it.** That function currently ranks by true rating; the Big Board is the honest version of the same idea. Delete, don't duplicate.                                                               |
| Assignment capacity            | Departments (`departments.ts`)                     | Reuses the existing budget system as its strategic layer. No new economy.                                                                                                                                   |
| Class character                | `generateDraftClass` constants                     | Perturbs existing constants. No new generation system.                                                                                                                                                      |
| Pre-Draft phase                | `leaguePhase.ts`                                   | One new enum value in the existing shared module — the same module three call sites already consolidate on.                                                                                                 |
| Weekly rhythm / prompts        | Action Center                                      | Pre-Draft items ride the existing rule engine, with `reasoning`/`consequence` from the onboarding work. **No new notification system.**                                                                     |
| Explaining any of it           | Guide + `HowDoesThisWork`                          | New `/guide/scouting` article; every new surface links to it via the existing registry.                                                                                                                     |
| "He became an All-Star" payoff | News / League History / awards                     | Pure read over existing award + depth data. No new model.                                                                                                                                                   |
| Prospect display               | `ProspectProfile.tsx`                              | Extended, not replaced.                                                                                                                                                                                     |
| Analytics department           | Trade valuation                                    | Untouched — deliberately stays separate.                                                                                                                                                                    |

**Explicitly rejected:** a second hidden rating; scout-staff hiring (would
duplicate the Staff system for little gain); per-prospect interview
minigames; a scouting sub-currency separate from the department budget.

---

## Part 6 — Ranked by impact vs. effort

| #   | Change                                                     | Impact                                  | Effort  |
| --- | ---------------------------------------------------------- | --------------------------------------- | ------- |
| 1   | Pre-Draft phase + move class generation before the lottery | **Decisive** — unlocks everything       | Medium  |
| 2   | Scouting Depth + assignments (the core loop)               | **Decisive**                            | Medium  |
| 3   | Big Board (independent public consensus)                   | High — creates the disagreement fantasy | Medium  |
| 4   | Class character variance                                   | High for longevity                      | **Low** |
| 5   | Player's own Draft Board                                   | High for Draft Night payoff             | Low-Med |
| 6   | Post-draft "what you knew vs. what was true"               | High emotional payoff                   | Low     |
| 7   | Three assignment types                                     | Medium — adds texture                   | Low-Med |
| 8   | Long-tail "the one who got away" News beat                 | High story value                        | Low     |

Note #4 and #8: both are cheap and both do disproportionate work for the
25-year question. They should not be deferred just because they're small.

---

## Part 7 — Phasing

| Phase | Contents                                                                                                        | Rationale                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **1** | Pre-Draft phase; class generated at playoffs' end; lottery moved mid-window; Action Center items for the window | The structural prerequisite. Shippable alone: even with no new scouting, an offseason that _exists_ is an improvement. |
| **2** | Scouting Depth + assignment budget; re-key `generateScoutingReport` off depth; Focused look only                | The core loop, minimum viable.                                                                                         |
| **3** | Big Board + player Draft Board; Draft Night leads with your board                                               | The disagreement fantasy and the payoff.                                                                               |
| **4** | Sweeps + private workouts; class character variance                                                             | Texture and longevity.                                                                                                 |
| **5** | Post-draft resolution; long-tail News beat; `/guide/scouting`                                                   | The stories.                                                                                                           |

Phases 1-3 deliver the complete fantasy. 4-5 are what make it survive
twenty-five years.

---

## Part 8 — The 25-year question

> _Would scouting become something the player looks forward to every single
> offseason?_

**With Phases 1-3: yes, but conditionally.** The loop is genuinely
strategic — a real budget, a real consensus to fight, a real board that
changes. The lottery landing mid-window means every year has a moment where
your preparation is either vindicated or blown up. That is a reliable
source of tension.

**The honest risk** is that a strong player converges on a dominant
strategy — "sweep early, focus on the 3-8 range, workout the one guy" — and
by year eight it's a routine. Phases 1-3 alone probably plateau there.

**Phase 4 is what makes the answer an unconditional yes**, and it is the
cheapest thing in the document. Class character means the correct strategy
is _different every year_: a top-heavy class rewards concentration, a deep
class rewards breadth, a weak class makes the right move trading out
entirely. You cannot run the same offseason twice.

**Phase 5 is what makes it memorable rather than merely engaging.** The
player who passed on a future All-Star and gets told about it three seasons
later has a story, and stories are what a 25-year save is made of.

So: **yes — with Phases 1-4 as the real target, and Phase 5 as what turns
a good system into one people talk about.** Phases 1-3 alone would be a
large improvement that still risks going stale; the recommendation is to
treat 4 as core, not polish.
