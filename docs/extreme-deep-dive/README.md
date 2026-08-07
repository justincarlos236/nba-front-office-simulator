# Extreme Deep-Dive — Reading the Code Line by Line

This is the **most beginner-friendly** set of docs, and the most detailed. Every other
doc set assumes you can read code; **this one assumes you're new to programming** and
walks through the actual source almost line by line, explaining what each line _does_ and
what the syntax _means_.

Read this with the real file open next to it. Each doc mirrors one source file.

> **This is a big, ongoing build.** The codebase has ~150 files. Docs get added file by
> file over time. If a file isn't covered yet, its plain-English _concepts_ are in
> `docs/code-deep-dive/` and `docs/handbook/`.

---

## A 5-minute programming primer (read this first)

The whole project is written in **TypeScript** — a programming language that is
**JavaScript** (the language of the web) with **types** added on top. A "type" is just a
label describing what kind of value something is: a number, some text, a yes/no, a list,
etc. Types help catch mistakes before the program runs.

Here's the vocabulary you'll see over and over. Once you know these, most lines make
sense — and I won't re-explain them in every single file.

### Values and variables

- **`const name = value`** — makes a named box holding a value that **won't change**.
  `const` = "constant." Example: `const DOLLARS = 100` means "from now on, the word
  `DOLLARS` means 100."
- **`let name = value`** — like `const`, but the value **can change** later.
- A value can be:
  - a **number**: `100`, `0.14`, `-5`
  - a **string** (text, in quotes): `"Boston"`, `'PG'`
  - a **boolean** (yes/no): `true` or `false`
  - **`null`** — "intentionally nothing / empty."
  - an **array** (a list, in square brackets): `[1, 2, 3]` or `["a", "b"]`
  - an **object** (a labeled bundle, in curly braces): `{ city: "Boston", wins: 50 }`

### Types (the labels)

- After a colon, you'll see a value's type: `age: number`, `name: string`,
  `healthy: boolean`.
- **`?`** after a name means **optional / maybe missing**: `nickname?: string` means "there
  might be a nickname, or there might not."
- **`| null`** means "this, OR nothing": `string | null`.
- **`interface`** / **`type`** — a _named description of a shape_. Think of it as a form
  template: "a Player has a name (text), an age (number), …". It's not real running code;
  it's a description the type-checker uses.
- **`enum`** — a fixed multiple-choice list of named options, e.g. the five spending tiers
  a team can be in. Like a dropdown menu with a set list of choices.

### Functions (reusable machines)

- A **function** is a little machine: you feed it inputs, it does some work, and it hands
  back a result.
- **`function doThing(x: number): number { ... }`** reads as: "a machine named `doThing`
  that takes one number `x`, and gives back (`:`) a number." The work happens inside the
  `{ }`.
- **`return value`** — "hand this value back as the answer, and stop."
- **`export`** in front of anything means "let _other_ files use this."
- **`import { thing } from "./file"`** — "borrow `thing` that was `export`ed from another
  file." `import type { ... }` borrows only a _type_ (a description), not runnable code.
- An **arrow function** is a shorter way to write a function: `(x) => x + 1` is a machine
  that takes `x` and gives back `x + 1`. You'll see these passed _into_ other functions.

### Making decisions and repeating

- **`if (condition) { A } else { B }`** — "if the condition is true, do A, otherwise do
  B." A condition is anything that's true or false, like `age >= 30` ("age is 30 or more").
- **Comparisons:** `>=` (≥), `<=` (≤), `>` (greater), `<` (less), `===` (exactly equal),
  `!==` (not equal).
- **`for (...) { ... }`** and **`.map(...)` / `.filter(...)` / `.reduce(...)`** — ways to
  do something to _every item in a list_. `.map` transforms each item, `.filter` keeps only
  some, `.reduce` combines them into one value (like a total). We'll explain each the first
  few times.

### A few project-specific things

- **`bigint`** — a special kind of number for _very large whole numbers_. The project stores
  money as a `bigint` number of **cents** (so `$150,000,000` is stored as the whole number
  `15000000000`). A `bigint` is written with an `n` on the end: `100n`. This avoids the tiny
  rounding errors regular numbers have with money.
- **`rng`** — short for "random number generator." When you see a function take an `rng`,
  it's being handed a machine that produces random numbers, so the function can be random
  _when playing_ but predictable _when testing_.
- **`Math.round(x)`, `Math.max(a, b)`, `Math.min(a, b)`** — built-in helpers: round to the
  nearest whole number; pick the bigger of two; pick the smaller of two.
- **`//`** starts a **comment** — a note for humans that the computer ignores.

That's it. With those, you can read most of this codebase. Each doc below assumes you know
this primer and explains everything file-specific from there.

---

## Two tracks in this folder

This set has **two kinds of docs**, and you can read either first:

- **Track A — "The Whole Simulator, Explained"** (`00-*` files): everything about the
  simulator _as a thing_, for a total beginner — what it is, the real NBA and salary-cap
  concepts it copies, how a season plays out, and how all the pieces connect. **No code
  required.** Start here if you're new.
- **Track B — the code, line by line** (files that mirror the source, like
  `cap/apron.md`): the actual source walked through nearly line by line, in plain language.
  Read a Track A topic first, then the matching Track B files to see how it's built.

---

## Index (grows over time)

### Track A — The Whole Simulator, Explained ✅ COMPLETE

Read these in order; no code needed.

- [00-the-big-picture.md](./00-the-big-picture.md) — what this whole thing _is_
- [01-nba-and-salary-cap.md](./01-nba-and-salary-cap.md) — the real NBA money rules
- [02-how-a-season-works.md](./02-how-a-season-works.md) — schedule → sim → playoffs → offseason
- [03-the-money-game.md](./03-the-money-game.md) — finances, fans, franchise value
- [04-the-draft.md](./04-the-draft.md) — the lottery, prospects, and future picks
- [05-being-a-gm.md](./05-being-a-gm.md) — job security, firing, reputation & career
- [06-how-the-software-is-shaped.md](./06-how-the-software-is-shaped.md) — the program's parts (bridge to Track B)

### Track B — The code, line by line

#### `cap/` — the salary-cap rules ✅ FOLDER COMPLETE

- [cap/apron.md](./cap/apron.md) — the five team "spending tiers"
- [cap/constants.md](./cap/constants.md) — the season-by-season dollar figures
- [cap/capSheet.md](./cap/capSheet.md) — adding a team's salaries into a cap sheet
- [cap/capStatusLabel.md](./cap/capStatusLabel.md) — five tiers → three simple labels
- [cap/multiYearProjection.md](./cap/multiYearProjection.md) — how much of future seasons is already spent
- [cap/financialFlexibilityGrade.md](./cap/financialFlexibilityGrade.md) — one A–F cap-health grade

#### `trade/` — trade rules ✅ FOLDER COMPLETE

- [trade/salaryMatching.md](./trade/salaryMatching.md) — how much salary you can take back
- [trade/validateTrade.md](./trade/validateTrade.md) — the full "is this trade legal?" referee
- [trade/evaluateTradeOffer.md](./trade/evaluateTradeOffer.md) — how the CPU decides if it _wants_ a trade

#### `valuation/` — how good / how valuable is a player ✅ FOLDER COMPLETE

- [valuation/playerValue.md](./valuation/playerValue.md) — stats → a 60–99 rating → a dollar value
- [valuation/ageCurve.md](./valuation/ageCurve.md) — how age boosts/discounts value
- [valuation/playerValueTier.md](./valuation/playerValueTier.md) — rating → a friendly tier label

#### `contracts/` — generating player contracts ✅ FOLDER COMPLETE

- [contracts/seededRandom.md](./contracts/seededRandom.md) — repeatable ("seeded") random numbers
- [contracts/generateContract.md](./contracts/generateContract.md) — building a realistic multi-year deal

> **Milestone:** the whole "value & money" half of the codebase (`cap/` + `trade/` + `valuation/` +
> `contracts/`) is now covered line-by-line — 14 files.

#### `simulation/` — how games & seasons are played out ✅ FOLDER COMPLETE

- [simulation/teamStrength.md](./simulation/teamStrength.md) — roster of ratings → one strength number
- [simulation/simulateGame.md](./simulation/simulateGame.md) — strengths → who wins + a score
- [simulation/playoffSeeding.md](./simulation/playoffSeeding.md) — ranking teams for the playoffs
- [simulation/playInTournament.md](./simulation/playInTournament.md) — the play-in mini-tournament
- [simulation/simulateSeries.md](./simulation/simulateSeries.md) — a best-of-7 series (`while` loops)
- [simulation/boxScore.md](./simulation/boxScore.md) — team score → believable individual stat lines
- [simulation/generateSchedule.md](./simulation/generateSchedule.md) — the 82-game calendar
- [simulation/leagueEvents.md](./simulation/leagueEvents.md) — injuries + computer-vs-computer moves
- [simulation/simulateLiveGame.md](./simulation/simulateLiveGame.md) — the quarter-by-quarter live game

> **Milestone:** the whole on-court **simulation** half is now covered line-by-line — 9 files.

#### `gm/` — career, AI brain, expectations (in progress)

- [gm/playerTradeValue.md](./gm/playerTradeValue.md) — one number for a player's trade value ✅
- [gm/draftPickTradeValue.md](./gm/draftPickTradeValue.md) — one number for a pick's trade value ✅
- [gm/gmPersonality.md](./gm/gmPersonality.md) — the seven front-office "personality" dials ✅
- [gm/teamIdentity.md](./gm/teamIdentity.md) — contender / rebuilder / etc. ✅
- [gm/teamNeeds.md](./gm/teamNeeds.md) — what holes a roster has ✅
- [gm/payrollTier.md](./gm/payrollTier.md) — spending → four tiers ✅
- [gm/expectationLevel.md](./gm/expectationLevel.md) — the bar the owner sets each season ✅
- [gm/seasonEvaluation.md](./gm/seasonEvaluation.md) — did you meet the bar? → owner-confidence change ✅
- [gm/jobSecurity.md](./gm/jobSecurity.md) — confidence number → readable label ✅
- [gm/careerRecord.md](./gm/careerRecord.md) — a finished tenure → lifetime reputation ✅
- [gm/jobMarket.md](./gm/jobMarket.md) — reputation gates which team hires you next ✅
- _(last few: `reSigningDecision`, `ownershipMessages`, `actionCenter`, `teamDraftContext`)_

#### Later domains (after gm/)

- _(`finances/`, `fans/`, `morale/`, `draft/`, `data-sources/`, then `development/`, `rotation/`,
  `staff/`, `transactions/`, `league/`, `players/`, and the `actions/` layer)_

_(then the rest — gm, finances, fans, morale, draft, data-sources, development, rotation, staff,
transactions, actions…)_

_(then valuation/ + contracts/, then simulation/, then the rest — ~150 files total)_
