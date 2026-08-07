# Code Guide — Understanding the Actual Implementation

This is a **companion** to `docs/handbook/`. The handbook explains _concepts and
decisions_ for interviews. This set explains **how the code actually works** —
the real files, functions, control flow, and the recurring techniques — so you
can open any file and understand what you're looking at, and answer "walk me
through the code that does X."

It is **not** a line-by-line commentary. It's a guided tour of the real structure
and the patterns, using actual function names and signatures from the codebase.

## Reading order

| #   | Doc                                                                          | What you'll learn                                                                                 |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 00  | [README.md](./README.md)                                                     | How to read the code; the 4 rules that explain 90% of it                                          |
| 01  | [01-codebase-map.md](./01-codebase-map.md)                                   | The real folder tree, file-naming conventions, and how to trace any feature from click → database |
| 02  | [02-request-walkthrough.md](./02-request-walkthrough.md)                     | A real server action (`executeTradeAction`) traced block-by-block                                 |
| 03  | [03-cap-and-trade-code.md](./03-cap-and-trade-code.md)                       | The actual cap + trade-validation code (the real functions)                                       |
| 04  | [04-simulation-code.md](./04-simulation-code.md)                             | The actual simulation code + the chunked season loop                                              |
| 05  | [05-ratings-contracts-development.md](./05-ratings-contracts-development.md) | How a stat line becomes a rating, a contract, and then grows/declines                             |
| 06  | [06-patterns-and-idioms.md](./06-patterns-and-idioms.md)                     | The recurring code techniques used _everywhere_ — this is the real "deep knowledge" doc           |
| 07  | [07-extending-the-codebase.md](./07-extending-the-codebase.md)               | "If I wanted to add X, which files do I touch?" — cements the mental model                        |

## The 4 rules that explain 90% of this codebase

If you internalize these four things, almost any file makes sense on sight.

### Rule 1 — Two kinds of files: _pure logic_ vs. _server actions_

- A file in `src/lib/<domain>/` (e.g. `cap/`, `simulation/`, `valuation/`) is
  **pure logic**: it exports functions that take plain data and return plain data.
  No `prisma`, no `auth`, no `await` on I/O. You can read it top-to-bottom like a
  math library.
- A file in `src/lib/actions/` starts with `"use server"` and is a **server
  action**: it does the database/auth/effect work and _calls_ the pure logic.
- **How to tell instantly:** does the file import `prisma` or `auth`? Then it's a
  shell/action. Does it only import from other `lib/` domains? Then it's pure.

### Rule 2 — Every server action has the same skeleton

```ts
export async function doSomethingAction(input) {
  const session = await auth();                     // 1. authenticate
  if (!session?.user) redirect("/sign-in");
  const league = await prisma.league.findUnique(...);
  if (!league || league.ownerId !== session.user.id) // 2. authorize (ownership)
    throw new Error("League not found");
  // 3. validate input (zod or type/range checks)
  const [rowsA, rowsB] = await Promise.all([...]);  // 4. load data (in parallel)
  const result = pureFunction(rowsA, rowsB);        // 5. compute (pure core)
  await prisma.$transaction([...]);                 // 6. write (atomic if multi-row)
  revalidatePath(...);                              // 7. refresh UI
}
```

Once you've read one action, you've read the shape of all of them.

### Rule 3 — Money is `BigInt` cents; ratings are plain numbers

- Any name ending in `Cents` is a `BigInt` integer number of cents. You'll see
  `Number(x)` used to bridge into float math and `BigInt(Math.round(...))` to
  bridge back. That dance is deliberate (exact money, see handbook doc 02).
- Ratings/strengths are ordinary `number`s on a 60–99-ish scale.

### Rule 4 — Randomness is always _injected_, never called directly in pure code

- Pure functions that need randomness take an `rng: () => number` parameter.
  Production passes `Math.random` (or a **seeded** generator for reproducibility);
  tests pass a fake. So you'll see `rng()` inside pure functions, never
  `Math.random()` — that's what makes the "random" logic testable.

## How to trace any feature (the practical method)

Say you want to understand "signing a free agent." Do this:

1. **Find the page:** `src/app/leagues/[id]/free-agents/...` — the UI.
2. **Find the action it calls:** search for the `...Action` imported by that page →
   `src/lib/actions/freeAgency.ts`. That's the shell.
3. **Read the action's skeleton** (Rule 2) to see what it loads and writes.
4. **Follow the pure calls:** the action imports functions from `lib/cap/`,
   `lib/valuation/`, etc. — those are the actual rules. Read them; they're pure and
   self-contained.
5. **Check the tests:** next to any pure file `foo.ts` is `foo.test.ts` — the tests
   are worked examples of exactly what the function does with real inputs.

That five-step loop works for every feature in the app.
