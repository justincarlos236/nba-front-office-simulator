# Feature requests

Verbatim (or near-verbatim) records of extensive, detailed feature-request
prompts the user has given, preserved so they survive conversation
compaction, session boundaries, or a fresh machine/clone - unlike chat
history, this file is part of the repo. Each entry keeps the original ask
intact and tracks what was actually built against it, so a later session
can tell "did the user ask for X, or did Claude infer that?" without
re-deriving it from code or memory.

This is different from `docs/FEATURE_ROADMAP.md` (a long-standing list of
~100 possible features drafted early in the project) - entries here are
requests made _after_ that list existed, in the user's own words, each
tied to the actual phase(s) it produced.

**When to add an entry**: whenever the user gives a long, detailed prompt
describing a feature/system they want (not a quick one-liner) - add it
here before or alongside planning the implementation.

**How to keep an entry current**: update its "Status" section as phases
ship or scope changes; don't edit the original "Request" text itself, even
if the built feature ends up different - the point is preserving what was
actually asked for.

---

## Team-Centric Simulation Flow & Season Calendar (requested 2026-07-22)

### Request (verbatim)

> I want to redesign the simulation flow so that it is centered around
> the user's own franchise rather than arbitrary league-wide game
> batches. The simulator should feel like I am managing a single NBA team
> throughout an entire season, while the rest of the league continues
> progressing naturally in the background.
>
> Remove the current simulation options that advance a fixed number of
> league-wide games. Replace them with only two simulation actions: Sim
> Next Game and Sim Next 10 Games.
>
> Sim Next Game should advance the calendar until my team's next
> scheduled game has been completed. Any NBA games involving other teams
> that occur before or during that period should still be simulated
> automatically behind the scenes so that the entire league schedule
> remains synchronized. When the simulation finishes, my team should have
> completed exactly one additional game.
>
> Sim Next 10 Games should work in the same way, except it should
> continue advancing until my team has completed its next ten scheduled
> games. All other NBA games should continue to be simulated
> automatically in the background so that league standings, statistics,
> injuries, awards, and every other system continue progressing normally.
> Also, increase the games played for each team to 82 (like real life
> NBA) from the current 58.
>
> I also want to introduce a dedicated season calendar that becomes the
> primary visualization while simulation is occurring. Instead of
> instantly jumping to the end of the simulation, the calendar should
> visibly progress day by day as time advances, giving users the feeling
> that an NBA season is unfolding rather than simply skipping ahead. For
> this first version, keep the calendar simple and focused only on games.
> Days without a game can remain empty, while every game day should be
> clearly marked with the opponent and the result once the game has been
> simulated. Display a clear visual indicator such as W or L, using an
> intuitive design that matches the rest of the application's UI. The
> progression through the calendar should feel smooth and polished so
> users can visually follow their season as each game is completed.
>
> The overall goal is to make advancing through the season feel much more
> immersive and intuitive. Users should feel like they are progressing
> through their own team's schedule while the rest of the NBA evolves
> naturally in the background, with the calendar serving as a visual
> timeline of the season rather than simply pressing a fast-forward
> button.

### Scoping decision

Per an architecture-overlap review: reused the existing per-chunk
simulate/persist/injury-event pipeline entirely (only its stopping
condition changed); the schedule algorithm needed a real rewrite (58
games/team was structural, not a constant) - the user chose real NBA
schedule weighting over a simplified version. The day-assignment
algorithm went through a second pass after the user pushed back on an
initial "shuffle + jitter" design that had no season-length target or
back-to-back control - replaced with a capacity-and-eligibility-
constrained day-by-day loop so the calendar has real temporal structure
to support future date-sensitive systems. See `docs/ARCHITECTURE.md`'s
Season simulation section for the full design.

### Status

**Built:**

- Real-NBA-weighted 82-game schedule (1,230 games league-wide): 4
  division rivals x4, 10 conference non-division opponents split 6x4/4x3,
  15 other-conference opponents x2.
- `Game.dayIndex` - a day-by-day season calendar with realistic pacing
  (season lands ~150-160 days, all 30 teams finish within a few days of
  each other, back-to-backs capped at one in a row).
- Team-centric `simulateGamesAction`: "Sim Next Game" / "Sim Next 10
  Games" advance until the user's own team has played that many more
  games, resolving every other team's games automatically.
- `SeasonCalendar` on the Standings page showing the user's own team's
  full schedule with W/L results and rest-day gaps.

**Not built / outstanding:**

- Real calendar dates (actual `DateTime`s, month/week grouping) - just a
  sequential day index, per the "keep it simple" request.
- Animated/incremental reveal of games as they resolve - busy-state +
  refresh, same as the existing draft page pattern.
- Regenerating the schedule for leagues already mid-season - only new
  leagues/seasons get the 82-game/day-indexed schedule.

---

## Fan Engagement (requested 2026-07-22)

### Request (verbatim)

> I want to implement a comprehensive Fan Engagement system that makes
> fans feel like an active part of the franchise rather than just a
> background statistic. The goal is for users to constantly consider how
> their decisions affect public opinion, attendance, revenue, and the
> overall relationship between the team and its fanbase. Every major
> decision should have the potential to generate positive or negative fan
> reactions, making fans another important stakeholder alongside the
> owner, players, and coaching staff.
>
> The simulator should track an overall Fan Happiness score while also
> breaking it down into multiple factors such as team performance, roster
> quality, star power, player loyalty, championship expectations,
> exciting style of play, financial decisions, long-term direction, and
> recent transactions. Fans should react differently depending on the
> context of the team. A rebuilding fanbase may be more patient with
> developing young talent, while fans of a championship contender may
> become frustrated after early playoff exits or unpopular roster moves.
>
> Fan reactions should be dynamic and believable. Trading away a
> franchise icon, signing a superstar, drafting a highly anticipated
> rookie, beginning a successful rebuild, making a blockbuster trade,
> missing the playoffs, winning a championship, firing a popular coach,
> or making controversial financial decisions should all influence fan
> sentiment. Fans should also react to winning streaks, losing streaks,
> player performances, award winners, playoff runs, rivalries, and other
> major events occurring throughout the simulation.
>
> Create a dedicated Fan Hub where users can monitor fan sentiment over
> time. This section should include overall approval, attendance trends,
> merchandise popularity, season ticket demand, social media buzz,
> franchise popularity, and visual graphs showing how fan opinion changes
> throughout multiple seasons. Users should be able to understand why fan
> happiness has increased or decreased through detailed explanations and
> historical events rather than only seeing a numerical score.
>
> Implement a realistic social media and fan reaction system that
> generates believable comments, discussions, and media narratives
> following important events. Fans should praise excellent decisions,
> criticize poor trades, debate draft selections, celebrate victories,
> question rebuilding strategies, speculate about future moves, and
> develop long-term narratives around the franchise. Different
> personalities should exist within the fanbase so that reactions feel
> varied instead of everyone sharing the same opinion.
>
> Fan engagement should also have meaningful gameplay consequences.
> Higher fan support should increase attendance, merchandise sales,
> sponsorship opportunities, franchise reputation, and overall revenue.
> Poor fan engagement should reduce attendance, lower merchandise sales,
> increase pressure from ownership, and create additional challenges for
> the user. Large-market teams, small-market teams, rebuilding
> franchises, and championship contenders should all have different fan
> expectations and react differently to similar situations.
>
> The interface should be modern, visually engaging, and feel comparable
> to a professional sports application. Include visual indicators, trend
> graphs, reaction feeds, attendance statistics, popularity rankings,
> merchandise performance, and other polished UI elements that make
> monitoring fan engagement enjoyable. The overall goal is to make fans
> feel like a living part of the NBA ecosystem whose opinions evolve
> naturally over time and whose support must be earned through smart
> long-term franchise management rather than simply winning games.

### Scoping decision

After an architecture-overlap review the user explicitly agreed with:
built as a consumer of existing simulation events, not a second event-
generation system. Fan Happiness reuses `evaluateSeason`'s verdict/GM
accountability's evaluators as inputs (own model, not a clone); fan
reactions render from the existing `LeagueTransaction` log rather than a
second event pipeline; market size uses real data; presentational metrics
(merchandise/tickets/buzz) are UI-side labels derived from two real
stored numbers, not independently simulated; no revenue-buys-cap-space
mechanic, since real NBA cap rules don't work that way; fan "personas"
start as conservative tone-based templates, not persistent characters.
See `docs/ARCHITECTURE.md`'s Fan engagement section for the full design.

### Status

**Built:**

- `LeagueTeam.fanHappiness`, computed every season for all 30 teams from
  season outcome (verdict-based for the user's team, win%-based for CPU
  teams), transaction sentiment, star power, and coaching style.
- Real `Team.marketSize` data for all 30 teams.
- `FanHappinessSnapshot` history + a multi-season trend graph.
- A tone-based fan reaction feed rendered from existing news transactions.
- Derived `franchisePopularity`/`attendancePct`, with Merchandise
  Popularity/Season Ticket Demand/Social Media Buzz as UI tier labels off
  those two numbers.
- A small fan-happiness nudge to the owner-confidence formula.
- A dedicated `/leagues/[id]/fans` Fan Hub page.

**Not built / outstanding:**

- Independently-simulated attendance/merchandise/ticket-demand/buzz
  numbers (deliberately out of scope - see the scoping decision above).
- Persistent individual fan personas with distinct ongoing identities.
- Sponsorship opportunities as a distinct tracked mechanic.
- Rivalry-specific reactions (rivalries aren't modeled as their own
  concept yet).

---

## Staff Management (requested 2026-07-22)

### Request (verbatim)

> I want to implement a comprehensive Staff Management system that makes
> users feel like they are running an entire NBA organization rather than
> simply managing players. Staff should become a core gameplay system
> with meaningful long-term decisions that impact player development,
> injuries, scouting, finances, team performance, and the overall success
> of the franchise. Users should be responsible for hiring, firing,
> promoting, extending contracts, and managing staff throughout every
> season. The simulation should begin with real-life NBA staff wherever
> possible, including current head coaches, assistant coaches, front
> office executives, and other publicly available personnel. This
> provides an authentic starting point that immediately immerses users in
> the NBA. However, the league should not remain static. As seasons
> progress, staff members should naturally retire, resign, accept offers
> from other teams, get fired, or move into different roles. The
> simulation should gradually generate new fictional staff members to
> replace them so that every save develops its own unique coaching and
> front office landscape. Former assistant coaches should be promoted
> into head coaching roles, successful executives should receive offers
> from rival teams, and entirely new coaching talents should emerge over
> time. By the later years of a save, the league should have evolved into
> its own unique universe while still feeling realistic.
>
> The organization should include multiple staff positions wherever
> appropriate, such as Head Coach, Assistant Coaches, Offensive Coach,
> Defensive Coach, Player Development Coach, Strength & Conditioning
> Coach, Medical Staff, Scouts, Analytics Staff, Salary Cap Specialist,
> and any other realistic basketball operations roles that would make the
> simulation deeper and more immersive. Every staff member should have a
> detailed profile containing their photo where available, name, age,
> experience, reputation, contract, salary, career history, coaching
> philosophy, strengths, weaknesses, and individual attributes. Staff
> should not simply be cosmetic hires. Different coaches should specialize
> in different playstyles, player development coaches should influence
> how quickly young players improve, medical staff should affect injury
> prevention and recovery speed, scouts should influence scouting accuracy
> and uncover hidden talent, analytics staff should improve reports and
> front office decision-making, and salary cap specialists should assist
> with contract negotiations and financial planning. The hiring process
> should feel realistic and competitive. Users should browse available
> candidates, compare them, evaluate their strengths and weaknesses,
> negotiate contracts, and compete against other NBA teams for elite staff
> members. Top coaches and executives should receive multiple offers,
> making them difficult to hire without offering competitive contracts or
> joining an attractive organization.
>
> Staff members should have meaningful careers that evolve throughout the
> simulation. They should improve with experience, gain or lose reputation
> based on performance, receive awards, retire, change organizations, earn
> promotions, or be dismissed following poor results. Assistant coaches
> should eventually become head coaching candidates, elite scouts should
> become respected executives, and successful staff should attract
> interest from rival teams.
>
> Every staff decision should have visible gameplay consequences. Hiring
> an elite player development coach should noticeably improve young
> player growth. Investing in top medical staff should reduce injury
> frequency and recovery time. Better scouts should produce more accurate
> draft reports and discover hidden gems. Strong coaches should maximize
> roster strengths, improve team chemistry, and positively impact team
> performance. Every hire should feel like a meaningful long-term
> investment rather than a cosmetic change.
>
> Create a dedicated Staff Management section with a polished, modern
> interface that allows users to browse their organization, inspect
> detailed staff profiles, compare candidates, negotiate contracts,
> monitor staff performance, and receive notifications for contract
> expirations, promotions, retirements, resignations, firings, and job
> offers. The interface should feel comparable to a premium sports
> management game rather than a simple management screen.
>
> The overall goal is for Staff Management to become one of the
> simulator's major gameplay systems. Users should feel like they are
> building an entire basketball organization, not just assembling a
> roster of players. The system should encourage meaningful long-term
> planning, create difficult strategic decisions, and make every
> franchise feel unique as its coaching staff and front office evolve
> naturally over many years.

### Scoping decision

Per an architecture-overlap review (see `docs/ARCHITECTURE.md`'s Staff
management section), scoped down deliberately for v1 rather than built in
full: no hireable GM role (the user already fills that seat), algorithmic
generation instead of real-world data (no clean/ToS-safe source), and
three roles to start.

### Status

**Built (Phase 15a - Head Coach, Player Development Coach, Medical
Staff):**

- Real mechanical effects: coach win-probability/shot-selection/bench
  trust, dev-coach growth speed, medical-staff injury frequency/recovery.
- Algorithmic generation, seeded per league/team/role.
- Aging, retirement, reputation drift, contract expiry, CPU auto-backfill
  each season.
- Hire/fire actions with a minimum-acceptable-offer floor.
- A dedicated `/leagues/[id]/staff` page.

**Built (Phase 15b):**

- Coach of the Year award.

**Not built / outstanding against the original request:**

- Remaining roles: Assistant Coaches, Offensive/Defensive Coach, Strength
  & Conditioning, Scouts, Analytics Staff, Salary Cap Specialist.
- Real-world starting rosters (current real coaches/executives) -
  deliberately skipped, same reasoning as real contract data.
- A competitive hiring market (rival teams actively bidding against the
  user for the same candidate) - CPU teams currently only auto-fill their
  own vacancies from the pool.
- Career evolution beyond retirement/reputation drift: promotions
  (assistant → head coach), staff attracting rival interest, awards
  beyond Coach of the Year.
- Detailed profiles: career history, coaching-philosophy text,
  strengths/weaknesses - currently just name/age/quality/reputation/style.
- Notifications for contract expirations/promotions/offers.
- A more premium/polished UI beyond the current three-section page.
