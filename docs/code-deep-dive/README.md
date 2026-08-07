# Code Deep-Dive — Exhaustive, File-by-File

This is the **most detailed** set. Where `docs/code-guide/` gives you the mental
model, this set walks **most of the actual code** — every significant file and
function in a domain, with real signatures, the real constants/formulas, inputs,
outputs, and why it's written that way.

It's long on purpose. Read a domain when you want to _actually know_ that code,
not just describe it. Every claim here is read from the real source.

## Domains

### The complete set (all 10 domains)

| #   | Doc                                                                                  | Covers (folders)                                                                             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 01  | [01-cap-trades-and-value.md](./01-cap-trades-and-value.md)                           | `cap/`, `trade/`, `valuation/`, `contracts/`                                                 |
| 02  | [02-simulation.md](./02-simulation.md)                                               | `simulation/`                                                                                |
| 03  | [03-data-sources.md](./03-data-sources.md)                                           | `data-sources/`                                                                              |
| 04  | [04-gm.md](./04-gm.md)                                                               | `gm/` (career, AI, expectations, trade value)                                                |
| 05  | [05-finances-fans-morale.md](./05-finances-fans-morale.md)                           | `finances/`, `fans/`, `morale/`                                                              |
| 06  | [06-draft.md](./06-draft.md)                                                         | `draft/`                                                                                     |
| 07  | [07-league-players-staff-transactions.md](./07-league-players-staff-transactions.md) | `development/`, `league/`, `players/`, `rotation/`, `staff/`, `transactions/`, `freeagency/` |
| 08  | [08-server-actions-runtime-flow.md](./08-server-actions-runtime-flow.md)             | `actions/` — the runtime flows (how it all runs)                                             |
| 09  | [09-schema.md](./09-schema.md)                                                       | `prisma/schema.prisma` — every table                                                         |
| 10  | [10-frontend.md](./10-frontend.md)                                                   | `app/` pages + `components/`                                                                 |

### An honest note on depth

Each doc pastes the **most important functions verbatim + explanation** — the
decision-making logic an interviewer probes. It does _not_ paste every helper, label/
string map, or `.test.ts` file. It's "the code that matters, real source" — not a full
line-by-line listing of every file.

## How to use it with the other sets

- `docs/handbook/` → concepts + interview answers.
- `docs/code-guide/` → the mental model + how to trace/extend.
- `docs/code-deep-dive/` (this set) → the exhaustive implementation.

A good study loop: read the code-guide for a domain, then this deep-dive for the
same domain with the real files open beside you.
