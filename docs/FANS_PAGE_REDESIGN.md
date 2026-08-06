# Fans Page - Ground-Up Redesign Proposal

**Status:** proposal, awaiting approval. No code written.
**Request:** `docs/FEATURE_REQUESTS.md` -> "Fans Page Ground-Up Redesign
(requested 2026-08-06)".
**Verdict up front:** the current page is not salvageable as-designed. It is
a read-only mirror of four derived numbers plus a generic reaction feed. The
redesign below replaces it entirely.

---

## Part 1 - Audit: what actually exists today

### 1.1 The current page

`src/app/leagues/[id]/fans/page.tsx` renders, in order:

1. Fan Happiness (raw 0-100) and Franchise Popularity (raw 0-100).
2. Attendance %, Merchandise, Season Tickets - **all three derived from the
   single `getFranchisePopularityTier` bucket**, relabeled three different
   ways. They are not independent metrics; they are one number wearing three
   hats. The code comment says so explicitly.
3. A Fan Happiness line chart (per-season, from `FanHappinessSnapshot`).
4. "Fan Reactions" - the last 25 `LeagueTransaction` rows for this team, each
   prefixed with a fixed phrase from a 15-entry lookup table
   (`fanReactions.ts`: `TRADE -> "Fans are buzzing"`, etc.).

### 1.2 The single most important finding

**The "why" data the request asks for is already being computed, and is
already being thrown away.**

`src/lib/fans/sentimentEvents.ts` computes a precise, well-reasoned fan-
happiness delta for every major event, at the exact moment it happens:

| Event                          | Function                              | Inputs it already weighs                |
| ------------------------------ | ------------------------------------- | --------------------------------------- |
| Trade                          | `computeTradeSentimentDelta`          | trade fairness score + star tier in/out |
| Signing                        | `computeSigningSentimentDelta`        | star tier, re-signing vs. outside add   |
| Win/loss streak                | `computeStreakSentimentDelta`         | streak importance tier                  |
| Injury / recovery              | `computeInjurySentimentDelta`         | star tier + severity                    |
| Staff hire/fire                | `computeStaffChangeSentimentDelta`    | head coach only, by quality             |
| Rotation change                | `computeRotationChangeSentimentDelta` | star tier, promoted/demoted             |
| Awards                         | `computeAwardSentimentDelta`          | award category                          |
| All-Star selection/snub/result | 3 functions                           | fixed magnitudes                        |
| Draft lottery                  | `computeLotteryResultSentimentDelta`  | seed movement + #1 pick                 |

Every one of these is called at its real call site (`trade.ts`,
`freeAgency.ts`, `staff.ts`, `draftLottery.ts`, `allStarWeekend.ts`,
`leagueEvents.ts`, `rotation.ts`, `offseason.ts`), immediately folded into
`LeagueTeam.fanHappiness` via `applyFanHappinessDelta`, and then **the delta
itself is discarded**. Nothing persists "this trade cost you 5 fan happiness."

`FanHappinessSnapshot` stores only the _result_ (`fanHappiness`,
`attendancePct`, `franchisePopularity`) once per season - never the causes.

So today the page can only say _what_ the number is. The engine already knows
_why_. **The redesign is mostly a persistence + presentation problem, not a
new-simulation problem** - which is exactly the right kind of feature to
build: no parallel model, no invented numbers.

### 1.3 Fan Happiness vs. Owner Confidence vs. Season Expectation

Three separate systems, easy to conflate, and the distinction is load-bearing
for goals #2 and #4:

- **`LeagueTeam.fanHappiness`** (0-100, per team) - what the fanbase feels.
- **`League.ownerConfidence`** (0-100, user's team only) - the GM's job
  security. Owned by the Home Dashboard's "GM Job Security" card.
- **`SeasonExpectation.expectationLevel`** - computed by
  `computeExpectationLevel(payrollTier, teamStrength)`. This is **ownership's**
  bar, driven by payroll and roster quality. It is _not_ what fans want.

The request's goal #2 ("What do the fans expect from me this season?") is
asking for something that **does not exist yet**. Fans and ownership currently
share one expectation model, and they shouldn't - an owner cares about payroll
efficiency and results; a fanbase cares about hope, stars, and whether the
team is trending somewhere. This is the single biggest genuinely-new mechanic
in this proposal (Part 3.2).

### 1.4 Overlap review (goal #8)

| System                                       | Owns today                                                                                       | Verdict                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **News feed** (`NewsFeed.tsx`)               | The full `LeagueTransaction` log, league-wide                                                    | **Direct overlap.** The current "Fan Reactions" section is the same rows with a prefix. Fans page must stop being a second news feed. |
| **Home Dashboard** (`leagues/[id]/page.tsx`) | GM Job Security, Franchise Finances summary, Future Financial Flexibility                        | No fan content today. Correctly stays the "how am I doing as GM" page.                                                                |
| **Finances** (`/finances/*`)                 | Attendance %, popularity, season-ticket base, ticket pricing lever, merchandise-adjacent revenue | **Direct overlap.** Attendance and popularity already appear on `/finances/report` as _revenue drivers_.                              |
| **Front Office Inbox**                       | Interactive business decisions with explicit fan-happiness deltas per option                     | **This is where "preview consequences" already lives** - see Part 4.                                                                  |
| **Player Profiles**                          | Individual player narrative                                                                      | Franchise-icon status is relevant to fans; profile stays owner of per-player detail.                                                  |

**Conclusions from the overlap review:**

1. **Attendance and Merchandise should leave the Fans page.** They are
   revenue outputs, and `/finances` already presents them as such. Keeping
   them here is the "two pages solving the same problem" failure the request
   warns about. The Fans page should _reference_ attendance as evidence
   ("the building is 78% full - fans are voting with their wallets") but not
   present it as a headline stat it owns.
2. **The reaction feed must not duplicate the News feed.** It should become
   _interpretation_ of events, not a relisting of them (Part 3.4).
3. **Franchise Popularity is genuinely shared** - it's a fan concept that
   finances consume. Fans page owns explaining it; finances owns spending it.

---

## Part 2 - What's fundamentally wrong (the ruthless version)

1. **Three fake metrics.** Attendance/Merchandise/Season Tickets are one
   number relabeled. Presenting them as a 3-card row implies three
   independent signals. This is misleading UI.
2. **No causality.** The page's entire job should be answering "why," and it
   answers "what."
3. **The reaction feed is a lookup table, not a reaction.** `TRADE -> "Fans
are buzzing"` fires identically whether you fleeced a rival or gutted your
   roster - even though `computeTradeSentimentDelta` **already knows which**.
   This is the most jarring immersion break on the page.
4. **No forward-looking content whatsoever.** Nothing on the page helps any
   future decision.
5. **No franchise identity.** A 20-year dynasty and a 3-year expansion team
   render identically.
6. **Season-granularity history only.** `FanHappinessSnapshot` is written
   once per season, so the chart can't show an in-season collapse.

---

## Part 3 - The redesign

### 3.0 Purpose of this page (the one sentence)

> **The Fans page is the franchise's conscience: it tells you who this city
> has become, why it feels the way it does about what you've done, and what
> it will cost you to defy it.**

That sentence is doing specific work, and each clause maps to a section:

- _"who this city has become"_ - Fan Culture (3.1a), the decades-long identity.
- _"why it feels the way it does about what you've done"_ - the sentiment
  ledger (3.3), the causal record.
- _"what it will cost you to defy it"_ - the mandate and standing forecast
  (3.2), the forward-looking pressure.

**Responsibility boundaries** (goal #8) - each page owns exactly one verdict:

| Page                   | The question it uniquely answers                                         |
| ---------------------- | ------------------------------------------------------------------------ |
| **Home Dashboard**     | _Is my job safe?_ - the **owner's** verdict on me.                       |
| **Finances**           | _Can I afford it?_ - the **money** consequence.                          |
| **News**               | _What happened?_ - the **factual record**, league-wide.                  |
| **Front Office Inbox** | _What must I decide right now?_ - **pending choices**.                   |
| **Fans**               | _Who are we, and what do they want from me?_ - the **public's** verdict. |

The clean test: if a fact answers "is my job safe" it belongs on Home; if it
answers "what did it cost" it belongs on Finances; if it answers "what
happened" it belongs on News; **only if it answers "how does the city feel
about who we are" does it belong here.** Attendance fails that test as a
headline (it's a revenue signal) but passes as evidence (it's the city voting
with its wallet), which is exactly the treatment Part 5 gives it.

### 3.1a Fan Culture - the fanbase as a living entity (goal #4)

The core insight: **mood is weather, culture is climate.** Fan Happiness
already models weather and swings week to week. Culture is what a city becomes
after twenty years of being treated a certain way, and it should move _slowly_,
persist across GM tenures, and change how the same event is interpreted.

Three separate, slow-moving traits - not one "culture type" enum. A single
enum would collapse a rich space into a label; three axes generate genuinely
different fanbases that combine in ways I don't have to enumerate by hand.

**All three are derived from history that already persists** - per-season
playoff depth via `computeActualOutcome` over permanent `PlayoffSeries` rows,
`FanHappinessSnapshot` history, franchise-icon tenure, market size, and
relocation state. Nothing here is authored or invented.

#### Trait 1: Patience (0-100) - how long this city waits before it turns

- **Rises** with: rebuilds that visibly paid off (a down stretch followed by
  real improvement), long tenures of stability, small-market identity.
- **Falls** with: repeated rebuilds that went nowhere, promises broken
  (contending rosters that collapsed), sustained irrelevance.
- **Effect:** scales the _magnitude_ of negative sentiment events. The same
  60-loss season costs a patient fanbase far less than an impatient one. It
  also gates which mandates can be active - `BE_PATIENT_WITH_THE_KIDS` is
  unavailable to a fanbase whose patience is spent, which is the mechanically
  interesting part: **you can run out of the ability to rebuild.**

#### Trait 2: Expectation Ceiling (0-100) - what this city considers success

- **Rises** with: championships, deep playoff runs, sustained contention,
  star power, large market.
- **Falls** slowly with: long stretches of irrelevance (a proud fanbase
  eventually forgets, but slowly - this is the trait with the most memory).
- **Effect:** the reference point every result is judged against. A 48-win
  season is a triumph in one city and a fireable offense in another, _from
  identical inputs_. This is the trait that makes a dynasty's fanbase
  genuinely exhausting to serve - by design.

#### Trait 3: Loyalty (0-100) - how much benefit of the doubt you get

- **Rises** with: keeping homegrown stars, franchise icons who stayed,
  continuity, small-market identity.
- **Falls** with: trading beloved players, relocation, gouging on ticket
  prices, treating the roster as fungible assets.
- **Effect:** dampens the _volatility_ of happiness in both directions - a
  loyal fanbase doesn't spike as high on a good week or crater as hard on a
  bad one. It also sets the floor happiness can decay to. Low loyalty means a
  fanbase that leaves the moment things go badly.

#### Why three axes instead of one label

They compose into recognizable, distinct fan cultures without me enumerating
them:

| Patience | Ceiling | Loyalty | Reads as                                                                               |
| -------- | ------- | ------- | -------------------------------------------------------------------------------------- |
| Low      | High    | High    | **Championship-or-bust dynasty** - demanding, but they'll never abandon you            |
| High     | Low     | High    | **Small-market underdog** - grateful, forgiving, deeply attached                       |
| Low      | High    | Low     | **Large-market frontrunner** - ruthless, fickle, empties the building                  |
| High     | Low     | Low     | **Apathetic** - nobody's angry because nobody's watching. The hardest state to escape. |
| High     | High    | High    | **Proud traditional power** - patient because they trust the institution               |

The four-quadrant table isn't a lookup - it's an illustration of what the
continuous space produces. A save can sit anywhere in it and drift over
decades.

#### How culture actually changes the simulation (not just flavor)

This is the difference between "personality" and a cosmetic label. Culture
must feed back into real mechanics or it's decoration:

1. **Sentiment magnitude scaling.** Patience and Loyalty scale incoming
   sentiment deltas (`sentimentEvents.ts` outputs) before they're applied -
   the same trade genuinely moves two different fanbases differently.
2. **Mandate availability.** Expectation Ceiling and Patience gate which
   `FanMandate` can be active (3.2). A high-ceiling, low-patience city can
   never issue `BE_PATIENT_WITH_THE_KIDS`.
3. **Happiness floor and volatility.** Loyalty sets how low happiness decays
   and how sharply it swings.
4. **Narrative and reaction voice.** The same event produces different copy -
   a loyal small-market fanbase mourns a traded icon; a fickle big-market one
   is already debating the next target.

**Deliberately NOT wired into**: owner confidence, job security, or roster
decisions. Culture changes how the _public_ reacts, never how ownership
judges you - that separation is the whole point of Part 3.0's boundary table.

#### Persistence and derivation

New model **`FanCulture`** (one row per `LeagueTeam`): the three traits plus
`lastRecomputedSeason`. Recomputed once per season boundary in
`advanceSeasonAction` from the franchise's full history - not incrementally
nudged, so it can never drift out of sync with the record that justifies it,
and so the page can always explain each trait with the real facts behind it.

Backfill for existing saves derives from history already in the database, so
a 15-season save immediately gets a culture that reflects those 15 seasons
rather than starting neutral.

### 3.1 Section 1: "The Mood" - one honest headline, with direction

Replaces the 2-card + 3-card stat blocks.

- **One primary number: Fan Happiness**, with (a) a trend arrow vs. 5 games
  ago and vs. last season, and (b) a plain-language mood label driven by
  happiness _and_ trajectory - "Restless," "Bought In," "Euphoric,"
  "Turning On You," "Patient." A fanbase at 55 and climbing is a completely
  different room than 55 and falling; one number can't say that, and today's
  page doesn't try.
- **Franchise Popularity** stays as a secondary stat (national relevance -
  genuinely distinct from local happiness).
- **Attendance moves to a single evidence line**, not a card: "78% full -
  down from 91% two seasons ago." It's proof, not a metric this page owns.
- **Merchandise and Season Tickets cards are deleted.** They're duplicated
  finance concepts wearing fan clothing.

### 3.2 Section 2: "What the City Wants" - the genuinely new mechanic

This is the answer to goal #2, and the biggest new system here.

A new **`FanMandate`** - what the _fanbase_ (not the owner) currently wants,
derived from real state, not authored:

| Mandate                    | Derived from                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| `BE_PATIENT_WITH_THE_KIDS` | young roster + recent lottery picks + fans already accepted a rebuild       |
| `SHOW_ME_PROGRESS`         | 2+ seasons of rebuilding with no visible improvement                        |
| `WIN_NOW`                  | veteran core in its window, recent playoff appearances                      |
| `CHAMPIONSHIP_OR_BUST`     | title favorite, or recent Finals appearance                                 |
| `GIVE_US_A_REASON_TO_CARE` | sustained irrelevance - no playoffs, no stars, low popularity               |
| `KEEP_OUR_GUY`             | a genuine franchise icon on the roster (reuses `computeFranchiseIconScore`) |

**Culture gates which mandates are reachable** (see 3.1a). Roster state alone
doesn't decide the mandate - the same young roster produces
`BE_PATIENT_WITH_THE_KIDS` in a patient city and `SHOW_ME_PROGRESS` (or
outright `WIN_NOW`) in one whose patience is spent. A high Expectation Ceiling
puts a floor under how modest the mandate can be: a former dynasty's fanbase
will not accept "develop young players" as an aspiration, no matter how young
the roster is. **This is the mechanism that makes two franchises in identical
roster situations demand genuinely different things.**

Deliberately **distinct from `ExpectationLevel`** (ownership's payroll-driven
bar). The tension between them is the interesting part: your owner wants
payroll cut, your fans want you to keep their icon. That conflict is real
gameplay, and it emerges free from having two separate models.

Rendered as: the current mandate, _why_ it's the mandate (2-3 real
contributing facts), and **how it's changing** ("Two more seasons without a
playoff berth and patience runs out").

Each mandate carries a **satisfaction score** - are you currently serving it?
That's the "how are expectations changing" answer, and it drives Section 3.

### 3.3 Section 3: "Why They Feel This Way" - the sentiment ledger

The direct answer to goal #1, and the payoff for the finding in 1.2.

**New model: `FanSentimentEvent`** - one row per real sentiment-moving event,
written at the _same call sites that already compute the delta today_. Fields:
`leagueId`, `leagueTeamId`, `season`, `dayIndex`, `kind`, `delta`,
`description`, optional `leaguePlayerId`.

This requires **no new sentiment logic** - every value already exists at every
call site listed in 1.2. It is purely persisting what's currently discarded.

The section renders:

- **Top positive and negative contributors this season**, sorted by absolute
  delta, each with its real number: _"Traded Marcus Reed - the fanbase's
  franchise icon: -9"_, _"11-game winning streak: +4"_, _"Raised ticket
  prices to Premium: -3."_
- Grouped into **themes** ("On the court," "Front office moves," "The
  business side") so the story reads as a narrative, not a bank statement.

This also unlocks a genuine **in-season** trend line (dayIndex granularity),
fixing the season-only-snapshot limitation from Part 2.6.

### 3.4 Section 4: "The Conversation" - real reactions, not a lookup table

Replaces the prefix-a-transaction feed. Two kinds of content:

1. **Reactions that read the actual delta.** The same trade now generates
   _"You robbed them."_ at +6 and _"They gutted us for cap space."_ at -6 -
   using `computeTradeSentimentDelta`'s existing output, which the current
   code already has and ignores. **This alone fixes the worst immersion break
   on the page.**
2. **Media narratives** - a small number of _persistent, multi-week_ storylines
   rather than one-off blurbs: "The Reed Trade Fallout," "Is This Rebuild
   Working?", "Championship Window Watch." A narrative opens when its
   triggering condition holds, stays open while it holds, and closes with a
   resolution beat. This is what makes it read like a real fanbase rather than
   an event log, and it's the clearest separation from the News feed: **News
   reports events; Fans interprets them into ongoing storylines.**

Volume is deliberately capped - a handful of live narratives, not a wall.

### 3.5 Section 5: "Franchise Memory" - personality (goal #4)

A short, permanent list of the moments this fanbase will not forget:
championships, a franchise icon traded away, a 60-loss collapse, a relocation,
a #1 pick who busted. Sourced from data that already exists
(`LeagueTransaction` at BREAKING/MAJOR importance, `CareerRecord`,
`relocatedAtSeason`, franchise-icon departures).

This is what makes a 20-year save's fanbase feel different from a fresh one,
and it's nearly free - it's a curated read over history already persisted.

---

## Part 4 - "Preview consequences" (goal #6): mostly belongs elsewhere

**Recommendation: split it, and put most of it at the point of decision.**

The request explicitly invites this answer, and the overlap review supports it:

- **At the point of decision (not the Fans page).** A fan-impact estimate
  belongs _in the Trade Builder_, _next to the ticket-pricing control_, and
  _on the rebuild/expectation choice_. A player about to trade their icon
  needs the warning in the Trade Builder - not on a page they'd have to think
  to visit first. Making them go check the Fans page and come back is exactly
  the "click-heavy busywork" the constraints forbid.
  - Precedent already exists: **the Front Office Inbox already shows explicit
    fan-happiness deltas per option** (`BusinessDecisionInbox.tsx` renders
    "Fans +3 / -2" chips). This is the established pattern; extend it rather
    than invent a parallel one.
  - This is cheap: `computeTradeSentimentDelta` etc. are pure functions
    already taking exactly the inputs a preview would have.
- **On the Fans page: the _standing_ forecast, not per-move previews.** What
  belongs here is "what would move this fanbase right now" in the abstract -
  e.g. _"This fanbase would forgive a bad season. It would not forgive trading
  Reed."_ That's mandate-driven context that helps you plan, and it can't live
  at any single decision point because it isn't about any single decision.

So: **per-decision previews ship at their decision sites; the Fans page owns
the standing forecast.** Both draw on the same pure functions.

---

## Part 5 - What leaves the page

| Element                          | Fate                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Attendance card                  | **Moved** - stays a headline on `/finances/report`; appears here only as an evidence line                  |
| Merchandise card                 | **Deleted** - relabeled popularity tier, no independent signal; the revenue side already lives in finances |
| Season Tickets card              | **Deleted from here** - `seasonTicketBase` is a finance lever, already on `/finances/operations`           |
| "Fan Reactions" transaction feed | **Replaced** by delta-aware reactions + media narratives (3.4); raw event log stays the News feed's job    |
| Fan Happiness raw number         | **Kept**, but reframed with trend + mood label                                                             |
| Franchise Popularity             | **Kept** as secondary (genuine national-relevance signal)                                                  |

---

## Part 6 - Overlap check on every new thing proposed

| New element                   | Overlaps? | Justification                                                                                                                                                  |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FanCulture` model (3 traits) | No        | Nothing models a fanbase's decades-long identity. Derived from existing persisted history; feeds only public reaction, never owner confidence or job security. |
| `FanSentimentEvent` model     | No        | Persists deltas that are computed-then-discarded today. No new simulation.                                                                                     |
| `FanMandate`                  | No        | `ExpectationLevel` is ownership's payroll-driven bar; this is the fanbase's. The conflict between them is the feature.                                         |
| Mood label + trend            | No        | Pure presentation over existing + new data.                                                                                                                    |
| Delta-aware reactions         | Replaces  | Strictly better version of `fanReactions.ts`, using data that already exists.                                                                                  |
| Media narratives              | No        | News = events; Fans = ongoing interpretation. Volume-capped.                                                                                                   |
| Franchise Memory              | No        | Curated read over existing history; nothing else presents a franchise's permanent emotional record.                                                            |
| Per-decision fan previews     | Extends   | Same pattern the Front Office Inbox already established. Ships at decision sites, not here.                                                                    |

**Nothing proposed adds a button whose only purpose is to be clicked.** The
page stays read-only; its value is comprehension and foresight.

---

## Part 7 - Proposed phasing

Each phase is independently shippable and hand-testable.

- **Phase 1 - The sentiment ledger.** `FanSentimentEvent` model + writes at
  the ~10 existing call sites + Section 3 ("Why They Feel This Way") + the
  in-season trend line. **Highest value per unit of work in the whole
  proposal** - it turns the page from "what" to "why" and everything else
  builds on it. Includes backfill for existing saves (seed from
  `LeagueTransaction` history so a save mid-flight isn't blank).
- **Phase 2 - The Mood + delta-aware reactions.** Section 1 rebuild, mood
  labels, trend arrows; rewrite `fanReactions.ts` to read real deltas.
  Deletes the three fake metric cards.
- **Phase 3 - Fan Culture.** The `FanCulture` model, the three-trait
  derivation from franchise history, the season-boundary recompute, backfill
  from existing saves' history, and wiring culture into sentiment magnitude /
  happiness volatility. Section 1a on the page, explaining each trait with the
  real facts behind it.
- **Phase 4 - What the City Wants.** The `FanMandate` model + derivation
  (culture-gated, per 3.2) + satisfaction scoring + Section 2. Sequenced after
  culture because mandate availability depends on it.
- **Phase 5 - Narratives + Franchise Memory.** Sections 4 and 5, with
  culture-aware reaction voice.
- **Phase 6 - Decision-site previews.** Trade Builder fan-impact estimate,
  ticket-pricing preview, and the Fans-page standing forecast - all
  culture-aware, so the previewed number is the one this specific fanbase
  would actually feel.

Existing-save backfill is built into every phase, not deferred.
