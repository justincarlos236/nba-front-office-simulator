# `trade/salaryMatching.ts` — how much salary can you take back in a trade?

**What this whole file is about:** in a trade, a team that's over the cap can't just take back
any amount of salary — the money coming _in_ has to roughly match the money going _out_, by a
formula. This file is that formula. Given how much salary a team is sending away and which
spending tier it's in, it answers: _"the most salary you're allowed to take back is \___."_

Open the real file: `src/lib/trade/salaryMatching.ts`. It's short and mostly arithmetic — a good
chance to get comfortable doing math with `bigint` money.

---

## Part 1 — imports and one constant

```ts
import { ApronLevel } from "../cap/apron";
import type { SeasonCapRules } from "../cap/constants";

const FLEXIBLE_MATCH_BONUS_CENTS = 250_000_00n;
```

- The imports reach into the neighboring `cap/` folder: `"../cap/apron"`. The `../` means "go **up**
  one folder, then into `cap`." (Compare with `./`, which meant "right next to me.") We borrow the
  five-tier `ApronLevel` list, and the `SeasonCapRules` shape (as a description only, hence `type`).
- `const FLEXIBLE_MATCH_BONUS_CENTS = 250_000_00n;` — a fixed value. Reading the number: underscores
  are just separators, the `n` marks it a `bigint`, and it's in cents, so `250_000_00` is
  **$250,000.** This is a small "cushion" the matching rules add on — we'll see where.

---

## Part 2 — the main formula

```ts
export function maxIncomingSalaryCents(
  outgoingSalaryCents: bigint,
  apronLevel: ApronLevel,
  rules: SeasonCapRules,
): bigint {
  if (outgoingSalaryCents <= 0n) return 0n;

  if (apronLevel === ApronLevel.SECOND_APRON) {
    return outgoingSalaryCents;
  }

  if (apronLevel === ApronLevel.FIRST_APRON) {
    return (outgoingSalaryCents * 110n) / 100n;
  }

  if (outgoingSalaryCents <= rules.tradeMatchLowerBreakpointCents) {
    return outgoingSalaryCents * 2n + FLEXIBLE_MATCH_BONUS_CENTS;
  }

  if (outgoingSalaryCents <= rules.tradeMatchUpperBreakpointCents) {
    return outgoingSalaryCents + rules.tradeMatchLowerBreakpointCents;
  }

  return (outgoingSalaryCents * 125n) / 100n + FLEXIBLE_MATCH_BONUS_CENTS;
}
```

**The signature:** `maxIncomingSalaryCents(outgoingSalaryCents, apronLevel, rules)` — takes how much
salary you're sending out, your spending tier, and the season's rules; hands back the maximum salary
you're allowed to take back (all as `bigint` cents).

The body is a chain of `if` checks, and — like `getApronLevel` — **the order matters**, because the
first matching `if` returns and stops. Let's walk each case.

**Case 0 — a safety check:**

```ts
if (outgoingSalaryCents <= 0n) return 0n;
```

- `<=` means "less than or equal to." If you're somehow sending out zero (or a negative) salary,
  you can take back zero. This just guards against nonsense input before doing real math.

**Case 1 — second-apron teams: match almost exactly (100%):**

```ts
if (apronLevel === ApronLevel.SECOND_APRON) {
  return outgoingSalaryCents;
}
```

- The most-restricted teams can only take back **the same** amount they send out — no extra cushion
  at all. So the max incoming equals the outgoing.

**Case 2 — first-apron teams: 110%:**

```ts
if (apronLevel === ApronLevel.FIRST_APRON) {
  return (outgoingSalaryCents * 110n) / 100n;
}
```

- First-apron teams get a little wiggle room: **110%** of what they send out.
- `(outgoingSalaryCents * 110n) / 100n` — this is how you do "×1.10" with `bigint` money. You can't
  multiply a `bigint` by a decimal like `1.1`, so instead you multiply by `110n` and then divide by
  `100n`, which gives the same result while staying in whole-number cents. (Multiplying first, then
  dividing, keeps it accurate.)

**Now for teams _below_ the aprons — the generous three-tier formula.** These next checks use the two
"breakpoint" figures from the season rules.

**Case 3 — small outgoing salary: 200% + $250k:**

```ts
if (outgoingSalaryCents <= rules.tradeMatchLowerBreakpointCents) {
  return outgoingSalaryCents * 2n + FLEXIBLE_MATCH_BONUS_CENTS;
}
```

- If you're only sending out a _small_ salary (at or below the lower breakpoint), you can take back
  a lot proportionally: **double it** (`* 2n`) **plus $250k** (the cushion). So a $5M outgoing
  player could bring back ~$10.25M. Small deals get the most flexibility.

**Case 4 — mid-range outgoing salary: a flat add-on:**

```ts
if (outgoingSalaryCents <= rules.tradeMatchUpperBreakpointCents) {
  return outgoingSalaryCents + rules.tradeMatchLowerBreakpointCents;
}
```

- For mid-sized salaries (above the lower breakpoint, at or below the upper one), you can take back
  what you send out **plus a flat amount** (the lower breakpoint figure). It's a fixed cushion rather
  than a percentage.

**Case 5 — large outgoing salary: 125% + $250k:**

```ts
return (outgoingSalaryCents * 125n) / 100n + FLEXIBLE_MATCH_BONUS_CENTS;
```

- This last line (no `if`) catches everything left: **big** salaries. Here you can take back
  **125%** (the `* 125n / 100n` trick again) **plus $250k**. Big deals match closer to 1-to-1 — you
  don't get to double a superstar's salary.

**The pattern across all five:** _the higher you spend, the less flexibility you get_ (second apron =
exactly 100%, first apron = 110%), and _among lower-spending teams, smaller trades get proportionally
more room than bigger ones._ This is a faithful copy of the real CBA's tiered matching rules.

---

## Part 3 — two small yes/no helpers

```ts
export function canAggregateSalaries(apronLevel: ApronLevel): boolean {
  return apronLevel !== ApronLevel.SECOND_APRON;
}

export function isUnderCapSpace(apronLevel: ApronLevel): boolean {
  return apronLevel === ApronLevel.UNDER_CAP;
}
```

- `canAggregateSalaries` — "aggregating" means combining several players' salaries into one bigger
  incoming contract. This returns `true` for everyone **except** second-apron teams (`!==` = "not
  equal to"). So the only teams that _can't_ combine salaries are the ones at the second apron.
- `isUnderCapSpace` — returns `true` only if the team is `UNDER_CAP`. A team with cap _space_ doesn't
  need to match salaries at all (they can just absorb salary into their empty room), so callers use
  this to check "does this team even need to worry about the matching formula?"
- Both are one-liners with no `if`, because a comparison is already a true/false value — you just
  hand it straight back.

---

## Zooming out

This file is the pure "how much can you take back?" math. On its own it doesn't decide whether a
whole trade is legal — it just answers this one sub-question. The next file, `validateTrade.ts`, is
the referee that _uses_ these helpers (along with the no-trade-clause and draft-pick rules) to give
a final yes/no on an entire proposed trade.

**Next file:** `trade/validateTrade.md` — the full trade legality checker.
