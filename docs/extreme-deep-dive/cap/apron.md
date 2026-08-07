# `cap/apron.ts` — the five team "spending tiers"

**What this whole file is about, in one breath:** in the NBA, the more money a team
spends on players, the more restrictions it faces. This file defines the five "spending
levels" a team can be in, and gives simple machines (functions) that answer: _"given how
much this team is spending, which level are they in, and what money tools are they still
allowed to use?"_

Read the real file next to this: `src/lib/cap/apron.ts`. It's short — about 40 lines.
We'll go through nearly all of them.

---

## Line 1 — borrowing a description from a neighbor file

```ts
import type { SeasonCapRules } from "./constants";
```

- `import` means "bring in something that was defined in another file."
- `type` means we're only bringing in a **description of a shape**, not actual running
  code. (Remember from the primer: a "type" is a label describing what kind of data
  something is.)
- `SeasonCapRules` is the name of that description. It describes the bundle of dollar
  figures for one NBA season — the salary cap, the luxury tax line, and so on. (That bundle
  is defined in the file `constants.ts`, which is what `"./constants"` points to — the
  `./` means "a file sitting right next to this one.")

So this line says: _"I'm going to use the `SeasonCapRules` description, which lives next
door in `constants.ts`."_ We need it because the functions below take a season's rules as
an input.

---

## Lines 3–9 — the list of spending levels

```ts
export enum ApronLevel {
  UNDER_CAP = "UNDER_CAP",
  BETWEEN_CAP_AND_TAX = "BETWEEN_CAP_AND_TAX",
  TAXPAYER = "TAXPAYER",
  FIRST_APRON = "FIRST_APRON",
  SECOND_APRON = "SECOND_APRON",
}
```

- `export` = "let other files use this."
- `enum` (say "ee-num," short for _enumeration_) is a **fixed multiple-choice list of named
  options** — like a dropdown menu with exactly these choices and no others.
- `ApronLevel` is the name of this list.
- Inside the `{ }` are the five allowed options, from _least_ spending to _most_:
  - **`UNDER_CAP`** — spending below the salary cap (the team has "room" to add players).
  - **`BETWEEN_CAP_AND_TAX`** — over the cap but under the luxury-tax line.
  - **`TAXPAYER`** — over the luxury-tax line (they now owe a tax penalty).
  - **`FIRST_APRON`** — over the first, higher spending threshold.
  - **`SECOND_APRON`** — over the second, highest threshold (the most restricted).
- The `= "UNDER_CAP"` part just says the behind-the-scenes value of each option is a piece
  of text spelling out its own name. (That's convenient for saving it in the database and
  for reading logs — you see the word `"TAXPAYER"` rather than a mystery number.)

**Why have this at all?** Everywhere else in the app, code can now say "is this team a
`TAXPAYER`?" using a clear name, instead of juggling raw dollar amounts. One tidy list of
official options that the whole app agrees on.

---

## Lines 11–18 — the main machine: which level is a team in?

```ts
export function getApronLevel(totalSalaryCents: bigint, rules: SeasonCapRules): ApronLevel {
  if (totalSalaryCents >= rules.secondApronCents) return ApronLevel.SECOND_APRON;
  if (totalSalaryCents >= rules.firstApronCents) return ApronLevel.FIRST_APRON;
  if (totalSalaryCents >= rules.luxuryTaxCents) return ApronLevel.TAXPAYER;
  if (totalSalaryCents >= rules.salaryCapCents) return ApronLevel.BETWEEN_CAP_AND_TAX;
  return ApronLevel.UNDER_CAP;
}
```

**The first line (the "signature") describes the machine's inputs and output:**

- `function getApronLevel(...)` — a machine named `getApronLevel`.
- `totalSalaryCents: bigint` — the first input is the team's total spending, as a `bigint`
  (a big whole number) of **cents**. (Recall: money is stored in cents to avoid rounding
  errors — `$150 million` is the whole number `15,000,000,000` cents.)
- `rules: SeasonCapRules` — the second input is that season's rule bundle (the one we
  imported on line 1). We need it because the thresholds (cap, tax, aprons) are different
  each season.
- `: ApronLevel` — after the inputs, this says the machine **hands back** one of the five
  `ApronLevel` options.

**The body — a chain of `if` checks, from highest threshold to lowest:**

- `if (totalSalaryCents >= rules.secondApronCents) return ApronLevel.SECOND_APRON;`
  - `>=` means "greater than or equal to." So this reads: _"If the team's spending is at or
    above the second-apron threshold, the answer is `SECOND_APRON` — hand that back and
    stop."_ (`return` both hands back the answer **and** ends the machine immediately.)
- If that wasn't true, we fall to the next line and check the first apron, then the tax
  line, then the cap.
- `return ApronLevel.UNDER_CAP;` — the last line has no `if`. If **none** of the thresholds
  were reached, the team must be spending below the cap, so the answer is `UNDER_CAP`.

**Why check from highest to lowest?** Because a team spending a _huge_ amount is technically
"above the cap" AND "above the tax" AND "above the aprons" — all of them at once. By
checking the biggest threshold first and stopping the moment one matches, we correctly
report the _highest_ level they've crossed. If we checked lowest-first, we'd wrongly stop
at "over the cap" for a team that's actually way past the second apron.

**The big idea:** one number goes in (total spending) and one clean label comes out. The
rest of the app never has to compare dollar amounts itself — it just asks this machine.

---

## Lines 20–36 — what money tool is this team allowed to use?

```ts
export function eligibleMidLevelException(
  level: ApronLevel,
): "ROOM" | "NON_TAXPAYER" | "TAXPAYER" | null {
  switch (level) {
    case ApronLevel.UNDER_CAP:
      return "ROOM";
    case ApronLevel.BETWEEN_CAP_AND_TAX:
    case ApronLevel.TAXPAYER:
      return "NON_TAXPAYER";
    case ApronLevel.FIRST_APRON:
      return "TAXPAYER";
    case ApronLevel.SECOND_APRON:
      return null;
  }
}
```

Real NBA background: a "mid-level exception" is a special allowance that lets an
over-the-cap team still sign one mid-priced player. There are different-sized versions, and
the higher you spend, the smaller the version you're allowed — until you're spending so
much you get none at all.

- `function eligibleMidLevelException(level: ApronLevel)` — a machine that takes one input:
  a `level` (one of our five options).
- `: "ROOM" | "NON_TAXPAYER" | "TAXPAYER" | null` — this is the output description, and the
  `|` means **"or."** So it hands back one of the texts `"ROOM"`, `"NON_TAXPAYER"`,
  `"TAXPAYER"`, **or** `null` ("nothing / not allowed any"). Listing the exact allowed
  texts like this is TypeScript's way of promising the answer is always one of those four
  things — never some random other word.
- `switch (level) { ... }` — a `switch` is a cleaner way to write a big "if it's this, do
  that; if it's this other thing, do this other thing" for one value. It looks at `level`
  and jumps to the matching `case`.
- `case ApronLevel.UNDER_CAP: return "ROOM";` — "if the level is `UNDER_CAP`, hand back
  `"ROOM"`" (a team with cap space uses the _room_ exception).
- The next bit stacks two cases together:
  ```ts
  case ApronLevel.BETWEEN_CAP_AND_TAX:
  case ApronLevel.TAXPAYER:
    return "NON_TAXPAYER";
  ```
  When two `case` labels sit right on top of each other with no code between them, they
  **share** the code below. So this reads: _"if the level is either `BETWEEN_CAP_AND_TAX`
  or `TAXPAYER`, hand back `"NON_TAXPAYER"`."_
- `case ApronLevel.FIRST_APRON: return "TAXPAYER";` — a first-apron team only gets the
  smaller _taxpayer_ version.
- `case ApronLevel.SECOND_APRON: return null;` — a second-apron team gets **none**, so the
  answer is `null` (the "nothing" value).

**The idea:** the app can ask "what signing tool does this team still have?" and get a clean
answer, encoding the real CBA rule that spending more strips away your tools.

---

## Lines 38–41 — a simple yes/no check

```ts
export function canUseBiAnnualException(level: ApronLevel): boolean {
  return level !== ApronLevel.SECOND_APRON;
}
```

- The "bi-annual exception" is yet another small signing tool. The only rule modeled here:
  a second-apron team can't use it; everyone else can.
- `: boolean` — this machine hands back a **boolean**, i.e. `true` or `false`.
- `return level !== ApronLevel.SECOND_APRON;`
  - `!==` means **"is not equal to."**
  - So this whole line reads: _"hand back `true` if the level is NOT `SECOND_APRON`,
    otherwise `false`."_ A team that isn't at the second apron **can** use it (`true`); a
    second-apron team **can't** (`false`).
- Notice there's no `if` here — the comparison `level !== ApronLevel.SECOND_APRON` is
  _itself_ already a true/false value, so we just hand it straight back. That's a common,
  tidy shortcut.

---

## Zooming back out — what did this file give the rest of the app?

Three small, reliable machines built on one shared list of five levels:

1. `getApronLevel` — turn a dollar amount into a clean level label.
2. `eligibleMidLevelException` — turn a level into "which signing tool you may use."
3. `canUseBiAnnualException` — turn a level into a simple yes/no.

Every one of them takes plain data and hands back plain data — no database, no surprises.
That's the "pure function" idea you'll see everywhere: small machines that are easy to
trust and easy to test, because the same input always gives the same output.
