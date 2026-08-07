# 03 — The Salary Cap / CBA Engine

**This is the flagship module. If an interviewer only asks about one thing, make
it this one — it's the most "real software" part of the project.**

Files: `src/lib/cap/` (`constants.ts`, `capSheet.ts`, `apron.ts`, and the
trade-matching logic), all pure functions with their own tests.

## 1. Purpose — what problem it solves

Being an NBA GM is a **constrained optimization problem**: you want the best
team, but the league's **Collective Bargaining Agreement (CBA)** limits your
spending. The cap engine is the referee that answers questions like:

- How much salary is this team committed to this season?
- Do they have cap space? Are they over the luxury tax? Over an "apron"?
- Is this proposed trade legal under the salary-matching rules?

Without a faithful cap engine, the game is just "move players around" — the cap is
what makes it a _strategy_ game.

## 2. The real-world rules being modeled (you should be able to explain these)

- **Salary cap:** a _soft_ team spending limit. You can exceed it, but only using
  specific "exceptions."
- **Luxury tax:** a higher threshold; spending past it costs the owner a
  penalty (modeled as a financial consequence, not a hard block).
- **First & second apron:** two even higher thresholds. Crossing them **removes
  tools** (bigger exceptions, certain trades). They're the modern CBA's real
  teeth.
- **Trade salary matching:** a team over the cap can't just take back any salary
  in a trade — the incoming salary must fit a formula based on the outgoing
  salary (roughly "you can take back a bit more than you send, on a sliding
  scale"). This is what makes trades a puzzle.

## 3. Architecture — how it fits in

The engine is **pure data-in/data-out**. It never touches the database. That's
deliberate: it means the _same functions_ are the single source of truth for the
cap, reused by:

- the **trade validator** (is this deal legal?),
- **free agency** (can this team afford this contract?),
- the **GM expectation** system (how much is the owner spending?),
- and the **UI** (the cap-sheet display on the team page).

```
DB rows (contracts)  ──►  computeCapSheet(...)  ──►  CapSheet object
                                                     (committed salary, apron
                                                      level, cap space, distance
                                                      to each apron)
```

## 4. Key files & functions

### `constants.ts` — the CBA numbers, in one place

- **`SEASON_CAP_RULES`**: a table of the real dollar figures per season (cap,
  tax, both aprons, exception amounts, trade-matching breakpoints). Seasons
  2023–2025 are hand-entered from public CBA reporting.
- **`getSeasonCapRules(season)`**:
  - **Input:** a season year. **Output:** that season's rule set.
  - For seasons past the hand-entered ones, it **projects forward** with a flat
    ~5% growth rate rather than flatlining — so cap space keeps growing in a
    long save. For seasons before the table, it falls back to the nearest known
    season instead of throwing.
  - **Why it's a function, not a raw constant:** callers ask for "the rules for
    season N" and always get a valid answer, even 20 simulated seasons in.

### `capSheet.ts` — the core computation

**`computeCapSheet(input)`**

- **Input:** `{ season, contracts: [{playerId, salaryCents}], deadMoneyCents?,
retainedSalaryCents? }`.
- **Output:** a `CapSheet`: committed salary, dead money, "empty roster charges,"
  total salary, **apron level**, cap space (0 if over the cap), and distance to
  each apron (negative once you're past it).
- **Notable detail — empty roster charges:** the CBA charges a team a minimum
  salary for each _empty_ roster spot below 12 players, so a nearly-empty team
  can't pretend it has infinite cap space. The function adds that charge.
- **Why pure:** you can test dozens of cap scenarios with plain arrays and no
  database. It also means the AI and the UI compute the cap identically.

### `apron.ts`

**`getApronLevel(totalSalary, rules)`** → classifies a team as
below-tax / taxpayer / over-first-apron / over-second-apron. That single label
drives which privileges are available elsewhere.

### Trade matching

The trade validator computes each side's outgoing salary and checks the incoming
salary against the season's matching breakpoints (from `constants.ts`). A team
**under** the cap has more freedom; a team **over** the cap must satisfy the
matching formula. If it fails, the trade is rejected with a human-readable reason.

## 5. The most important design decision

> **The CBA rules exist exactly once.** Every consumer — trades, free agency, AI,
> UI — calls the same pure functions and the same `SEASON_CAP_RULES` table.

**Why it matters (say this in an interview):** the alternative is re-implementing
"is this cap-legal?" in the trade page, again in the free-agency page, again in
the AI. Those copies **drift** — a rule changes in one place and now the UI says a
trade is legal but the server rejects it. One source of truth eliminates a whole
class of bugs. This is the "**single source of truth / DRY**" principle applied to
business rules.

## 6. Trade-offs & simplifications (be honest about these)

- Dollar figures are **approximations** of the real audited CBA numbers — close
  enough for realistic decisions, not an official record.
- Some exotic exceptions are simplified. The **spirit** of the CBA (soft cap,
  tax, two aprons, salary matching) is modeled; every edge case is not.
- The luxury tax is modeled as a **financial consequence** (it costs the owner
  money and patience) rather than a hard prohibition — because in reality teams
  _do_ pay the tax; it's a choice with a cost.

## 7. Interview questions & strong answers

**Q: Walk me through what happens when a user proposes a trade.**

> The server action loads both teams' contracts and the assets being swapped. It
> calls the pure cap functions: compute each team's outgoing salary, then check
> the incoming salary for each team against that season's matching breakpoints,
> and recompute each team's resulting cap sheet to see if it pushes them past a
> restricted apron. If any check fails it returns a specific reason; if all pass,
> it executes the asset moves inside a database transaction so the trade is
> all-or-nothing.

**Q: Why are the cap rules pure functions instead of methods on a model or
queries?**

> Two reasons: testability and single-source-of-truth. Pure functions let me
> unit-test hundreds of cap scenarios with no database. And because trades, free
> agency, the AI, and the UI all call the same functions, they can never disagree
> about whether something is cap-legal.

**Q: Why store money as BigInt cents?**

> Floating-point can't represent money exactly, and cap math has to be exact to
> the dollar. Cents keep it integer; BigInt because salaries in cents exceed a
> normal JS number's safe range.

**Q: How do you handle seasons you don't have real numbers for?**

> `getSeasonCapRules` returns exact figures for known seasons and otherwise
> projects forward at a flat growth rate, so a 10-season save still has a sensibly
> growing cap instead of a hard error or a frozen number.

**Q: What would break if the real CBA changed?**

> I'd update the one `SEASON_CAP_RULES` table (and, for a structural change like a
> new apron, the classification in `apron.ts`). Because the rules are centralized,
> the change propagates everywhere automatically.

## 8. Elevator explanation (30s)

> The salary-cap engine models the real NBA collective bargaining agreement — the
> cap, luxury tax, the two apron thresholds, and the trade salary-matching rules.
> I built it as pure, database-free functions with the CBA numbers in a single
> constants table, so the trade validator, free agency, the AI, and the UI all
> enforce the exact same rules from one source of truth. It's the module that
> turns the game from "move players around" into an actual cap-management strategy
> problem, and it's backed by a large suite of unit tests.
