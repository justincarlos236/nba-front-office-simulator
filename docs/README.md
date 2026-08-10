# Documentation

**Start with [ARCHITECTURE.md](./ARCHITECTURE.md)** — how the codebase is put
together and why, in about ten minutes.

## Reference

| Doc                                  | What it is                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The layering, the data model, the cap engine, the simulation model, and the deliberate simplifications        |
| [SYSTEMS.md](./SYSTEMS.md)           | System-by-system reference — every feature, its schema and its formulas. Long; meant to be searched, not read |
| [ROADMAP.md](./ROADMAP.md)           | What is built, and an explicit list of what is not                                                            |
| [../DESIGN.md](../DESIGN.md)         | The design system — "The Wire" — and its binding rules                                                        |
| [../PRODUCT.md](../PRODUCT.md)       | Who this is for and what it refuses to do                                                                     |

## Audits

Empirical reviews of the running system, measured against live saves and
large simulated samples rather than against the code's own comments. They
score the system harshly and in places correct earlier claims made elsewhere
in this repository — including their own.

| Audit                                                        | Scope                           | Headline finding                                                                            |
| ------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------- |
| [SIMULATION_AUDIT.md](./SIMULATION_AUDIT.md)                 | Game engine, season results     | The league had no competitive range — the best team won ~45 games                           |
| [ROSTER_PROGRESSION_AUDIT.md](./ROSTER_PROGRESSION_AUDIT.md) | Ageing, development, retirement | Every real player was permanently 27, so nobody ever retired                                |
| [SECOND_PASS_AUDIT.md](./SECOND_PASS_AUDIT.md)               | Whole simulator, re-verified    | Re-checked every prior finding against the code; corrected one that had been measured wrong |
| [FINANCE_AUDIT.md](./FINANCE_AUDIT.md)                       | Franchise finances, all systems | The money model was right; a rating formula upstream was paying backup centres like MVPs    |

All P0 and P1 findings from the first three are fixed. The finance audit's
headline finding is fixed too — and the audit corrects its own attribution,
having first blamed the wrong module. Two P0s remain open there. Each audit
records its own scores before and after.

## Design records

Written before the systems they describe were built, kept for the reasoning
rather than as live plans. Source files cross-reference them by section.

- [SCOUTING_PILLAR_DESIGN.md](./SCOUTING_PILLAR_DESIGN.md)
- [FINANCES_PILLAR_DESIGN.md](./FINANCES_PILLAR_DESIGN.md)
- [FANS_PAGE_REDESIGN.md](./FANS_PAGE_REDESIGN.md)
- [ONBOARDING_DESIGN.md](./ONBOARDING_DESIGN.md)
- [REDESIGN_PLAN.md](./REDESIGN_PLAN.md) · [PHOTO_SOURCING_BRIEF.md](./PHOTO_SOURCING_BRIEF.md)
