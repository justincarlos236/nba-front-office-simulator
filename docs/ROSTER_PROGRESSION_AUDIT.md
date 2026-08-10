# Roster Construction & Player Progression — Audit

**Date:** 2026-08-10 · **Method:** code trace + direct measurement against 13 live
saves, including one six seasons deep.

Second audit in the refinement phase. Follows the Simulation Engine audit
(`docs/SIMULATION_AUDIT.md`), which surfaced the talent-concentration question
this one inherits.

---

## Verdict

**Materially flawed — one root cause, very wide blast radius.**
**Both P0s are now fixed (`ffec212`).** Measured after: ages span 18-44 with
real medians, all three development branches are populated (356 growing, 93
prime, 88 declining in a fresh league), and retirement is reachable - roughly 10
expected next offseason in a fresh league and 38 in the six-season save, against
zero before. P1-3, P1-4 and P2-5 remain, and were deliberately deferred until
the roster market behaves normally.

The progression _models_ are sound. Development, retirement, and draft-class
generation are all well-built, tested, and sensibly shaped. They are also, for
every real player in the game, **unreachable**.

Every seeded player's age is the hardcoded fallback `27`, forever. Not
approximately — exactly, for all 537 of them, in every save, for every season.
Nobody ages, nobody declines, nobody retires. A save six seasons deep contains
**777 active players and has recorded zero retirements**.

The fix is unusually cheap: the correct data is already in the database and the
function to read it already exists.

---

## Scores

| Dimension           | Score    | Note                                                            |
| ------------------- | -------- | --------------------------------------------------------------- |
| **Overall**         | **3/10** | Good models, disconnected from their main input                 |
| Correctness         | 3/10     | Age is wrong for 100% of real players, 18 call sites deep       |
| Realism             | 3/10     | No ageing, no decline, no attrition                             |
| Long-term stability | 2/10     | Population grows without bound; league never turns over         |
| Model quality       | 8/10     | Development, retirement and draft generation are all well-built |
| Test confidence     | 5/10     | Units are tested; nothing tests the integration that broke      |

---

## Findings

### P0-1 — Every real player is permanently 27 years old · **FIXED** (`ffec212`)

**Observed.** In a fresh league, `estimateAge` returns **27 for all 537
players**. In the six-season save it returns 27 for the same 537, while the 240
generated draftees age correctly (22–25).

|                                       |                     |
| ------------------------------------- | ------------------- |
| Seeded players with `draftYear` set   | **0 / 537**         |
| Seeded players with `birthDate` set   | **537 / 537**       |
| Real age spread available in the data | 22 to 44, median 29 |
| Age the engine actually uses          | **27, universally** |

**Evidence.** `src/lib/players/age.ts`:

```ts
export function estimateAge(draftYear: number | null, season: number): number {
  if (!draftYear) return 27;
  return Math.max(19, season - draftYear + ASSUMED_DRAFT_AGE);
}
```

The seeded roster comes from a hoopR-sourced dataset that carries `birthDate`
but no `draftYear`. An older dataset in the same table has the opposite
(5,419 rows with `draftYear`, no `birthDate`) — but leagues are not built from
those rows. So the null branch is not an edge case; it is every player.

**Root cause.** Two data sources with complementary fields, and the age helper
keyed to the one the live data lacks. `ageFromBirthDate` exists in the same
file, is correct, and is called in only three places — none of them
progression.

**Blast radius — 18 call sites**, including:

- `developPlayerRating` — age 27 falls between the young-growth ceiling (26) and
  decline start (30), so every real player is permanently in the "prime"
  branch: `drift = randomInt(-1, +1)`, an unbiased random walk, forever
- `retirement` — see P0-2
- `trade.ts`, `cpuFreeAgentMarket.ts`, `teamDraftContext.ts` — every valuation
  of a real player prices a 27-year-old
- `offseason.ts`, `rotation.ts`, `leagueEvents.ts`, plus six UI surfaces

**Gameplay impact.** Severe and invisible. Ageing is the engine of a franchise
game: it forces succession planning, makes contracts risky, and gives the draft
its purpose. None of that pressure exists. A 44-year-old is valued, developed,
and re-signed as though he were 27.

**Fix.** Prefer `birthDate` when present, fall back to `draftYear`, then to the
constant. One helper, then update the call sites. The data is already there.

**Validation.** Assert no league has more than a small fraction of players at
exactly the fallback age; assert median age lands near 26–27 with real spread.

---

### P0-2 — Retirement is mathematically unreachable · **FIXED** (`ffec212`, downstream of P0-1)

**Observed.** The six-season save has recorded **zero retirements**. Active
population is 777: exactly 537 seeded + 240 drafted (60 per draft × 4 drafts).
Perfect conservation — nobody has ever left.

**Evidence.**

```ts
const RETIREMENT_RISK_START_AGE = 33;
if (age < RETIREMENT_RISK_START_AGE) return 0;
```

Real players are pinned at 27, so their retirement probability is **exactly
zero** by construction. Generated draftees top out at 25 in this save, so they
are below the threshold too — retirement cannot fire for anyone for roughly
eight more seasons, and can never fire for a seeded player.

The retirement model itself is fine. It is simply never asked a question it can
answer.

**Gameplay impact.** The league never turns over. 116 players in that save are
really 33 or older and 13 are 41+; all are still playing. Rosters grow every
season, which the Simulation audit saw as unbounded roster sizes (P0-3 there) —
that was the symptom, this is the disease. The Stage 1 roster cap stops teams
_signing_ past 15, but the underlying population still climbs by 60 a year.

**Fix.** Falls out of P0-1. Worth a follow-up pass to retire the backlog of
already-old players in existing saves rather than leaving them immortal.

**Validation.** Simulate 10 seasons headlessly; assert active population stays
roughly flat and annual retirements land in a believable band.

---

### P1-3 — The talent distribution is replacement-heavy

**Observed**, share of all active players:

| Tier              | Fresh     | 6 seasons | NBA   |
| ----------------- | --------- | --------- | ----- |
| 95–99 superstar   | 0.9%      | 0.5%      | ~1.5% |
| 88–94 star        | 3.9%      | 3.0%      | ~5%   |
| 80–87 starter     | 10.4%     | 11.1%     | ~15%  |
| 73–79 rotation    | 18.6%     | 24.5%     | ~25%  |
| 65–72 fringe      | 38.4%     | 38.0%     | ~35%  |
| 60–64 replacement | **27.7%** | **23.0%** | ~18%  |

**Assessment.** Directionally right, but thin at the top and heavy at the
bottom. Partly a consequence of `MIN_RATING = 60` acting as a hard floor that
piles players up against it, and partly that seeded rosters carry more
deep-bench players than a real 15-man roster does.

**Classification: tuning**, not a bug. Worth revisiting only after P0-1, since
ageing will change the shape on its own.

---

### P1-4 — Talent never concentrates into contenders

**Observed.** Counting how many of the league's top 30 players sit on each
roster:

|                               | Fresh      | 6 seasons  | NBA      |
| ----------------------------- | ---------- | ---------- | -------- |
| Most on one roster            | 3          | 3          | 3–4      |
| Teams with none of the top 30 | **6 / 30** | **9 / 30** | ~15 / 30 |

**Assessment.** The ceiling is right — a team can hold three of the best 30.
What is wrong is the floor: talent is spread across 21–24 teams where the real
league concentrates it in about 15. Superteams are not impossible, but the
league resists stratifying.

This is the finding the Simulation audit deferred here. It is **not** caused by
rating compression (distributions are stable across saves) but by there being
no mechanism that moves stars toward contenders: CPU free agency deliberately
routes players to clubs with cap space and roster holes — that is, bad teams —
and CPU trades are value-matched one-for-one swaps.

**Classification: missing mechanic**, and the only place in this audit where a
new mechanic is arguably justified. Deliberately **not** proposed yet: with
nobody ageing or retiring, the roster market is not behaving normally, and
tuning talent flow before fixing that would be tuning against a broken baseline.

---

### P2-5 — The league grows steadily more undeveloped

**Observed.** Average growth room (`potential − overall`) rises from **3.59** in
a fresh league to **5.66** after six seasons; players at their ceiling fall from
42% to 22%.

**Root cause.** Downstream of P0-2. Sixty high-potential draftees enter every
year and nobody leaves, so the share of unfinished players climbs indefinitely.

**Classification: symptom.** Expect it to resolve with P0-1/P0-2; re-measure
rather than treat directly.

---

## Systems that are already strong — do not touch

- **The development model** (`developPlayerRating`) is well-shaped: growth
  toward potential while young, an unbiased drift in prime, accelerating decline
  past 30, with coach quality, minutes, morale and facilities as bounded
  modifiers. It needs a correct age, not a rewrite.
- **The retirement model** is sensible — risk rising from 33, forced at 41,
  modulated by rating and morale. It has never been given a player it can act on.
- **Draft class generation** grades potential from 97 at pick 1 to 70 at pick
  60, with class character modifiers. Structurally sound.
- **`ageFromBirthDate` already exists and is correct.** The fix is wiring, not
  new logic.

---

## Prioritised plan

**Stage 1 — make age real (everything else depends on it)**

1. P0-1: resolve age from `birthDate` first, `draftYear` second, constant last.
2. Update the 18 call sites via the shared helper.
3. P0-2: verify retirement fires; decide how to handle the existing backlog of
   over-age players in live saves.

**Stage 2 — re-measure before tuning anything**

4. Re-run this audit's measurements. P1-3 and P2-5 are expected to move on their
   own, and tuning them beforehand would be tuning against a broken baseline.

**Stage 3 — only if still warranted**

5. P1-4 talent concentration, informed by what the market looks like once
   players actually age out of it.

---

## Limitations

- Development curves for _generated_ players were not stress-tested over a long
  horizon; no save is old enough to contain a draftee who has reached decline
  age. A headless 20-season harness would settle this and P1-4 together, and has
  still not been built.
- Contract and cap consequences of ageing (veteran extensions, dead money) were
  not examined; they belong to a Finances/Contracts audit.
- The 5,419 `draftYear`-bearing player rows were not traced to their origin. They
  are unused by league creation, but it is worth confirming nothing else reads
  them.
