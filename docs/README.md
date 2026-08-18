# Documentation

**Start with [ARCHITECTURE.md](./ARCHITECTURE.md)** — how the codebase is put
together and why, in about ten minutes.

| Doc                                  | What it is                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The layering, the data model, the cap engine, the simulation model, and the deliberate simplifications        |
| [SYSTEMS.md](./SYSTEMS.md)           | System-by-system reference — every feature, its schema and its formulas. Long; meant to be searched, not read |
| [CALENDAR.md](./CALENDAR.md)         | The league phases a save moves through, and what each one gates                                               |
| [ROADMAP.md](./ROADMAP.md)           | What is built, and an explicit list of what is not                                                            |
| [../DESIGN.md](../DESIGN.md)         | The design system — "The Wire" — and its binding rules                                                        |

## [audits/](./audits)

Empirical reviews of the running system, measured against live saves and large
simulated samples rather than against the code's own comments. Each states its
method, names the script that reproduces its numbers, and scores the system
before and after. They correct earlier claims made elsewhere in this
repository, including their own.

The four worth reading first:

| Audit                                                            | Headline finding                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [SIMULATION_AUDIT](./audits/SIMULATION_AUDIT.md)                 | The league had no competitive range — the best team won ~45 games                           |
| [ROSTER_PROGRESSION_AUDIT](./audits/ROSTER_PROGRESSION_AUDIT.md) | Every real player was permanently 27, so nobody ever aged or retired                        |
| [TRADE_EXPLOIT_AUDIT](./audits/TRADE_EXPLOIT_AUDIT.md)           | Every individual defence held; value compounded across a chain of legal trades              |
| [SECOND_PASS_AUDIT](./audits/SECOND_PASS_AUDIT.md)               | Re-checked every prior finding against the code; corrected one that had been measured wrong |

The remaining twelve cover contracts, salary, finance, ratings, the draft,
free agency, team strength, the playoffs, offseason integrity and server-action
authorisation.

## [design/](./design)

Written before the systems they describe were built, kept for the reasoning
rather than as live plans. Source files cross-reference them by section.
