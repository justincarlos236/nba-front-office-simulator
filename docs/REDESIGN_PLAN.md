# Redesign Plan — audit findings as acceptance criteria

The design audit (2026-08-08) produced a P0-P3 roadmap. Rather than finishing
that roadmap as a separate cleanup phase and then redesigning the same
surfaces, the remaining work is folded into the visual overhaul: each surface
owns its audit findings as acceptance criteria.

**This file is the ledger.** A finding is not "done" because a surface was
redesigned; it is done when the redesigned surface demonstrably solves it.

**Status (re-verified against the code 2026-08-09): all P0s closed, one P1
remaining.** That P1 is the canonical roster page, deliberately deferred. Nine
P2s and two P3s remain, all of them scope additions (competing free-agent
offers, incoming CPU trade offers, cross-session scouting summary) rather than
defects. Several findings had in fact been fixed by the surface redesigns
without the ledger being updated — a stale ledger is how finished work gets
redone, so each entry below was checked against the source before being marked.

## Sequence — the redesign (complete)

| #   | Step                                                                         | Status   |
| --- | ---------------------------------------------------------------------------- | -------- |
| 1   | Remaining P0 confirmations                                                   | **done** |
| 2   | Revert P1 implementations built around the old dashboard composition         | **done** |
| 3   | Continuity schema (`lastSeenAt` + read state)                                | **done** |
| 4   | Choose the visual world — **The Wire**, locked                               | **done** |
| 5   | Primitive/component layer + focus tokens + semantic colors                   | **done** |
| 6   | Dashboard redesign (Desk)                                                    | **done** |
| 7   | Trade outcome, Draft Night header, free agency                               | **done** |
| 8   | Cross-cutting: attention model, nav regrouping, orphan routes, error mapping | **done** |
| 9   | Migration pass — 123 files off the legacy palette                            | **done** |
| 10  | Responsive pass, boundaries (`not-found`/`error`/`loading`)                  | **done** |

Side quest: the transactions page rebuilt as a real wire (season filing,
four importance registers, sticky filter rail).

Still open from step 10: **`docs/ROADMAP.md` is stale** — it omits roughly half
the shipped product (Finances, Fans, Staff, Career Mode, All-Star, Morale,
Scouting) and still lists the season simulation engine as an unbuilt stretch
goal.

## Visual richness operation (in progress)

Restore point before any of this work: branch `pre-visual-richness`, tag
`pre-visual-richness-v1`, both at commit `c34275c`.

The 28-item Visual Possibility Audit is the master idea pool. **18 committed**
across Phases A–E; 8 backlog; 2 rejected.

| Phase | Contents                                                                                | Status                                                            |
| ----- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A** | Icon set, cap gauge, transaction stamps, roster shape, season ribbon, contract ladder   | **done** (`7d1d264`, fixes `a2c8690`)                             |
| **B** | Contract documents, league-office rulings, ownership letters, draft cards               | **done**                                                          |
| **C** | Championship banner rafters, trophy cabinet, retired numbers, franchise-memory timeline | **done** (`46c46ca`)                                              |
| **D** | Material texture, franchise skylines, GM office framing, phase light                    | **done** (`fdd946e`, `2a0f0ed`, `ae265b3`) — photography deferred |
| **E** | Scouting report as Artifact, draft board as a wall                                      | **done** (`779ee86`)                                              |

Phase D's authored layer is complete; the photography slots are specified in
`docs/PHOTO_SOURCING_BRIEF.md` and are waiting on image selection. Only four
surfaces take photography at all — the dashboard header uses the authored
office window instead, since a stock arena photo would show the same building
for all 30 franchises.

**The Phase D lesson, worth keeping alongside Phase A's.** The first skyline
grammar — "flat-topped rectilinear masses by default; a curve or spire spent
only where a city genuinely reads by it" — made generic buildings the default
and the landmark the exception, and produced 30 interchangeable cities. Every
one passed its tests (closed, unique, in-bounds) because none of those
properties say anything about whether a city looks like itself. Restructuring
into signature/support/field made the hierarchy enforceable, and those tests
immediately caught eight real composition errors. **Test the property that
matters, not the property that is easy to check.**

**Backlog** (deliberately uncommitted): tunnel imagery, press credential,
lower-third broadcast bars, live-game score bug, trade-value balance scale,
playoff bracket as broadcast graphic.

**Rejected**: procedurally generated prospect portraits (5,000 fictional
players, uncanny-valley risk — monogram tiles solve it better); fan-sentiment
crowd visual (decorative, no informational gain over the existing ledger).

### Phase A lesson, worth keeping

The cap gauge shipped arithmetically correct and visually useless: anchored at
$0, two thirds of the track was empty and all four CBA thresholds crushed into
a sliver, so a team past the first apron rendered with its marker near the left
end. Typecheck, lint, 1,135 tests, the production build and the design detector
all passed on it. **Only a screenshot caught it.** `capGaugeScale.test.ts` now
locks the window. Automated checks cannot see composition — every phase needs a
real look before it is called done.

### Amendments to DESIGN.md — all applied

1. **The Artifact Exception.** A contract sheet, draft card or scouting card is
   a physical object and may carry material/edge; interface surfaces still may
   not. Paper grain is applied inside `Artifact` itself and deliberately not
   exposed on `Field`.
2. **Broadcast imagery clause.** Broadcast surfaces may carry full-bleed
   photography; Desk/Workbench/Ledger may not. Halftone screens it so an image
   reads as reproduced in a document rather than pasted into a webpage.
3. **A sixth archetype: Artifact.** Rendered physical documents — contracts,
   draft cards, credentials, banners. Not Broadcast (not a moment), not Record
   (not editorial).

Phase D added four more: the Window Rule, the Grain Rule, the Weather Rule and
the Threshold Rule, plus **One Landmark, Two Companions** for the skylines.

## Closed before the redesign

**P0 — irreversible actions and correctness**

- [x] `advanceSeasonAction` returned `fired: true`; the UI ignored it and printed
      "Welcome to the {next} season" while the franchise ended permanently.
      Now read, with a confirmation at CRITICAL job security that names the stake.
- [x] Trade execution had no confirmation and redirected to the dashboard,
      discarding computed fan sentiment and icon-departure fallout. Now resolves
      onto a durable outcome route with an immutable cap snapshot.
- [x] Free-agent signing had no confirmation. Now states player, years, per-season
      salary, and total commitment before it lands.
- [x] Draft pick had no confirmation. Now confirms by name; the board is a dense
      list of similar rows and a mis-click cost a first-rounder with no undo.
- [x] Draft lottery: deliberately _not_ gated. The user navigates to a dedicated
      page and clicks "Start the Lottery" - unambiguous intent. What was missing
      was that the draw is one-time; that is now stated.

## Owned by surface redesigns (steps 6-7)

### League dashboard — **redesigned (step 6)**

- [x] **P0** Phase never named inside a save. Now a `PhaseIndicator` directly
      under the franchise header, naming the phase and what it expects
      ("PRE-DRAFT / SCOUT THE CLASS").
- [x] **P0** No sim control. `SimulateControls` now renders on the dashboard
      directly beneath "Needs you", and gained the product's first `aria-live`
      region for its result.
- [x] **P1** Working memory. Cap space, standing, and roster count now live in
      the persistent figure rail, with cap space at display scale.
- [x] **P1** No visual hierarchy. Replaced with an explicit order: franchise
      header (full-bleed team colour) → phase → dispatch → needs you → season
      control, with flexibility and roster demoted below the decision layer.
- [x] **P1** No re-orientation. `SinceYouLeft` reads the `lastSeenAt` diff and
      renders "While you were away · N days" with BREAKING/MAJOR headlines;
      renders nothing on a first visit rather than showing an empty shell.
- [x] **P2** Status badges using `sky`/`purple` as category colour. All four
      badge-class maps replaced by the semantic `Status` primitive.
- [ ] **P1** No canonical roster page. _Deferred to step 9_ — the dashboard
      roster table is now a proper Ledger, but `/rotation` still splits the job
      and the sub-nav still has no "Roster" entry.

### Draft night + lottery

- [x] **P1** `/draft/lottery` has no return edge to `/draft`. Returns to
      `/leagues/{id}/draft`.
- [x] **P1** Scouting report rendered as six undifferentiated lines despite a
      five-tier confidence model with an UNCERTAIN state per axis. Now an
      Artifact where confidence drives the typography (Phase E).
- [x] **P1** Draft board was a vertical list of made picks — the shape of a
      transaction feed. Now a wall: a full round at a glance, own picks
      outlined, undecided picks drawn as slots (Phase E).
- [ ] **P2** Scouting has no cross-session summary ("you scouted 6 of 12").

### Trade outcome

- [x] **P1** Structurally sound, visually plain: built inside the old world and
      shares the generic page skeleton. Rebuilt in the new world — Broadcast on
      execution, Record on revisit, with the register scaling to what actually
      moved (a blockbuster splits the screen between two franchise colours; a
      rotation swap files as a ruled record). Carries an immutable
      `Trade.capSnapshot` so the cap consequence is evidence, not a recompute.

### Free agency

- [x] **P1** 77+ rows, no filters. `FreeAgentBoard` now has position filter,
      name search, affordable-only, rights-only and sort.
- [x] **P1** "Est. value" without the cap space that makes it meaningful. Cap
      space is passed in and drives the affordable-only filter.
- [x] **P2** No competing offers; a free agent waits indefinitely, draining
      urgency. Rival clubs now show as competition on the board (derived from
      their cap space and roster holes) **and** actually sign, via the same
      interest model, on season advance - so the pressure the board shows is
      pressure the game honours.

### Trade builder

- [x] **P1** Partner browse is a flat 30-card grid with no cap space or needs.
      Now a Ledger with a cap-space column and each team's computed needs.
- [ ] **P2** No incoming CPU offers; trade is outbound-only.
- [x] **P2** Raw engine `error.message` rendered as UI copy. Replaced by
      `userFacing.ts` translation and league-office rulings.

### Finances

- [x] **P1** Business decision inbox rendered twice with identical actions. The
      overview now surfaces only the two most urgent and links to the full inbox.
- [ ] **P2** "Projected this season" duplicated verbatim across two tabs.

## Cross-cutting (step 8) — belongs to no single surface

- [x] **P0** Notification fragmentation: 7 surfaces try to tell the user
      something; exactly 1 badge exists, and it is inside the section it
      describes. `getLeagueAttention()` is now the single source for nav counts,
      consumed by the league layout, so a blocking decision is visible from the
      sub-nav.
- [ ] **P2** Focus states: `grep focus-visible` returns zero results
      product-wide. 13 ARIA attributes across 95 buttons and ~40 routes; zero
      `aria-live` regions across 37 server actions. Binding, per PRODUCT.md's
      WCAG 2.2 AA commitment.
- [ ] **P2** Nav: 14 targets in one wrapping row in every phase, 9-10 of them an
      undifferentiated muted list. Needs grouping (Team / League / Business).
- [ ] **P2** `/all-star` is a blocking phase gate that appears in no navigation.
- [ ] **P2** `job-security-critical` links to an anchor on its own page.
- [ ] **P2** Sub-nav "News" points to `/transactions`, titled "Transactions & News".
- [ ] **P3** Raw `err.message` is the universal error UI across all server actions.
- [ ] **P3** Terminal pages with no outbound links: `/fans` (deepest page in the
      product, zero exits), `/leaders`, `/finances/report|operations|arena`,
      `/players/[id]`, `/career`.

## Foundational (steps 3, 5) — must precede surface redesigns

- [ ] **Step 3** Continuity schema. No `lastSeenAt`, `unread`, or read-state
      field exists across 49 models, so returning-player re-orientation is
      currently impossible to build. `League.updatedAt` already supports "last
      played"; the diff needs a read boundary.
- [ ] **Step 5** Primitive component layer. There is no `Button`, `Card`,
      `Input`, or `Badge`; consistency depends on repeating utility strings,
      which is why color and radius hold while focus and status drift (294 raw
      Tailwind color uses across 12 hues against an 8-token palette).

## Deferred deliberately

- Multiple saves per user, GitHub OAuth, the AI GM assistant - product roadmap
  items, not audit findings.
- `ROADMAP.md` omits roughly half the shipped product (Finances, Fans, Staff,
  Career Mode, All-Star, Morale, Scouting). Step 10.
