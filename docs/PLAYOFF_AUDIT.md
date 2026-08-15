# Postseason Audit

**Opened** 2026-08-13. The playoffs are the payoff for 82 simulated games and
the gate on everything after them — the lottery, the draft and the offseason are
all chained to a champion existing. Nothing in `docs/` had ever covered them:
the simulation audit measured regular-season games, roster progression measured
development, and neither touched seeding, the bracket, the play-in or series
play.

**Method.** `scripts/playoff-audit.ts`, read-only. 20,000 series per matchup and
20,000 full postseasons, driven by **the real seeded league's team strengths**
rather than invented ones, so every gap a series sees is a gap the game actually
produces.

**Headline.** The postseason machinery is sound — the bracket, the home-court
pattern, series lengths and the title distribution all land close to real. The
one substantive problem is not in the playoffs at all: **the league underneath
them is too flat**, and the playoffs are the surface where that finally shows.

---

## What is right

Worth stating first, because it is most of the system.

**The bracket is the real one.** Fixed, non-reseeded, `1v8 / 4v5 / 2v7 / 3v6`
with slots 0&1 feeding one semi-final and 2&3 the other, so the 1/8 survivor can
only meet the 2/7 survivor in a conference final. Reseeding each round — the
easy mistake — is explicitly not done.

**Home court follows 2-2-1-1-1 exactly.** Measured game by game: `H H L L H L H`,
matching the real format.

**Series lengths are close across the board:**

| Games | Simulated | Real NBA |
| ----: | --------: | -------: |
| 4 | 15.0% | ~17% |
| 5 | 27.9% | ~24% |
| 6 | 29.0% | ~31% |
| 7 | 28.1% | ~28% |

**Titles land where they should.** 1 seeds win 52.6% against a real ~50%, 2 seeds
25.2% against ~22%, and the tail thins out properly — 8 seeds win 0.7%, against
a real zero in forty years.

**The play-in is structurally correct.** Three games, higher seed always hosts,
the 7/8 loser gets a second life, and 9/10 must win twice without ever hosting
the decider.

**Finals home court is decided by record across conferences**, via the same
`pickHigherSeed` used within one — the real rule.

---

## PO-P1-1 — The league is too flat, and the playoffs inherit it

Every seed's strength implies a regular-season record. Those records are the
tell:

| Seed | Strength | Implied | Real NBA |
| ---: | -------: | ------: | -------: |
| 1 | 78.8 | **53-29** | ~60-22 |
| 2 | 78.1 | 50-32 | ~55-27 |
| 3 | 77.3 | 47-35 | ~51-31 |
| 4 | 77.2 | 46-36 | ~48-34 |
| 5 | 77.0 | 45-37 | ~46-36 |
| 6 | 76.8 | 44-38 | ~44-38 |
| 7 | 76.4 | 42-40 | ~41-41 |
| 8 | 76.1 | **41-41** | ~38-44 |

The middle is right. The **ends are not**: the best team wins 53 rather than 60,
the last playoff team wins 41 rather than 38, and the 1-vs-8 gap is **12 games
against a real 22**. Best-to-worst across all 30 teams is 5.8 rating points.

That propagates straight into the bracket:

| Matchup | Simulated | Real NBA |
| ------- | --------: | -------: |
| 1 vs 8 | **83.5%** | **93%** (69-5 since 1984) |
| 2 vs 7 | 75.7% | ~78% |
| 3 vs 6 | 58.8% | ~62% |
| 4 vs 5 | 55.0% | ~52% |
| overall | 68.2% | ~72% |

**The series model is not the problem.** Given a 12-game gap, 83.5% is the
right answer — a 7-game series is simply not that decisive between a 53-win team
and a 41-win team. Fixing the 1v8 rate means widening the league, not touching
the bracket.

This is the same root cause `docs/SIMULATION_AUDIT.md` left open as "talent
concentration still open", surfacing in a second place. It also explains the
play-in: with everyone bunched, those games are near coin flips, so structural
advantage dominates and the 8 seed advances 75% of the time against a real ~63%.

**Where it comes from.** `computeTeamStrength` is a weighted average of a
15-man roster, so it regresses hard toward the middle: one superstar moves a
team a fraction of a rating point, and the 90+ population is capped by
`docs/DEVELOPMENT_AUDIT.md`'s still-open D-P0-1. A real title team is carried by
its top three; a weighted average of fifteen cannot express that.

---

## PO-P2-1 — Playoff home court is regular-season sized

`simulateSeries` calls `simulateGame` directly. There is no playoff variant of
anything: same `HOME_COURT_ADVANTAGE`, same variance, same everything.

Measured across 20,000 playoff games: **home teams win 58.2%**.

Real home teams win about **54% of regular-season games and 60% of playoff
games** (2025), historically 61% and 65%. So the split is real and the engine
does not model it — its playoff rate sits at the top of its own regular-season
band instead of above it.

Modest in magnitude, roughly two percentage points against recent seasons, and
listed as P2 for that reason. But it is the only place the postseason differs
from a regular-season game by nothing at all, which is worth knowing.

---

## Findings

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **PO-P1-1** | P1 | INHERITED | League too flat: 1-seed implies 53-29 against a real 60-22, 1v8 gap 12 games against 22. Drops the 1v8 series to 83.5% against a real 93%. Root cause is team strength, not the bracket. |
| **PO-P2-1** | P2 | MODEL | Playoff games use the regular-season home-court constant. Home teams win 58.2% where the real playoffs run ~60-65%. |

---

## Scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| Bracket structure & seeding | **9** | Real fixed bracket, correct slots, no reseeding, Finals home court by record. |
| Series simulation | **8** | 2-2-1-1-1 exact, lengths within ~3 points across all four outcomes. |
| Play-in tournament | **8** | Format exactly right; outcome spread inherits PO-P1-1. |
| Title distribution | **8** | 1 seeds 52.6% vs ~50%, tail thins correctly. |
| Home-court modelling | **6** | No playoff distinction at all. |
| Outcome realism vs real NBA | **6** | 1v8 at 83.5% vs 93%; inherited, not local. |

**Weighted overall: 7.5.**

---

## Recommendation

**Do not change the bracket or the series model.** Both measure well, and
altering them to chase the 1v8 number would be tuning the wrong dial — it would
break the series-length and title distributions that are currently right.

The one local fix worth making is a **playoff-specific home-court constant**
(PO-P2-1): small, well-evidenced, and contained.

PO-P1-1 belongs to team strength and should be fixed there, where it also
affects regular-season standings, trade value and the draft. It is the same
issue two earlier audits have now flagged from different directions, which is
the strongest argument yet that `computeTeamStrength`'s weighting — not the
playoffs — is what needs the next audit.

---

## Reproducing

```
npx tsx scripts/playoff-audit.ts
```


---

# PO-P2-1 RESOLVED — the postseason has its own home court

`simulateSeries` called `simulateGame` directly, so a playoff game differed
from a February one by nothing at all: same advantage, same variance, same
everything. Home teams won **58.2%** — the top of the engine's own
regular-season band rather than above it.

## Fixed

`PLAYOFF_HOME_COURT_ADVANTAGE = 1.3`, against the regular season's 1.1, passed
by `simulateNextSeriesGame`. Everything else about a playoff game is unchanged.

| | Before | After | Real |
| --- | ---: | ---: | ---: |
| Regular-season home win | ~56% | ~56% *(unchanged)* | ~54% |
| **Postseason home win** | **58.2%** | **59.8%** | **~60%** |
| Postseason advantage | none | **+0.2 strength** | — |

## The measurement had to include seeding

The number could not be fitted on a neutral matchup. The higher seed hosts four
of seven games **and** is the better team, so an observed playoff home win rate
mixes home advantage with seeding — fitting against a 50/50 pair would have
produced an advantage far too large once real matchups were played.

`scripts/playoff-home-court-calibration.ts` therefore sweeps over full
seven-game slates across all four first-round matchups, using the sixteen
strongest rosters in the seeded league. The sweep has a clean interior optimum
at 1.3 (59.8%), with 1.2 at 59.2% and 1.4 at 60.3% either side.

## Scope

Modest by design — about two percentage points, which is what the real split
is. This was listed P2 for that reason. What it fixes is not the magnitude but
the fact that the postseason was the one place in the simulation that differed
from the regular season by nothing at all.
