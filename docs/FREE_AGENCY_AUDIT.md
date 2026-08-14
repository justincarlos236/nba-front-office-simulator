# Free Agency Audit

**Opened** 2026-08-14. Free agency is the other way a roster changes, and the
only major system without an audit doc. `docs/TRADE_AUDIT.md` opened with the
premise that a broken trade system means users can simply exploit the game.
The same premise applies here, and this system is worse.

**Method.** `scripts/free-agency-audit.ts`, read-only, no database. The real
2026-27 dataset's rosters, the actual pricing and validation functions, and a
synthetic free-agent pool run through the real `runCpuFreeAgentPass`.

**Headline.** **The user's signing path never asks whether the player would
accept.** It checks that the money is legal under the cap and writes the
contract. A minimum-salary offer is unconditionally legal, so any free agent in
the game can be signed for the veteran minimum — by a second-apron team with
zero cap space, which is the most constrained state the model has.

Measured largest discount: **35.4x market price.**

---

## FA-P0-1 — There is no willingness check anywhere

`signFreeAgentAction` runs, in order: ownership, roster-size limit, then
`validateSigning`. That function's own docstring is honest about what it is —
"checks whether a team **can** sign a free agent at a given first-year salary"
— and its first branch is:

```ts
if (offerSalaryCents <= rules.emptyRosterChargeCents) {
  return { isValid: true, mechanism: "VETERAN_MINIMUM", ... };
}
```

Always legal, regardless of who the player is. That is correct as CBA
modelling: the minimum genuinely is the one exception no apron restricts. The
defect is that **nothing downstream asks the player.** No willingness function
exists on this path. There is no acceptance model to call.

Measured, offering the minimum as a second-apron team with no cap space:

| Rating | Player | Market price | User pays | Discount | Result |
| ---: | --- | ---: | ---: | ---: | --- |
| 98 | Shai Gilgeous-Alexander | $48.7M | $1.4M | **35.4x** | LEGAL |
| 95 | Victor Wembanyama | $33.4M | $1.4M | 24.2x | LEGAL |
| 89 | James Harden | $28.8M | $1.4M | 20.9x | LEGAL |
| 84 | Desmond Bane | $38.9M | $1.4M | 28.2x | LEGAL |
| 79 | Neemias Queta | $26.5M | $1.4M | 19.2x | LEGAL |
| 67 | Adem Bona | $3.1M | $1.4M | 2.2x | LEGAL |

**It is reachable through the UI without any trickery.** `SignOfferForm`
defaults the salary field to a suggested figure but sets `min={0}`, so the user
edits one number downward and signs.

This is a larger hole than anything in the trade system, and it bypasses all of
that work: there is no reason to assemble matched salaries and pick
compensation for a star when the same star can be signed for $1.4M with no
assets at all.

---

## FA-P1-1 — The cap binds the CPU and not the user

The CPU market is modelled carefully. `runCpuFreeAgentPass` sorts best-player-
first, checks live cap space that falls as the pass spends it, holds back 30%
of a club's room so one signing cannot empty the market into one team, and
routes every decision through the same `evaluateReSigningDecision` the
re-signing pass uses.

Every one of those constraints applies only to rival clubs.

Measured on a 90-player pool with 30 rival teams (10 holding cap space, median
roster 12):

| Rating band | In pool | Left unsigned | Available to the user |
| --- | ---: | ---: | ---: |
| 85+ (stars) | 10 | 6 | **60%** |
| 80-84 | 9 | 8 | 89% |
| 75-79 | 17 | 13 | 76% |
| 70-74 | 16 | 14 | 88% |
| under 70 | 38 | 26 | 68% |

Best player the CPU left on the table: **Anthony Edwards (93)** — market
$40.6M, available to the user for $1.4M, a 29.5x discount.

The CPU leaving stars unsigned is not itself wrong. Only a third of clubs had
room, and a market that cannot absorb its supply is realistic. The defect is
the asymmetry: **a rival needs cap space to sign him and the user does not**,
because the minimum is always legal. The more faithfully the CPU respects the
cap, the more talent it leaves sitting for a user who is not bound by it.

> **Caveat on the pool.** This is a synthetic pool — every fifth player in the
> dataset — so ten stars reach free agency at once, which no real offseason
> does. The *percentages* are therefore directional, not predictions. What does
> not depend on the pool's composition is the price gap, which is a property of
> the signing path.

---

## FA-P2-1 — Competition cannot move a max player's price

`demandAdjustedPriceCents` adds 8% per additional serious suitor, capped at
32%. Measured on a mid-market player, it works exactly as documented:

| Suitors | Price | Premium |
| ---: | ---: | ---: |
| 1 | $19.4M | 0% |
| 2 | $20.9M | 8% |
| 3 | $22.5M | 16% |
| 4 | $24.0M | 24% |
| 5+ | $25.6M | 32% |

At the top of the market it does nothing. A player whose base price already
sits at the individual maximum — Cade Cunningham at $40.6M — costs $40.6M with
one suitor and $40.6M with eight. `clampToMaxSalary` absorbs the entire
premium.

This is defensible rather than wrong: a real max contract is a max contract,
and competition for those players expresses itself in years and options rather
than salary. Recording it because the effect is invisible from the code — the
premium looks like it applies to everyone — and because it means the players
competition should matter most for are the ones where it is inert.

---

## FA-P2-2 — Uniform 5% escalation

`signFreeAgentAction` hard-codes `1 + 0.05 * i` for every deal. The linear
shape is right: real CBA raises are a fixed percentage of first-year salary,
5% with Bird rights and 8% on a max. Applying it to minimum deals is wrong —
real minimum contracts follow a flat league scale — but the amounts are
trivial and this is cosmetic.

---

## Findings

| ID | Sev | Type | Finding |
| --- | --- | --- | --- |
| **FA-P0-1** | P0 | EXPLOIT | The user's signing path has no willingness or acceptance check. Any free agent signs for the veteran minimum, from any cap position, at up to a 35.4x discount. Reachable through the UI. |
| **FA-P1-1** | P1 | MODEL | Cap constraints bind rival clubs and not the user, so the more faithfully the CPU market behaves the more talent it leaves available at the minimum. 60% of stars in the measured pool. |
| **FA-P2-1** | P2 | MODEL | The demand premium is absorbed entirely by the individual maximum, so competition cannot move the price of the players it should matter most for. |
| **FA-P2-2** | P2 | POLISH | Uniform 5% annual escalation applied to minimum deals, which are flat by scale in reality. |

---

## Scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| Cap-rule modelling | **9** | `validateSigning` models cap space, Bird rights, both mid-level exceptions, apron gating and the minimum correctly and readably. |
| CPU market behaviour | **8** | Best-first clearing, live cap space, a demand premium, a 70% spend ceiling, and decisions reused from the re-signing engine rather than duplicated. |
| Board / outcome consistency | **9** | The teams shown as interested are the only teams allowed to sign, and the quoted price is the charged price. Deliberate, documented, and it holds. |
| **User-side price integrity** | **1** | Absent. Not weak — there is no acceptance model on this path at all. |

**Weighted overall: 4.2.** The lowest of any audited system, below team
strength's 5.0 before it was fixed. The CPU half of this system is among the
better-built things in the codebase; the user half has no floor.

---

## Recommendation

**Add an acceptance check to the user's signing path**, using the machinery
that already exists. `evaluateReSigningDecision` already answers "would this
player accept this money from this team", it is already tested, and the CPU
pass already calls it. The user path is the only signing route that does not.

The pieces needed are all present:

- `priceContractCents` gives the asking price — the same figure rivals pay
- `demandAdjustedPriceCents` gives the competition-adjusted ask, and is already
  exported specifically so the board can quote it
- `computeRivalInterest` already knows who else is bidding

A player should decline an offer meaningfully below his ask unless nobody else
wants him. Minimum deals must stay possible — that is how real teams fill
out rosters, and `getPlayerValueTier` already draws the line between a rotation
player and a star — but a 93-rated player accepting the minimum while six clubs
want him should not be reachable.

**Do not fix this by removing the minimum-salary branch from
`validateSigning`.** That function is right. It answers a cap question and
answers it well; the missing check is a different question that belongs to the
action, next to the roster-size limit that was added there for the same reason.

---

## Reproducing

```
npx tsx scripts/free-agency-audit.ts
```

## A note on the harness

Two results in the first run were artefacts and are worth recording, because
both are failure modes a scripting harness invites:

- **"0 of 90 free agents drew rival interest"** — the pool players were never
  removed from their rosters, so every club looked full and the roster gate
  skipped all of them.
- **"the demand premium is 0% at every suitor count"** — measured on a top-20
  player whose base price already sits at the maximum, so the clamp ate it.

Neither survived a corrected harness. `tsx` does not typecheck, so a
wrongly-shaped `TeamNeed` also passed silently — the same failure that produced
an invalid identity string in the trade audit.
