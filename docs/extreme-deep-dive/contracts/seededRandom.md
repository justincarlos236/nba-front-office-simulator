# `contracts/seededRandom.ts` — random numbers that are _repeatable_

**What this whole file is about:** the sim needs randomness (contracts have a bit of negotiation
luck, players have random personalities, etc.). But it needs a _special_ kind of randomness:
**repeatable** randomness. If you re-run the same setup, you should get the _same_ "random" results,
not new ones every time. This file makes that possible — you give it a **seed** (a piece of text),
and it hands you a random-number machine whose sequence is fixed by that seed.

Open the real file: `src/lib/contracts/seededRandom.ts`. Fair warning: parts of this use low-level
"bit math" that even experienced programmers copy from a reference rather than write from scratch. I'll
explain _what each part is for_ — you do **not** need to understand every bit operation to understand
the file. This is one place where "grasp the purpose" beats "trace every character."

---

## Why would you want _repeatable_ random numbers?

Normally, "random" means unpredictable — a dice roll. But that makes **testing** and
**reproducibility** hard. If a player's generated contract were truly random, re-running the setup
script would produce different contracts every time, and a test could never check "this player should
get _this_ deal."

The fix: **seeded** randomness. A seed is a starting value. The same seed always produces the same
sequence of "random" numbers. It's still random-_looking_ (spread out, unpredictable-feeling), but
it's actually a fixed recipe. In this project, the seed is usually a player's ID — so "player #123
always negotiates the same contract," which makes the whole thing reproducible.

This is called a **pseudo-random number generator** (PRNG) — "pseudo" because it only _looks_ random;
it's really a deterministic formula.

---

## Part 1 — turning text into a starting number (a "hash")

```ts
function hashStringToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
```

The PRNG below needs a _number_ to start from, but our seed is _text_ (like a player ID). This helper
turns text into a number — a **"hash."** A hash mixes up its input into a scrambled-looking number,
where a tiny change in the text produces a very different number.

You don't need the details, but at a glance:

- `let hash = 0x811c9dc5;` — a starting value. The `0x...` means the number is written in
  **hexadecimal** (base-16) — just a different way to write a big number; it's a well-known magic
  starting constant for this particular hash recipe (called "FNV").
- `for (let i = 0; i < seed.length; i++)` — a classic **`for` loop**: it counts `i` from 0 up to the
  length of the text, running the body once per character. (`i++` means "add 1 to `i`.")
- `hash ^= seed.charCodeAt(i);` — `seed.charCodeAt(i)` gets the numeric code of the `i`-th character.
  `^=` is a bit-mixing operation (XOR) that blends that character's code into `hash`.
- `hash = Math.imul(hash, 0x01000193);` — multiply the running hash by another magic constant.
  `Math.imul` is a special multiply that keeps the result a proper 32-bit whole number.
- `return hash >>> 0;` — `>>> 0` is a trick to force the number into an "unsigned 32-bit integer"
  (a plain non-negative whole number in a fixed range).

**The takeaway:** feed in any text, get out a scrambled starting number. The exact bit operations are a
standard, copied recipe — the _point_ is "text → a good starting number."

---

## Part 2 — the machine that makes a machine

```ts
export function createSeededRandom(seed: string): () => number {
  let state = hashStringToUint32(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Here's the important concept — even more than the math. Look at the return type:
`createSeededRandom(seed: string): () => number`. It **returns a function** (`() => number` means "a
function that takes nothing and gives back a number").

So `createSeededRandom` is a **machine that builds another machine.** You call it once with a seed, and
it hands you back a little random-number generator. Each time you _then_ call _that_, you get the next
number in the sequence.

- `let state = hashStringToUint32(seed);` — turn the text seed into a starting number, stored in
  `state`. `state` is the generator's "memory" of where it is in the sequence.
- `return () => { ... };` — return a new function. Every time this returned function runs, it:
  - scrambles `state` forward to the next value (that's what the `Math.imul`/`^`/`>>>` lines do — the
    "mulberry32" recipe, another standard, copied PRNG algorithm), and
  - `return ((t ^ ...) >>> 0) / 4294967296;` — produces a final number and **divides by 4294967296**
    (which is 2³², the biggest 32-bit value) to squeeze the result into the range **0 to 1** — the
    standard range for a random number.
- **The clever bit:** the returned function _remembers_ `state` between calls (this is called a
  "closure" — an inner function keeps access to a variable from the function that created it). So each
  call advances the sequence. Same seed → same starting `state` → same whole sequence, forever.

Again: the bitwise lines are a well-known PRNG recipe. What matters is the shape — **"give a seed, get
back a repeatable random-number function."**

---

## Part 3 — a friendly range helper

```ts
export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
```

The generator gives numbers between 0 and 1, but you usually want a number in some other range (like
"between 0.85 and 1.15"). This helper does that conversion.

- `rng: () => number` — the first input is a random-number _function_ (one of the machines
  `createSeededRandom` builds). This is a very common pattern in the codebase: functions take an `rng`
  so they can be random _when running_ but predictable _when testing_ (a test can pass a fake `rng`).
- `min + rng() * (max - min)` — call `rng()` to get a 0-to-1 value, multiply it by the size of the
  range (`max - min`), and add `min`. Example: with `min = 0.85`, `max = 1.15`, the range size is
  `0.30`; a `rng()` of `0.5` gives `0.85 + 0.5 * 0.30 = 1.0`. So it stretches the 0-to-1 value to land
  somewhere between `min` and `max`.

---

## Zooming out

This little file is the source of _all_ the "controlled luck" in the sim. Two ideas are worth
keeping:

1. **Seeded = repeatable.** Same seed, same sequence — which is why generated contracts and
   personalities are stable across re-runs and testable.
2. **A function that returns a function.** `createSeededRandom` builds a generator that remembers its
   place; you keep calling it for the next number. And functions that need randomness take that
   generator as an input, so they stay testable.

And don't feel bad about not decoding the bit math — that's a standard algorithm even pros look up. The
_shape_ is what matters.

**Next file:** `contracts/generateContract.md` — which uses this generator (plus the value math from
`valuation/`) to build a realistic multi-year contract.
