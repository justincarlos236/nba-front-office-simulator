# Onboarding & New-Player Experience — Design

Status: **Phase 1 and Phase 2 built.**

- Phase 1 (keystone): `/guide` index, `/guide/roster`, `/guide/season-flow`
  (new), `/guide/finances` refactored onto a shared layout, and the
  `HowDoesThisWork` component + `GUIDE_TOPICS` registry replacing every
  hand-typed guide link in the app.
- Phase 2 (the heart of the design, Part 4B): every Action Center item now
  carries `reasoning`/`consequence`, rendered as a collapsed-by-default
  "Why is this recommended?" disclosure; the two dead-end items identified
  in the audit (`player-demanding-trade`, `player-trending-unhappy`) now
  have real destinations; a first-session rule fills the "how do I
  simulate games" gap; and a quiet-state "Did you know?" pointer shows
  only when the Action Center has nothing urgent to say.
- Phases 3-4 (jargon definitions, baselines, progressive disclosure) not
  yet started.

Goal, in the user's words: the simulator should feel like a polished AAA
management game, not a complex spreadsheet. Teach through UI, progressive
disclosure, advisor recommendations, contextual explanations, and natural
gameplay — **not** walls of text or forced pop-ups.

---

## Part 1 — Audit: what a first-time player actually hits

Traced the real flow rather than guessing: marketing page → sign-in →
`/leagues/new` (GM Job Market) → `createLeagueAction` → `/leagues/[id]`
dashboard → 13 sub-pages under a persistent sub-nav.

### 1.1 What is already good (and must not be re-solved)

This codebase is much further along than "no onboarding" implies. Prior
work already shipped the two things most such requests ask for:

- **Persistent phase-aware sub-nav** (`subNavSections.ts` +
  `leagues/[id]/layout.tsx`). Every section is always reachable; the
  phase only changes which are promoted. Nothing is hard-hidden.
- **The Action Center** (`lib/gm/actionCenter.ts`, 9 prioritized rules,
  top 3 shown). This is already a working "what do I do next" engine
  grounded in real state.
- **Deliberate jargon suppression.** `simplifyCapStatus` collapses the 5
  real apron levels into 3 casual-facing states. `CAP_STATUS_DESCRIPTION`,
  `JOB_SECURITY_DESCRIPTION`, `TEAM_IDENTITY_LABEL`,
  `JOB_SITUATION_DESCRIPTION` are all plain English.
- **A genuine plain-English guide** at `/guide/finances` (311 lines,
  anchor-linked, explicitly "no NBA CBA knowledge required").
- **The "How does this work?" link pattern** — the exact right primitive.

**A prior pass explicitly rejected a tutorial wizard:** it only helps
session one, gets skipped, and is a maintenance liability. That verdict
stands and this design does not overturn it.

So the problem is **not** "there's no onboarding." It is that the good
primitives are **unevenly applied and undiscoverable**.

### 1.2 The single most important finding

> **The teaching layer already exists — it was built for exactly one
> system (finances) and never generalized.**

The evidence:

- `"How does this work?"` appears **6 times in the entire app**, across
  **4 files**. All 6 point at `/guide/finances`.
- There is exactly **one** guide page. There is **no** `/guide` index —
  the knowledge base has one article and no front door.
- `grep` for `tooltip|onboard|tutorial|walkthrough` across all of
  `src/components` and `src/lib` returns **zero** UI primitives. Every
  match is an unrelated chart-tooltip or a code comment.

Ten-plus systems (morale, rotation minutes, fan culture, mandates,
scouting, staff, draft, All-Star, relocation, business decisions) have
**no** explanatory surface at all. This is the whole problem, and it means
the fix is mostly **extending a proven pattern**, not inventing a system.

### 1.3 Where a new player becomes confused (specific, ordered)

1. **The very first dashboard is silent about the core verb.**
   `simulateGamesAction` is reachable only from Standings and Schedule.
   A new GM lands on the dashboard and there is nothing that says _how you
   actually play games_. The Action Center's first-ever item on a fresh
   league is "You haven't set your rotation yet" — correct, but it never
   then says "…now go simulate."
2. **There is no welcome state.** `computeActionCenterItems` has no
   first-session rule (`grep` for `welcome|first` in that file: zero hits).
   Season 1, day 0 looks identical to season 6, day 40.
3. **The Job Market is the first screen and the densest.** Before the
   player has any context, `/leagues/new` asks them to weigh _reputation_,
   _job situation_ (5 tiers), and _leash length_ — and it gates teams
   behind a reputation number they've never seen explained. It reads as a
   difficulty selector but never says so.
4. **Pages have titles, not purposes.** Of 14 sub-pages, several open with
   a bare `<h1>` and no intro line at all (Standings, Leaders, Playoffs,
   Schedule, Finances). Rotation and Fans do this well — Rotation's intro
   is genuinely excellent and is the model to copy.
5. **Jargon leaks at the exact moment of highest stakes.** The suppression
   is real but incomplete: `SignOfferForm` surfaces Mid-Level Exception
   types, and `trades/new` names "salary matching, apron, no-trade-clause,
   and Stepien-rule" in one sentence. These are the two screens where a
   new player is most likely to make an irreversible mistake.
6. **Numbers without baselines.** Owner Confidence, Fan Happiness, Morale,
   GM Reputation are all 0–100 with no stated "good." Franchise value and
   cash appear with no sense of normal.

### 1.4 Introduced too early / never explained / assumes NBA knowledge

**Too early (present before it can matter):** the full Finances pillar and
Front Office Inbox, Future Financial Flexibility (a 4-year projection at
day 0), relocation, and staff specialization — all live and prominent
before the player has simulated a single game.

**Never explained anywhere:** morale and trade requests; what rotation
rank actually does to minutes; fan culture's three axes and mandates
(brand new, zero explanatory surface); scouting confidence; staff role
effects; draft pick protections; the business-decision inbox.

**Assumes NBA knowledge:** the apron/tax ladder; Bird rights and re-signing
advantage; why a lottery exists and how odds work; two-way and minimum
contracts; the trade deadline's significance; "Stepien rule."

**Should stay implicit (teach by play, never tutorialize):** that losing
improves lottery odds; that stars drive attendance and revenue; that
overpaying now limits you later; that fans have longer memories than
owners. These are the _discoveries_ that make the sim worth replaying —
explaining them upfront destroys them.

---

## Part 2 — The onboarding philosophy

Five principles, in priority order. Every proposal below must trace to one.

1. **Explain on demand, at the point of confusion — never on a schedule.**
   The player asks; the game answers. No forced modal ever blocks play.
2. **The game already knows what you're doing. Teaching is a property of
   state, not a script.** Guidance is derived from live league state the
   same way the Action Center already is — so it's automatically correct
   at season 1 _and_ season 20, and it can never desync from the sim.
3. **One concept, one home, one link.** Every mechanic gets exactly one
   canonical explanation. Everywhere else links to it. This is the single
   rule that prevents onboarding from becoming a duplicate documentation
   set that rots.
4. **Introduce a system the first time it's real, not the first time it
   exists.** Depth is revealed by the calendar and by consequence, not
   dumped at franchise creation.
5. **Onboarding that can't be turned off is a bug.** Everything is
   dismissible, and one switch disables all of it permanently.

**The anti-goal, stated plainly:** no tutorial that reads like a manual, no
coach-mark chain the player clicks through blind, no "Got it!" pop-ups, and
no second copy of information that already lives in the UI.

---

## Part 3 — The player's journey

### Beat 1 — Franchise creation (`/leagues/new`)

Reframe the Job Market as what it already secretly is: **the difficulty
selector**. Currently it presents rep/situation/leash as three unexplained
axes. Change: one honest line above the grid explaining that _where you
take a job is the difficulty setting_ — a rebuild is forgiving and patient,
a contender is short-leashed and unforgiving. Add a "New to this?" hint on
the lowest-pressure available jobs.

No new wizard, no team-picker questionnaire. The screen already exists and
is already good; it just needs to say what it means.

### Beat 2 — First dashboard (the highest-leverage single change)

Add a **first-session Action Center rule** — the welcome moment rides the
mechanism that already exists (exactly as the 2026-07-25 pass anticipated:
_"a first-time user's welcome moment can ride the same Action Center
mechanism rather than needing a second, parallel tutorial system"_).

On a brand-new league it presents, in order: _this is your roster and your
owner's expectation_ → _set your rotation_ → _simulate your first games_.
That third item is the missing link — it's the first time the app ever
tells the player how to play.

Everything else on the dashboard stays exactly as it is.

### Beat 3 — First simulated games

No teaching UI. This is where principle 4 pays off: the player watches
results happen. The only addition is that outcomes already generate
news/fan reactions — those are the teacher.

### Beat 4 — First real decision (injury, trade offer, expiring contract)

Contextual explanation at the decision site. The player is _already_
looking at the thing; a "How does this work?" beside it is the entire
mechanic. This is where the existing pattern gets extended to trades,
free agency, morale, and the inbox.

### Beat 5 — First offseason

The densest moment in the game and currently the least explained. The
offseason page gets a purpose line and stage-by-stage context, reusing the
existing phase module rather than inventing a new sequencer.

### Beat 6 — Season 2 onward

Guidance naturally goes quiet: state-derived items stop firing once the
player has done the thing. Returning-player reminders are handled by the
same Action Center, not by a separate "you've been away" system.

---

## Part 4 — The concrete changes

Ordered by value-per-unit-of-work. Each names its home so nothing
duplicates.

### 4.1 A real `HowDoesThisWork` primitive + a `/guide` index

The keystone. One small component, one canonical concept registry, one
index page. Every explanation in the app resolves to a single anchor —
this is principle 3 made mechanical, and it is what stops the knowledge
base from becoming a second, rotting copy of the UI.

Extends the existing `/guide/finances` rather than replacing it; that page
becomes one article among several.

### 4.2 Page purpose lines on every page that lacks one

Copy the Rotation page's model. One sentence per page: what this page is
for and what decision it supports. Cheapest, most AAA-feeling change in
the list.

### 4.3 The first-session Action Center rules (Beat 2)

Pure functions in the existing `actionCenter.ts`, unit-testable like the
other 9 rules. Includes the missing "simulate your first games" item.

### 4.4 Inline definitions for leaked jargon

Targeted at `SignOfferForm` and `trades/new` specifically — the two
highest-stakes screens. Not a global glossary sweep.

### 4.5 Baselines beside 0–100 numbers

A shared tier-label helper so Owner Confidence, Fan Happiness, and Morale
each say what "good" is. Reuses the existing label-map convention
(`JOB_SECURITY_LABEL`, `cultureLabels.ts`).

### 4.6 The GM Advisor

Deliberately **last**, and deliberately **small**: a state-derived
explanatory voice, not a chat bot and not a second recommendation engine.
The Action Center already owns _what to do next_; the Advisor only ever
explains _why the game is in the state it's in_. If it ever starts
recommending actions, it has become a duplicate of the Action Center and
should be cut.

Note: the AI GM assistant is **not built** (see `docs/ROADMAP.md`). This is
not that feature and must not silently become it.

### 4.7 Skip / disable

A single per-user preference that disables first-session items, purpose
lines' expandable detail, and the Advisor in one switch. Plus per-item
dismissal.

---

## Part 4B — Discoverability: how the four systems interlock

Added 2026-08-06 after a second review pass specifically on the question
_"how does a player who doesn't know what to ask ever learn?"_ This part
supersedes 4.1/4.3/4.6 where they conflict.

### 4B.1 The structural problem the first pass missed

Auditing all 15 Action Center rules against the "explain the reasoning"
idea surfaced something worse than a missing feature — **the Action Center
currently has nowhere to put an explanation, and three of its items are
already dead ends:**

- `job-security-critical` → `href: "#gm-job-security"` (an anchor on the
  same page)
- `player-demanding-trade` → `href: base` (the dashboard — i.e. _itself_)
- `player-trending-unhappy` → `href: base` (same), and its description
  says _"Check his personality tab"_ — a tab the item cannot link to

So the single most urgent item in the whole system (a star demanding a
trade, severity `critical`) links the player **back to the page they are
already on**. A new player clicks it and nothing happens. That is a
discoverability bug that exists _today_, independent of onboarding.

The cause is structural: `ActionCenterItem` is `{id, severity, label,
description, href}` and the whole card is a single `<Link>`. There is no
room in the type for _why_, and no room in the component for a second
interaction. Items that have no good destination are forced to invent one.

### 4B.2 The fix: items explain themselves

Extend `ActionCenterItem` with two optional fields:

- `reasoning` — _why the game is telling you this_, derived from the same
  state the rule already tested (it is right there in the rule body)
- `consequence` — _what happens if you ignore it_

Render as an expandable **"Why is this recommended?"** disclosure on the
card. Collapsed by default: zero added noise for an experienced player,
one click for a new one. This makes the card a two-target surface — the
label navigates, the disclosure teaches — which incidentally **fixes the
three dead-end items**, because an item whose real answer is "here's what's
happening" no longer needs to fake a destination.

Critically, this is nearly free: the reasoning is a string the rule can
already produce from variables it has in scope. It needs no new queries,
and it stays honest automatically because it is written next to the
condition that fired it.

### 4B.3 The three-layer teaching ladder

This is the answer to "how do the four systems work together." Each layer
answers a different question, and each hands off to the next:

| Layer | Question                     | Home                                 | Scope          |
| ----- | ---------------------------- | ------------------------------------ | -------------- |
| 1     | _What should I do next?_     | Action Center item label             | This click     |
| 2     | _Why, and what if I don't?_  | `reasoning` / `consequence`          | This situation |
| 3     | _How does this system work?_ | Guide article, via `HowDoesThisWork` | Forever        |

A new player rides the ladder without ever deciding to: they came for
layer 1, get curious, open layer 2, and layer 2 ends in a link to layer 3.
**Discoverability becomes a property of the path the player is already
walking** rather than something they must go searching for. That is the
whole mechanism, and it needs no new surface.

### 4B.4 What this does to the GM Advisor

It largely dissolves it — which is the right outcome.

Once every Action Center item explains its own reasoning and links to its
own guide article, the Advisor's entire stated job (_"explains mechanics
and offers strategic guidance"_) is already being done, **in context, at
the moment of the decision**, by systems that already exist. A separate
Advisor panel would be a worse copy: it would have to re-derive the state
the Action Center already computed, and it would sit on the dashboard
saying things the card three inches above it already said.

Revised position: **do not build an Advisor surface.** Build layer 2. If
after phases 1–3 there is still a real gap, the Advisor can be
reconsidered as a _voice_ (framing existing reasoning in a GM's words),
never as a _second recommendation engine_. This also keeps the paused AI
assistant (#5/#49) firmly untouched.

### 4B.5 Coverage, not just depth

Layer 2 only teaches what the Action Center happens to fire on. Two gaps
remain, both cheap:

- **Guide-article coverage.** 15 rules, but the guide has 8 anchors and
  all 8 are finances. Rules about morale, rotation, and staff have no
  layer-3 destination to hand off to. The `/guide` index (4.1) must be
  seeded with articles for the systems the Action Center actually cites —
  that pairing is what makes the ladder complete rather than decorative.
- **The quiet state.** When no items fire, the card says _"Nothing urgent
  right now."_ For a new player that is the moment they are most adrift.
  This is the natural, non-intrusive home for one rotating _"did you know"_
  pointer into the guide — shown **only** when nothing urgent is
  competing, so it can never interrupt real guidance.

### 4B.6 Why this stays non-intrusive

Every layer-2 and layer-3 surface is **pull, not push**: collapsed
disclosures and links. Nothing auto-opens, nothing blocks, nothing
sequences the player. The intrusive version of this feature would be a
tour that opens these explanations _for_ you; this design's position is
that the explanation should be one click away at all times and never
one click _in the way_.

---

## Part 5 — Overlap review (what this must NOT duplicate)

| Proposed                      | Overlaps with                            | Resolution                                                                                                     |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| First-session items           | Action Center                            | **Same system.** New rules in the existing module, not a parallel one.                                         |
| GM Advisor                    | Action Center                            | **Superseded by 4B.4** — the Advisor's job is absorbed into per-item `reasoning`. No Advisor surface is built. |
| GM Advisor                    | AI GM assistant (#5/#49)                 | That item is paused. Not resumed here, and 4B.4 removes the risk entirely.                                     |
| `reasoning`/`consequence`     | Guide articles                           | Layer 2 is _this situation_; layer 3 is _the system_. Layer 2 ends by linking to layer 3, never restating it.  |
| "Did you know" in quiet state | Action Center items                      | Mutually exclusive by construction — only renders when zero items fire.                                        |
| `/guide` index                | `/guide/finances`                        | Extends it; finances becomes one article.                                                                      |
| Purpose lines                 | Fans page purpose work                   | Fans already has one. Reuse, don't rewrite.                                                                    |
| Jargon definitions            | `simplifyCapStatus` etc.                 | Existing suppression stays authoritative; definitions only fill gaps.                                          |
| Baselines                     | `cultureLabels.ts`, `JOB_SECURITY_LABEL` | Reuse the convention; one shared helper.                                                                       |
| Tutorial wizard               | 2026-07-25 rejection                     | **Not proposed.** Verdict stands.                                                                              |

**Explicitly rejected:** a forced walkthrough; coach-mark tours; a modal
welcome; per-page tutorial state machines; a glossary that restates the
CBA; any onboarding copy that duplicates a number already on screen.

---

## Part 6 — Proposed phasing

| Phase | Scope                                                                                                           | Why here                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1     | `HowDoesThisWork` primitive + `/guide` index + articles for the systems the Action Center cites + purpose lines | The keystone. Layer 3 must exist before layer 2 can hand off to it. |
| 2     | `reasoning`/`consequence` on Action Center items + "Why is this recommended?" disclosure + first-session rules  | The heart of the design (4B.2). Also fixes the 3 dead-end items.    |
| 3     | Jargon inline definitions + 0–100 baselines                                                                     | Highest-stakes screens.                                             |
| 4     | Progressive disclosure + quiet-state "did you know"                                                             | Needs 1–3 in place.                                                 |
| 5     | Global disable switch                                                                                           | Small, and only meaningful once 1–4 exist.                          |

Revised 2026-08-06: phase 2 now carries the layer-2 work and is the most
valuable phase in the plan; the former phase-5 GM Advisor is **removed**
per 4B.4 rather than deferred. Phases 1–2 together resolve most of Part
1.3 and all of the dead-end bugs in 4B.1.
