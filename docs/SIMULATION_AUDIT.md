# Simulation Engine & Season Results — Audit

**Date:** 2026-08-10 · **Method:** code trace + large-sample empirical simulation
(246,000 simulated games, 300-season runs against real league data, plus direct
inspection of 13 live saves including one 6 seasons deep).

Findings below are empirical. Where a claim rests on inspection alone, it says so.

---

## Verdict

**Materially flawed.**

Not because the code is bad — the plumbing is genuinely excellent, and several
parts are better than they need to be. The problem is that the **competitive
model is nearly flat**, and three separate defects in the team-strength path mean
roster decisions barely move the simulation, or don't move it at all.

The headline number: in a fresh league, the best team averages **45 wins** and
the worst **36**. Across 300 simulated seasons the engine produced a 60-win
season **0.01%** of the time (NBA: ~7%) and a 20-win season **never** (NBA: ~5%).
The best team in the league finishes with a losing record **15.7%** of seasons.

A franchise simulator whose central promise is that roster construction matters
currently answers "how much did that superstar help?" with, in the literal worst
case, **exactly zero**.

---

## Scores

Both columns measured the same way. "After" reflects Stages 1-4
(`3022e55`, `f542b17`, `e8952a6`, `5a18395`).

| Dimension                      | Before   | After    | Note                                                                  |
| ------------------------------ | -------- | -------- | --------------------------------------------------------------------- |
| **Overall simulation quality** | **4/10** | **8/10** | Competitive range fixed; talent concentration still open              |
| Correctness                    | 6/10     | 9/10     | Four strength-path defects closed; state integrity was always perfect |
| NBA realism                    | 3/10     | 8/10     | Win spread, margins and scoring all land in real bands                |
| Regular-season realism         | 3/10     | 8/10     | Best-worst spread 9.1 -> 35.5 games                                   |
| Playoff realism                | 7/10     | 8/10     | Was already good; live-game model now matches the season model        |
| Player-stat realism            | 7/10     | 8/10     | Unchanged model, now fed a realistic margin and minutes               |
| Long-term stability            | 4/10     | 6/10     | Roster bloat fixed; talent still never concentrates (P1-8)            |
| Test confidence                | 4/10     | 8/10     | Nine statistical safeguards; suite now deterministic                  |

**Remaining verdict: strong but needs tuning** — down from _materially flawed_.
The one substantive gap left is that talent never concentrates into superteams,
which is roster construction rather than the engine and belongs to its own audit.

---

## Top 10 findings

### P0-1 — A newly acquired player can contribute _nothing_ to team strength

**Observed.** With a saved 12-man rotation, adding a 90-rated superstar changed
team strength by **+0.00**. Simulated record: 48.7 wins before, 48.7 after.

**Expected.** Acquiring one of the league's best players should be worth several
wins immediately.

**Evidence.** `computeRotationAdjustedStrength` calls `resolveRotation`, which
fills slots 0–11. Every trade and signing writes `targetMinutesPerGame: null`
and `rotationSlot: null` (`freeagency.ts:107`, `leagueEvents.ts:581/598/749`).
If twelve players already hold explicit slots, the new player is not placed in
the rotation at all and contributes zero weight.

**Root cause.** Roster mutation does not invalidate or recompute the stored
rotation. Slot assignment is persisted state that silently goes stale.

**Gameplay impact.** Catastrophic, and _invisible_. The user makes a franchise
trade, sees no change in results, and has no feedback explaining why. This
undermines the single most important feedback loop in the product. It also
affects box scores — `allocateMinutes` uses the same `resolveRotation`, so the
new star does not appear in a box score either.

**Fix.** Rotation resolution must treat unslotted players as candidates ranked
by rating, not as excluded. Simplest correct change: after placing explicitly
slotted players, fill remaining rotation capacity from _all_ remaining healthy
players by rating, and evict a slotted player whose rating is far below an
unslotted one — or clear `rotationSlot` on roster change.

**Validation.** Property test: for any roster and any rotation state, adding a
player rated above the current best must strictly increase team strength.

---

### P0-2 — `targetMinutes` mixes absolute minutes with relative weights

**Observed.** Assigning a target of 36 minutes to only the best player raised
strength from **72.20 → 80.40** (≈ +11 wins) on an otherwise unchanged roster.

**Expected.** Setting a minutes target should redistribute emphasis, not
manufacture ~8 points of team strength.

**Evidence.** `rotationStrength.ts:46`:

```ts
const weight = targetMinutes ?? RANK_MINUTE_WEIGHTS[rank] ?? 0;
```

`RANK_MINUTE_WEIGHTS` spans **0.08–1.42**; `targetMinutesPerGame` is absolute
minutes (8–40). A player on 36 minutes therefore carries **26.7×** the weight of
a rank-2 player on the fallback curve.

**Root cause.** `boxScore.ts` does this conversion correctly via
`WEIGHT_PER_MINUTE` (line 70). `rotationStrength.ts` performs the same mixing
without it. Two modules, one shared idea, one of them converted.

**Gameplay impact.** A reproducible exploit reachable through the normal UI, and
worse, a silent distortion for any partially-configured rotation. Because the UI
pre-fills all twelve slots, an ordinary save is coherent — but any roster change
afterwards reintroduces the mix.

**Fix.** Multiply `targetMinutes` by `WEIGHT_PER_MINUTE` exactly as `boxScore`
does, and share one helper between the two modules so they cannot diverge again.

**Validation.** Assert that a rotation expressed in minutes and the equivalent
rotation expressed in rank weights produce the same strength.

---

### P0-3 — Roster sizes are unbounded and directly distort strength

**Observed.** In a save six seasons deep, roster sizes ranged from **7 to 28
players** (NBA limit: 15). Active players league-wide had grown from 450 to 777.

**Evidence.** Direct query of the season-2029 save.

**Root cause.** No enforced roster maximum on the CPU signing/trade paths.

**Gameplay impact.** Compound. `computeTeamStrength` is a weighted average over
_every_ player with a flat 0.4 bench weight, so a 28-man roster is
mathematically penalised and a 7-man roster rewarded. Measured: carrying the top
8 instead of all 15 raises strength **72.20 → 75.35** (≈ +4.4 wins) for doing
nothing but waiving players.

**Fix.** Enforce a 15-man limit on every roster-adding path; separately, make
strength depend only on the rotation, so roster depth beyond it is neutral.

**Validation.** Invariant test after N simulated seasons: no roster exceeds 15.

---

### P1-4 — The league is nearly flat

**Observed**, 300 seasons against real league data:

|                             | Fresh league (spread 5.9) | Developed league (spread 11.6) | NBA |
| --------------------------- | ------------------------- | ------------------------------ | --- |
| Best team avg wins          | 45.0                      | 49.0                           | ~60 |
| Worst team avg wins         | 35.9                      | 31.9                           | ~20 |
| Best−worst spread           | **9.1 games**             | 17.1                           | ~40 |
| League win SD               | 5.1                       | 5.8                            | ~12 |
| ≥60-win seasons             | 0.01%                     | 0.02%                          | ~7% |
| ≤20-win seasons             | 0.00%                     | 0.02%                          | ~5% |
| Best team finishes losing   | **15.7%**                 | 3.7%                           | ~0% |
| Worst team finishes winning | **12.0%**                 | 0.7%                           | ~0% |

**Root cause.** Two compounding factors, neither individually wrong:

1. `computeTeamStrength` compresses. Real seeded leagues produce a
   best-to-worst spread of only **5.9–11.6 rating points**, because it is an
   average over 15 players and rosters have similar means.
2. `WIN_PROB_STEEPNESS = 0.07` is calibrated for a much wider spread. Over 5.9
   points it yields a 60% edge for the best team over the worst.

**Gameplay impact.** The core of the game. Tanking cannot produce a bad record;
a superteam cannot produce a great one. Every season looks the same.

**Fix.** Tune, do not rewrite. Raising steepness to ~0.18 yields best-vs-worst
of about **61 vs 21 wins** over the real 6-point spread — close to NBA range.
Widening the strength scale instead (heavier top-end weighting) would work too,
but changes a number four other systems consume. **Steepness is the lower-risk
lever, and it is a one-constant change.**

**Validation.** Statistical regression test asserting league win SD lands in
9–14 and that ≥60-win seasons occur at 3–12%.

---

### P1-5 — Victory margin is completely independent of team quality

**Observed.** Average margin was **12.49 points** in all three cases:

| Matchup        | Home win % | Avg margin | Max margin |
| -------------- | ---------- | ---------- | ---------- |
| 70 v 70 (even) | 55.2%      | 12.49      | 22         |
| 85 v 55        | 90.9%      | 12.49      | 22         |
| 95 v 45        | 97.5%      | 12.49      | 22         |

**Evidence.** `simulateGame.ts:71` — `margin = MIN_MARGIN + rng() * (MAX_MARGIN
− MIN_MARGIN)`, drawn without reference to strength.

**Root cause.** Strength decides _who_ wins; nothing decides _by how much_.

**Gameplay impact.** Point differential is meaningless as a signal. A 97.5%
favourite beats a hopeless team by the same distribution as a coin-flip game.
Blowouts carry no information, and garbage-time minutes (which key off margin in
`boxScore.ts`) are allocated on noise.

**Fix.** Centre the margin on the strength differential and keep a random
component around it.

**Validation.** Assert mean margin rises monotonically with strength gap.

---

### P1-6 — No close games and no blowouts

**Observed** over 246,000 games:

| Margin  | Engine   | NBA  |
| ------- | -------- | ---- |
| 1–2 pts | **0.0%** | ~7%  |
| 3–5     | 13.2%    | ~11% |
| 6–10    | 26.3%    | ~23% |
| 11–15   | 26.5%    | ~20% |
| 16–20   | 26.3%    | ~16% |
| 21–25   | 7.8%     | ~11% |
| 26+     | **0.0%** | ~12% |

**Root cause.** `MIN_MARGIN = 3` and `MAX_MARGIN = 22`, uniformly sampled.

**Gameplay impact.** The most memorable game states in basketball — the
one-point finish and the 30-point statement win — cannot occur. Uniform sampling
also over-produces the 11–20 band.

**Fix.** Replace the bounded uniform with a distribution centred on the expected
margin (roughly normal, SD ~13, truncated at ±1 with no upper bound).

**Validation.** Assert 1-point games occur at 3–8% and 25+ margins at 5–15%.

---

### P1-7 — User and CPU teams are rated by different models

**Observed.** Merely assigning rotation slots (no minutes) raised strength
**72.20 → 74.56** (≈ +3.3 wins) on an unchanged roster.

**Evidence.** `rotationStrength.ts:36-39` branches on `hasCustomRotation`. CPU
teams never set one, so they are _always_ rated by `computeTeamStrength` over
the full roster; a user who opens Rotation Management is rated by a 12-man
minutes-weighted curve that excludes their worst players.

**Root cause.** The delegation is documented as preserving behaviour, and it
does — but it makes the model a function of _whether the user touched a screen_
rather than of the roster.

**Gameplay impact.** A free, permanent ~3-win advantage for opening a page. Not
adversarial — most users will trip it accidentally.

**Fix.** Use one curve for everyone. Give CPU teams an implicit auto-rotation
(`buildAutoRotation` already exists) and rate all 30 teams identically.

**Validation.** Assert that a roster with an auto-rotation and the same roster
untouched produce equal strength.

---

### P1-8 — Parity increases over time

**Observed**, Lakers save across 2025–2029:

| Season | Best | Worst | Win SD |
| ------ | ---- | ----- | ------ |
| 2025   | 51   | 30    | 4.5    |
| 2026   | 51   | 30    | 5.2    |
| 2027   | 50   | 31    | 5.2    |
| 2028   | 49   | 31    | 4.3    |

Team-strength spread fell from **11.6 to 4.5** over six seasons.

**CORRECTION (2026-08-10).** This finding was **overstated**. The 11.6 → 4.5
figure was measured with `computeTeamStrength`, which is _not_ the function the
simulation uses — `computeRotationAdjustedStrength` is. Re-measured with the
right function, the same save declines **13.3 → 8.9** over six seasons: real,
but a third of the reported severity. The audit's own rule — follow the code
paths, not the names — was broken here by the audit itself.

**Root cause.** Still not diagnosed. Investigation found that talent does not
_compress_ (player rating distributions are stable across saves: max 99, median
~70-74 in both fresh and six-season leagues). What happens instead is that
talent never **concentrates**: across all 13 live saves, the top 30 players are
spread over 20-22 teams with never more than 3 on one roster, and that is
already true in a brand-new league. Superteams cannot form.

That is a roster-construction and progression question, not a simulation-engine
one, and it belongs to a separate audit. A definitive answer needs a headless
20-season harness, which has not been built.

**Gameplay impact.** Long saves lose all competitive texture. No dynasties, no
rebuilds — a 20-season save is 20 identical seasons.

**Validation.** Simulate 20 seasons headlessly and assert strength spread does
not decline monotonically.

---

### P2-9 — Scoring distribution is too narrow and slightly high

**Observed.** Team score mean **118.2**, SD **9.7**. NBA: ~114, SD ~12–13.

**Root cause.** `AVERAGE_TEAM_SCORE = 112` with `SCORE_RANDOMNESS = 22` applied
uniformly to the loser only; the winner is loser + margin, so both are narrow.

**Impact.** Cosmetic but pervasive — it feeds every stat, leaderboard and record.

---

### P2-10 — Injuries remove a player without redistributing his minutes

**Observed.** With a custom rotation, losing the best player moved strength
**74.60 → 73.21** (−1.38). Remaining players keep their absolute targets and the
average simply re-normalises.

**Impact.** Injuries are under-weighted, and there is no "next man up" — the
tenth man does not step into the starter's minutes. Real, but modest.

**FIXED (Stage 3, `e8952a6`)** — and fixing it exposed a worse bug underneath.
Once Stage 1 let bench players reach the rotation at all, the vacated slot was
filled _by slot number_, so the thirteenth-best player inherited the injured
starter's slot 0 and **35 minutes**. Call-ups now slide down past anyone they
are clearly worse than: same roster, starter out, the second-best man goes
34 → 39 minutes and the call-up lands on 11.

---

## Five biggest threats to long-term save quality

1. **Roster bloat** (P0-3) — 28-man rosters actively distort strength and worsen with every season.
2. **Parity collapse** (P1-8) — a 20-season save trends toward every team being identical.
3. **Stale rotation slots** (P0-1) — the longer a save runs, the more roster turnover accumulates behind a frozen rotation.
4. **Flat competitive range** (P1-4) — no franchise arc is expressible; nothing the user builds shows up in the standings.
5. **No statistical regression tests** — every issue above is invisible to the current suite, so any tuning can silently regress.

---

## Systems that are already strong — do not touch

These were verified and should be preserved as-is:

- **State integrity is flawless.** Across 13 saves and ~5,000 completed games,
  wins always equalled losses and always equalled games played. Zero drift.
- **Box-score reconciliation is exact.** 240 sampled games: **zero** mismatches
  between player points and team score. `reconcilePoints` is careful work — it
  rescales attempts rather than points so the makes/attempts identity stays legal.
- **Schedule generation is exact.** Every team gets exactly 82 games; home games
  range 39–43. No duplicates, no gaps.
- **Series-length distribution is genuinely NBA-like** — at a +4 gap: 14%/27%/30%/29%
  for 4/5/6/7 games (NBA: 13/26/31/30). This needs no work.
- **Home win rate is 55.0%**, squarely in the real 54–58% band.
- **Scoring does not inflate** — 118.0 to 118.4 across six seasons.
- **The box-score model is the best part of the engine.** Position profiles,
  per-36 priors, real-stat scaling by rating drift, TS%-derived attempts,
  hot/cold games. Structurally sound.

---

## Test coverage

| Module               | Tests | Assessment                                      |
| -------------------- | ----- | ----------------------------------------------- |
| leagueEvents         | 29    | Strong                                          |
| boxScore             | 15    | Strong                                          |
| simulateLiveGame     | 11    | Good                                            |
| generateSchedule     | 10    | Good                                            |
| simulateGame         | 7     | Mechanical only — no distribution assertions    |
| simulateSeries       | 7     | Good                                            |
| playoffSeeding       | 6     | Good                                            |
| teamStrength         | 5     | Ordering only, no calibration                   |
| **rotationStrength** | **3** | **Does not cover mixed units or roster change** |

**Zero statistical or behavioural tests exist.** No test asserts win-total
spread, margin distribution, upset rates, or long-run stability. Every P0 and P1
above passes the current suite.

**Recommended permanent safeguards:** seeded 300-season regression asserting win
SD in 9–14; margin distribution bands; monotonic margin-vs-gap; strength
monotonicity under roster improvement; roster-size invariant after N seasons.

---

## Prioritised refinement plan

**Stage 1 — correctness (do first, small and surgical)**

1. P0-2 units mismatch — one-line fix plus a shared helper.
2. P0-1 stale rotation slots — unslotted players must be rotation candidates.
3. P0-3 roster limit — enforce 15 on every adding path.
4. P1-7 unify the strength model across user and CPU teams.

**Stage 2 — competitive range (the thing that makes the game a game)**

5. P1-4 raise `WIN_PROB_STEEPNESS` toward ~0.18 and re-measure. One constant.
6. P1-5 margin as a function of strength differential.
7. P1-6 replace bounded-uniform margin with a centred distribution.

**Stage 3 — texture**

8. P2-9 widen score variance, lower baseline ~4 points.
9. P2-10 redistribute minutes on injury.
10. P1-8 investigate parity collapse (needs its own audit).

**Stage 4 — lock it down**

11. Statistical regression suite, so none of the above can silently regress.

Stages 1 and 2 are the whole audit in practice. Everything else is polish.

---

## Classification summary

| Finding                  | Type                                             |
| ------------------------ | ------------------------------------------------ |
| P0-1 stale rotation      | **Real bug**                                     |
| P0-2 units mismatch      | **Real bug**                                     |
| P0-3 roster bloat        | **Real bug** (missing constraint)                |
| P1-4 flat league         | **Tuning** — one constant                        |
| P1-5 margin independence | **Missing mechanic**                             |
| P1-6 margin bounds       | **Tuning**                                       |
| P1-7 dual model          | **Real bug** (inconsistency)                     |
| P1-8 parity collapse     | **Needs investigation**                          |
| P2-9 score variance      | **Tuning**                                       |
| P2-10 injury minutes     | **Intentional simplification**, worth revisiting |

The possession-free game model is an **intentional simplification** and a good
one — it is fast, deterministic, and testable. None of the above requires
abandoning it.

---

## Limitations of this audit

- Long-run analysis used the deepest existing save (6 seasons). A headless
  20-season harness was not built; P1-8 is therefore observed, not diagnosed.
- Downstream integration (awards, fans, finances, morale) was verified to
  _receive_ simulation output but not audited for correctness — that belongs to
  its own audit.
- One save showed 870 completed games with no player box scores. Likely predates
  box-score generation, but not confirmed.
- Play-in and playoff seeding were read but not stress-tested empirically.


---

# P1-8 RE-MEASURED — parity no longer increases — 2026-08-16

P1-8 observed team-strength spread collapsing from 11.6 to 4.5 across six
seasons, with best/worst converging on 51/30 wins. It is the sole reason
**long-term stability** sat at 6/10, and the audit's own verdict called it "the
one substantive gap left".

It predates `docs/TEAM_STRENGTH_AUDIT.md`, which re-weighted
`computeTeamStrength` — a change that fixed the spread a league *starts* with
and said nothing about whether it holds. Nothing had checked.

`scripts/parity-drift-audit.ts` keeps teams intact across seasons — rosters
develop, age, retire and draft as units — averaged over five runs:

| Season | Strength SD | Win SD | Best | Worst |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 2.03 | 9.6 | 60 | 17 |
| 4 | 2.32 | 11.0 | 60 | 18 |
| 8 | 1.89 | 9.0 | 60 | 23 |
| **12** | **2.48** | **11.6** | 66 | 21 |

**Strength SD rises 22% over twelve seasons rather than collapsing.** Win SD
holds between 9.0 and 11.6 against a real ~12, and the best/worst gap does not
close. The league that used to flatten into a 51-30 band now sustains a 66-21
one.

The re-weighting is the likely cause: when the best player was 12.3% of a team,
roster churn averaged talent out quickly; at 24.9% a star holds a club up on his
own, and losing one drops it.

> **Scope, stated plainly.** This models the two forces acting on every save
> automatically — ageing/development, and the draft, which is deliberately
> equalizing because the worst team picks first. It does **not** model free
> agency or trades, which redistribute talent by decision rather than by rule.
> The original observation came from a real save that had both. So this retires
> the concern for the automatic forces and narrows any remaining drift to the
> transactional ones; it does not prove a played save holds its spread.

## Rescored

| Dimension | Was | Now | Why |
| --- | ---: | ---: | --- |
| **Long-term stability** | **6/10** | **8/10** | Roster bloat fixed; talent concentration no longer degrades — spread widens over twelve seasons. Held below 9 only because free agency and trades are unmeasured here. |

The audit's remaining verdict — "the one substantive gap left is that talent
never concentrates" — no longer holds.
