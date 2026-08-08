# Redesign Plan — audit findings as acceptance criteria

The design audit (2026-08-08) produced a P0-P3 roadmap. Rather than finishing
that roadmap as a separate cleanup phase and then redesigning the same
surfaces, the remaining work is folded into the visual overhaul: each surface
owns its audit findings as acceptance criteria.

**This file is the ledger.** A finding is not "done" because a surface was
redesigned; it is done when the redesigned surface demonstrably solves it.

## Sequence

| # | Step | Status |
|---|---|---|
| 1 | Remaining P0 confirmations | **done** |
| 2 | Revert P1 implementations built around the old dashboard composition | **done** |
| 3 | Continuity schema (`lastSeenAt` + read state) | **done** |
| 4 | Choose the visual world — **The Wire**, locked | **done** |
| 5 | Primitive/component layer + focus tokens + semantic colors, in the new world | pending |
| 6 | Dashboard redesign | pending |
| 7 | Draft night, trade outcome, free agency, finances | pending |
| 8 | Cross-cutting: nav regrouping, error mapping, orphan routes | pending |
| 9 | Migration pass over remaining routes | pending |
| 10 | P3 polish incl. stale ROADMAP.md | pending |

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
- [x] Draft lottery: deliberately *not* gated. The user navigates to a dedicated
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
- [ ] **P1** No canonical roster page. *Deferred to step 9* — the dashboard
      roster table is now a proper Ledger, but `/rotation` still splits the job
      and the sub-nav still has no "Roster" entry.

### Draft night + lottery

- [ ] **P1** `/draft/lottery` has no return edge to `/draft`.
- [ ] **P2** Scouting has no cross-session summary ("you scouted 6 of 12").

### Trade outcome (built, not yet redesigned)

- [ ] **P1** Structurally sound, visually plain: built inside the old world and
      shares the generic page skeleton. Rebuild in the new world.

### Free agency

- [ ] **P1** 77+ rows, no filters, no position/need/rights filtering, no search.
- [ ] **P1** The board shows "Est. value" but never the cap space that makes it
      meaningful.
- [ ] **P2** No competing offers; a free agent waits indefinitely, draining urgency.

### Trade builder

- [ ] **P1** Partner browse is a flat 30-card grid with no cap space, no needs,
      no "teams that want what you have."
- [ ] **P2** No incoming CPU offers; trade is outbound-only.
- [ ] **P2** Raw engine `error.message` rendered as UI copy.

### Finances

- [ ] **P1** Business decision inbox rendered twice with identical actions.
- [ ] **P2** "Projected this season" duplicated verbatim across two tabs.

## Cross-cutting (step 8) — belongs to no single surface

- [ ] **P0** Notification fragmentation: 7 surfaces try to tell the user
      something; exactly 1 badge exists, and it is inside the section it
      describes. A BREAKING decision that blocks the season is invisible from
      the sub-nav.
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
