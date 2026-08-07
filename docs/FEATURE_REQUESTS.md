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

## Rotation Management (requested 2026-07-23)

### Request (verbatim)

> I want to implement a comprehensive Rotation Management system that gives
> users meaningful control over how their team actually plays and makes
> roster management extend beyond simply trading and signing players.
> Before implementing anything, analyze the existing architecture and
> determine how this should integrate with the current game simulation
> engine, player box-score generation, coaching/staff systems, injuries,
> fatigue, player development, morale if applicable, player roles, news,
> and any other relevant systems. Reuse existing functionality wherever
> appropriate rather than creating duplicate systems. If you identify
> significant overlap, conflicts, architectural concerns, or a better
> implementation approach, explain them to me before implementation
> according to our existing architecture-overlap review protocol.
>
> I want users to be able to manage their team's rotation in an intuitive
> and realistic way. At minimum, users should have control over their
> starting lineup, bench rotation, rotation order or depth chart, and
> expected minutes distribution. The system should make it easy to
> understand who starts, who receives significant bench minutes, who has a
> limited role, and who is currently outside the regular rotation.
> Determine the best UI and underlying data model for this based on the
> existing architecture rather than assuming a particular implementation.
>
> Rotation decisions must have real consequences in simulated games. The
> game simulation engine should use the user's rotation when determining
> which players appear, how many minutes they approximately play, and how
> opportunities are distributed. If I assign a player 34 minutes per game,
> I expect them to generally receive around that amount rather than
> exactly 34 every night. Actual minutes should still vary naturally
> because of game context, foul trouble if modeled, injuries, fatigue,
> blowouts, overtime, coaching effects, and other relevant factors. The
> rotation should guide the simulation rather than rigidly predetermine
> every box score.
>
> Make the system realistic enough that users cannot create impossible
> rotations. Expected regulation minutes should be internally consistent
> with basketball's available playing time, while the UI should make
> resolving invalid minute allocations simple and understandable. Use your
> judgment about how much realism is appropriate without making rotation
> management tedious for casual NBA fans.
>
> The user should be able to easily make common basketball decisions such
> as promoting a bench player into the starting lineup, benching a
> struggling starter, increasing a young player's minutes, reducing an
> aging veteran's workload, removing someone from the rotation, giving a
> newly acquired player a major role, or temporarily adjusting the lineup
> because of an injury. These changes should actually be reflected in
> subsequent simulated games.
>
> Injuries should integrate naturally with rotations. If a rotation player
> becomes unavailable, determine the best way for their minutes and lineup
> position to be redistributed based on the existing simulation
> architecture. The user should not be forced to manually repair the
> entire rotation every time a minor roster change occurs, but they should
> retain the ability to override automatic adjustments. Likewise, when an
> injured player returns, avoid unexpectedly destroying intentional
> rotation changes the user made while that player was unavailable.
>
> The system should also integrate meaningfully with Staff Management.
> Coaching quality, philosophy, rotation tendencies, bench trust, player
> development, or any relevant coaching mechanics that already exist
> should influence how rotations function where appropriate. However,
> because the user is acting as the franchise decision-maker, I still want
> them to have meaningful control over their team's rotation. Determine
> the appropriate balance between user control and coaching influence
> based on the systems already implemented.
>
> Rotation decisions should eventually be capable of interacting with
> player satisfaction and development where the architecture supports it.
> Young players receiving meaningful opportunities may develop differently
> from players who never play, veterans may have expectations about their
> roles, starters may react to being benched, and players expecting
> significant minutes may become dissatisfied if consistently left outside
> the rotation. Do not invent parallel morale or development systems if
> these concepts already exist or are planned; instead, integrate rotation
> information into the appropriate existing systems.
>
> I also want the UI to make rotation management enjoyable rather than
> feeling like editing a spreadsheet. Clearly communicate starters, bench
> players, expected minutes, positions, injuries, and relevant player
> information while keeping the interface clean. Consider interactions
> such as drag-and-drop ordering, intuitive minute controls, automatic
> balancing, recommended rotations, or other UX approaches if they fit the
> existing application. You have access to the actual codebase, so
> determine which interaction model would work best with the current UI.
>
> Provide sensible automation for users who do not want to micromanage.
> There should be an easy way to allow the simulator or coaching staff to
> generate or recommend a reasonable rotation based on roster quality,
> positions, health, coaching preferences, and other relevant factors.
> However, users who want deeper control should be able to customize the
> rotation themselves. The goal is to support both casual users and users
> who enjoy detailed franchise management.
>
> Consider how rotation management should behave after trades, signings,
> waivers, injuries, player returns, draft additions, and other roster
> changes. The system should remain robust as the roster evolves over many
> simulated seasons and should not require users to constantly fix broken
> rotations because another system changed the roster.
>
> Most importantly, rotation management must be connected to the actual
> simulation rather than existing as a cosmetic UI feature. If I
> dramatically change my rotation, I should be able to see the
> consequences in subsequent player minutes, box scores, performance,
> development, fatigue, and any other systems that logically depend on
> playing time.
>
> The overall goal is to give users another meaningful layer of control
> over their franchise. Building the roster should only be part of the
> job; users should also have meaningful decisions about how that roster
> is actually used. I want rotation management to be accessible enough for
> casual NBA fans to understand immediately while providing enough depth
> that changing starters, bench roles, and minutes becomes a legitimate
> strategic decision throughout the season. Analyze the existing
> architecture first and determine the cleanest, most maintainable way to
> achieve this before implementing it.

### Status

Implemented. Users set their starting five, bench order, and expected
minutes via drag-and-drop at `/leagues/[id]/rotation`
(`src/components/rotation/RotationBoard.tsx`), backed by two nullable
fields on `LeaguePlayer` (`rotationSlot`, `targetMinutesPerGame`) rather
than a new model - `null` on both is exactly the prior fully-automatic
behavior, so every existing save and every CPU team is unaffected unless
the user opts in. The existing `buildRotation`/`allocateMinutes` engine in
`boxScore.ts` was extended (not duplicated) via `src/lib/rotation/
resolveRotation.ts` to let a custom depth chart override its own
ranking/weights while keeping all natural variance, garbage-time, and
coaching-modifier behavior intact - a custom target minutes value guides
actual simulated minutes rather than pinning them exactly, confirmed via
hands-on testing (a promoted bench player's simulated production shifted
dramatically and varied naturally game to game). Per the user's explicit
follow-up decision, win probability also reflects the rotation: a new
`computeRotationAdjustedStrength` (`src/lib/rotation/rotationStrength.ts`)
is used only where actual game outcomes depend on who's playing, while
`computeTeamStrength` stays untouched everywhere it evaluates roster
talent instead (GM-accountability `SeasonExpectation`, All-Star Weekend
exhibition squads). Player development takes real per-season minutes as a
modest nudge; starter/bench boundary crossings generate real News stories
wired into fan engagement. See `docs/ARCHITECTURE.md`'s Rotation
Management section for the full design, including a real weight-scale bug
caught and fixed during implementation. Also satisfies Roadmap items #28
(Depth Chart Management), #29 (Rotation Management), and #33 (Player
Roles, as a derived byproduct rather than a separate system).

---

## All-Star Weekend (requested 2026-07-22)

### Request (verbatim)

> I want to implement a comprehensive NBA All-Star Weekend system that
> makes the All-Star break feel like one of the major events of every
> season rather than simply generating a list of All-Stars. Before
> implementing anything, analyze the existing architecture and determine
> how this should integrate with the current simulation engine, player
> statistics, awards systems, league news, fan engagement, player
> profiles, historical records, calendar/season progression, and any
> other relevant systems. Reuse existing data and logic wherever
> appropriate rather than creating duplicate systems. If you identify
> significant overlap, conflicts, or a better architectural approach,
> explain it to me before implementation as per our existing
> overlap-review protocol.
>
> The All-Star Weekend should occur naturally at the appropriate point of
> every NBA season and should feel like a genuine midseason event that
> temporarily interrupts normal regular-season progression. The user
> should be able to clearly see that All-Star Weekend is approaching
> through the existing calendar, dashboard, news, or whatever mechanisms
> best fit the current application architecture.
>
> I want All-Star selections to be determined intelligently from what has
> actually happened within the simulation. Do not simply select players
> based on overall rating. Selection logic should primarily consider
> actual season performance, games played, minutes, team success where
> appropriate, position/frontcourt-backcourt requirements if applicable to
> the rules being modeled, and other relevant factors. Elite players
> having poor seasons should not automatically be selected because of
> reputation, while breakout players having exceptional simulated seasons
> should have legitimate opportunities to become first-time All-Stars.
>
> Where appropriate, model fan voting, player voting, media voting,
> starter selection, reserve selection, injury replacements, and All-Star
> snubs in a way that is believable while remaining manageable for the
> simulator. Reputation and star popularity can influence fan voting, but
> actual simulated performance should remain extremely important. Use the
> NBA All-Star format and rules appropriate to the season being simulated
> where practical, but prioritize a maintainable system that can evolve if
> league formats change.
>
> Build anticipation before selections are announced. During the weeks
> leading up to All-Star Weekend, the existing News system should be
> capable of producing stories about voting leaders, players making
> strong cases, potential first-time selections, surprising candidates,
> declining stars potentially missing the event, close races, and other
> narratives that naturally emerge from real simulation data. These
> should not be invented independently of the underlying league state.
>
> When the All-Star rosters are announced, make the reveal feel
> significant. Clearly present starters, reserves, first-time All-Stars,
> returning selections, injury replacements, notable omissions, team
> representation, and other interesting information. Player profiles
> should permanently record All-Star selections as career achievements,
> and historical systems should preserve each season's All-Star rosters
> so users can look back at them many seasons later.
>
> I also want the simulator to recognize All-Star snubs. If a player is
> having an exceptional statistical season but narrowly misses selection,
> this can become a legitimate storyline. However, do not manufacture
> snubs randomly. They should emerge from actual selection results and
> player performance.
>
> Create a dedicated and visually impressive All-Star Weekend experience.
> Determine the best UI structure based on the existing application, but
> it should allow users to easily explore the participants, events,
> results, performances, and major storylines surrounding the weekend.
> The presentation should feel celebratory and distinct from an ordinary
> regular-season screen while remaining consistent with the application's
> overall design language.
>
> All-Star Weekend should include the major events that make sense for
> the simulator, including the Rising Stars event, Three-Point Contest,
> Slam Dunk Contest, and NBA All-Star Game. If additional events fit the
> NBA season/format being modeled and can be implemented realistically
> without unnecessary complexity, use your judgment about including them.
>
> For the Rising Stars event, participants should be selected from
> eligible young players based primarily on their actual simulated
> performances. This should provide another opportunity for rookies and
> young players to gain recognition. The system should recognize notable
> Rising Stars performances and preserve participation/results in league
> history where appropriate.
>
> For the Three-Point Contest, participants should be selected
> intelligently based on actual three-point shooting performance, volume,
> efficiency, reputation, and other appropriate criteria. Do not simply
> choose the highest-overall players. Implement a lightweight contest
> simulation that produces believable round-by-round results without
> requiring an unnecessarily complex possession-level system. The user
> should be able to follow who advances and ultimately wins.
>
> For the Slam Dunk Contest, determine participants using appropriate
> factors available within the existing player model, such as
> athleticism, dunking ability, age, reputation, star power, or other
> suitable attributes. If the simulator does not currently contain enough
> information to evaluate dunking ability properly, identify this rather
> than inventing an unreliable system and recommend the cleanest approach.
> Generate a simple but entertaining competition with scores, rounds,
> eliminations, and a champion.
>
> The NBA All-Star Game should use the existing game simulation
> architecture wherever possible rather than creating an entirely
> separate basketball simulation. However, account for the unique nature
> of an All-Star Game where appropriate, such as different rotations, more
> balanced playing time, star-heavy lineups, higher offensive output, and
> less emphasis on normal team systems. Generate complete player
> statistics so the game can produce meaningful performances and an
> All-Star Game MVP.
>
> Present the All-Star Game results in a polished way, including the
> final score, player statistics, leading performers, notable moments
> derived from the generated game data, and the All-Star Game MVP. These
> results should feed naturally into the existing News system, player
> profiles, career achievements, league history, and any other
> appropriate systems.
>
> All-Star Weekend should also interact with the Fan Engagement system
> where appropriate. Fans should react to their team's players being
> selected, first-time All-Stars, controversial snubs, contest winners,
> memorable performances, and All-Star MVPs. These reactions should
> consume the same underlying events rather than creating an independent
> event-detection pipeline.
>
> The News system should provide coverage throughout the entire weekend
> rather than producing only one article. Appropriate stories might
> include roster announcements, first-time selections, snubs, contest
> participants, contest winners, Rising Stars performances, All-Star Game
> results, MVP performances, records, and other notable developments.
> Again, these stories must be grounded in events that actually occurred
> within the simulation.
>
> All-Star achievements should have long-term historical significance.
> Player career profiles should record All-Star selections, starts where
> relevant, contest championships, All-Star Game MVP awards, and other
> meaningful achievements. League history should allow users to look back
> at previous All-Star Weekends, participants, winners, rosters, and
> results many seasons later.
>
> The system should also work naturally as the league evolves. Generated
> players entering the league in future seasons should be fully eligible
> for All-Star selections and events using exactly the same underlying
> logic as real players. Nothing about the system should depend on
> hardcoded names or current NBA stars.
>
> Do not make All-Star Weekend unnecessarily tedious for users who
> primarily want to manage their franchise. Users should be able to enjoy
> and explore the event, but they should also have appropriate options to
> progress through it efficiently if they are not interested in watching
> every stage. Determine the best balance between presentation,
> interaction, and simulation speed based on the existing UX.
>
> Most importantly, All-Star Weekend should not feel like an isolated
> minigame. It should emerge naturally from everything that has happened
> during the first half of the season and then create consequences,
> achievements, narratives, historical records, news coverage, and fan
> reactions that persist afterward.
>
> The overall goal is for users to reach the middle of every season and
> genuinely look forward to All-Star Weekend. It should provide a
> temporary celebration of the league's best players, recognize breakout
> stars and young talent, create memorable moments, contribute to player
> legacies, and make the wider NBA universe feel significantly more
> alive. Build it as an integrated part of the existing simulation
> ecosystem rather than a standalone feature, while making whatever
> architectural and UX decisions you believe best fit the current
> codebase. Also you may add whatever improvements you wish.

### Status

Implemented. Selections are driven by real simulated season performance
(`src/lib/allstar/selection.ts`), blended with a small reputation/team-
success nudge, using a new `AllStarSelection` model rather than retrofitting
`SeasonAward`. Rising Stars, the Three-Point Contest, and the Slam Dunk
Contest each have their own pure selection/simulation modules under
`src/lib/allstar/`; the Slam Dunk Contest explicitly uses a synthetic,
non-persisted "dunk appeal" composite since no real dunking-ability
attribute exists anywhere in the schema. The All-Star Game and Rising Stars
game both reuse the existing simulation engine (`simulateGame`/
`generateBoxScore`) via a synthetic "exhibition" `CoachModifier`, not a
separate basketball simulation. `simulateGamesAction` now has a genuine
mid-season checkpoint: regular-season simulation stops (even mid-batch)
once the user's team reaches 41 games played, generates the whole weekend
synchronously via `generateAllStarWeekend`, and stays blocked until
`resolveAllStarWeekendAction` is called from the new `/leagues/[id]/all-star`
page. News (roster reveals, first-timers, snubs, contest results, the ASG
result/MVP), fan engagement sentiment/reactions, player profile career
honors, and League History all consume the same real generated data - no
separate invented signal. See `docs/ARCHITECTURE.md`'s All-Star Weekend
section for the full design.

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

---

## CPU Autonomous GM Intelligence (requested 2026-07-23)

### Request (verbatim)

> I want to work on what your simulator review identified as the
> highest-priority improvement: CPU Autonomous GM Intelligence, including
> the closely related CPU re-signing problem. The goal is for the other 29
> teams to behave like believable autonomous NBA front offices rather than
> making random or simplistic decisions. Before implementing anything,
> thoroughly analyze the current architecture and determine how the
> existing trade evaluation, player valuation, GM personality, team
> identity, team needs, roster construction, salary cap, contracts, free
> agency, draft, re-signing rights, team performance, future draft assets,
> and any other relevant systems can be reused. I specifically do not want
> a second parallel AI/valuation system if the necessary intelligence
> already exists elsewhere in the application. Your previous review found
> that much of the sophisticated logic already exists but is primarily
> used when CPU teams evaluate actions initiated by the user. The priority
> should therefore be extending and integrating those existing systems so
> CPU teams can intelligently initiate and make their own decisions. CPU
> teams should gradually develop believable strategic behavior. Contenders,
> rebuilding teams, mediocre teams, young ascending teams, expensive
> veteran teams, and other situations should result in meaningfully
> different decision-making where supported by the existing architecture.
> CPU decisions should consider roster needs, player value, age, potential,
> contracts, cap situation, draft capital, competitive timeline, team
> identity, GM personality and other relevant information rather than
> simply optimizing overall rating. This should eventually affect
> CPU-initiated trades, free-agent targeting, re-signing decisions and
> draft decisions, but determine the cleanest scope and implementation
> order after inspecting the architecture. CPU teams should also maintain
> healthy, realistic rosters across many simulated seasons rather than
> gradually losing players because they fail to manage expiring contracts.
> Avoid making CPU teams unrealistically perfect. Different GM
> personalities, uncertainty, competing priorities and contextual
> decision-making should allow reasonable mistakes and disagreements while
> preventing obviously nonsensical behavior. This system must remain
> performant enough to simulate seasons without requiring extremely
> expensive decision searches every time league games advance. Determine
> where CPU decision-making should occur and how frequently teams should
> evaluate potential moves. Before implementation, perform our normal
> architecture-overlap review. Identify what already exists, what can be
> directly reused, what genuinely needs to be added, any conflicts or risks,
> and any important design decisions you need from me. Do not implement
> anything until I respond to that review.

### Architecture-overlap review outcome

Reused as-is (no modifications): `evaluateTradeOffer`, `GmPersonality`
weights, `computeTeamIdentity`, `computeTeamNeeds`, `computePlayerTradeValue`,
`computeDraftPickTradeValue`, `suggestCounterOffer`'s search pattern,
`computeCompetitivenessPercentiles`, `validateSigning`,
`computeReSigningMaxOfferCents`, `computeCapSheet`, future-pick inventory.

Genuinely new (each a thin layer over the above, not a parallel system):
a CPU re-signing decision function; a CPU-CPU trade candidate-generation
step that requires mutual `evaluateTradeOffer` ACCEPT from both sides; a
needs-aware bias on CPU free-agent targeting/offers; a need-fit tiebreak
layered onto the draft's existing best-player-available sort.

### Design decisions (answered 2026-07-23)

- **Sequencing**: re-signing first, then CPU-initiated trades, then
  FA targeting/draft need-awareness.
- **CPU-CPU trades require mutual ACCEPT**: `evaluateTradeOffer` is run
  once per side on the same candidate package; both must independently
  accept before it executes.
- **Initiator bias**: a team's own `GmPersonality`/`TeamIdentity` biases
  _what it tries to acquire_ when initiating (not just whether it accepts
  an offer) - e.g. a Pick Hoarder seeks picks, a Win-Now team seeks vets.
- **Scope edges**: both included now - CPU teams can compete with the user
  for the user's own free-agent targets, and CPU re-signing/signing
  respects a soft roster-size ceiling so rosters don't bloat over many
  simulated seasons.

### Status

**Built (Phase 1 - CPU re-signing):**

- `evaluateReSigningDecision` (`src/lib/gm/reSigningDecision.ts`) - reuses
  `computePlayerTradeValue`, `GM_PERSONALITY_WEIGHTS` (including
  `badContractSensitivityMultiplier`, previously defined but unused
  anywhere), `computeTeamIdentity`, `computeTeamNeeds`, and the exact
  age/identity/need-fit bonus constants exported from `evaluateTradeOffer.ts`
  for this purpose - no parallel valuation system.
- `advanceSeasonAction` (`src/lib/actions/offseason.ts`) now gives each CPU
  team's own expiring player a real retention decision instead of
  unconditional release: identity/needs computed from that team's "sure"
  post-departure roster, best assets processed first, a soft ~15-man roster
  ceiling raises the bar once a team is already fully stocked. Retained
  players get a new 2-year Bird-Rights contract and keep their existing
  rotation slot (same team, no depth-chart disruption); released players
  behave exactly as before. The user's own expiring players are untouched -
  still re-signed manually via the free-agents page.
- Real `SIGNING` news for every CPU re-signing, reusing `describeSigning`.
- Verified via `reSigningDecision.test.ts` (personality/identity splits,
  roster-ceiling effect, need-fit bonus) and a 2-season hands-on e2e
  playthrough: real stars (Embiid, Haliburton, Brunson, Wembanyama, Trae
  Young) correctly retained by their own teams at realistic contract
  values; CPU rosters grew rather than shrank across seasons.

**Known rough edge:** one team dipped to 9 active players after a season in
the verification run (still fieldable, well above 8) - Phase 3 (FA
targeting) should smooth this out by making CPU signings actually seek
replacements instead of relying on the existing rare/random signing roll.

**Built (Phase 2 - CPU-initiated trades):**

- `rollForCpuTrade` (`src/lib/simulation/leagueEvents.ts`) no longer picks a
  uniform-random player from each side. A seeking team's own needs/identity/
  personality now bias who it targets (`pickTradeTarget` - prefers a
  need-filling player, biased toward veterans for a win-now-postured seeker
  or youth for a rebuilding-postured one, reusing the exact age thresholds
  and personality weights `evaluateTradeOffer` already applies) and what it
  offers in return (`pickTradeOffer` - a value-matched surplus player).
  Both teams must then independently `ACCEPT` the same candidate swap via
  `evaluateTradeOffer` (mutual acceptance) before the existing
  `validateTrade` cap-legality check even runs.
- No new valuation system - reuses `evaluateTradeOffer`,
  `computePlayerTradeValue`, `computeTeamIdentity`, `computeTeamNeeds`, and
  the Phase-1 exported constants (`YOUNG_AGE_THRESHOLD`,
  `VETERAN_AGE_THRESHOLD`, `playerFillsNeed`) end to end.
- Verified via a reworked `leagueEvents.test.ts` (need-filling target
  selection, WIN_NOW/CONTENDER vs. REBUILDING/PROSPECT_LOVER targeting the
  same candidate pool differently, an objectively lopsided trade blocked
  across many rng values) and a hands-on fast-forwarded season: 4 CPU-CPU
  trades executed, all reasonably value-matched (e.g. a 78-overall Zach
  LaVine moving for a 73-overall player, not an arbitrary bench swap).

**Not yet built:** needs-aware CPU free-agent targeting (Phase 3), draft
need-fit tiebreak (Phase 3/4).

- A more premium/polished UI beyond the current three-section page.

---

## Fan Engagement Deepening (requested 2026-07-23)

### Request (verbatim)

> I want to significantly deepen and improve the existing Fan Engagement
> system so that fans become a living, reactive stakeholder in franchise
> management rather than primarily a collection of derived statistics and
> flavor text. Before implementing anything, analyze the existing Fan
> Engagement architecture and all systems it interacts with, and follow our
> existing architecture-overlap review protocol. Reuse existing systems
> such as LeagueTransaction, News, player/trade valuation, team
> performance, ownership/GM accountability, player history, market size,
> roster data, awards, All-Star events, rotation changes, and any other
> relevant infrastructure rather than creating duplicate event-detection or
> evaluation systems. If any of the following ideas conflict with the
> existing architecture, would create unnecessary complexity, or can be
> accomplished more cleanly using something already implemented, explain
> that to me before implementation.
>
> The biggest change I want is for Fan Happiness to become dynamic
> throughout the season rather than only being recalculated at season
> turnover. Meaningful events should cause fan sentiment to change when
> they actually happen. Major trades, signings, winning and losing streaks,
> injuries and returns, breakout performances, draft selections, All-Star
> selections and snubs, awards, rotation decisions, staff changes, playoff
> qualification or elimination, playoff performances, championships, and
> other genuinely fan-relevant events should be capable of affecting
> sentiment. Do not simply make every LeagueTransaction move Fan Happiness;
> determine which events should matter, by how much, and how to prevent
> excessive volatility or easy exploitation. Season-end evaluation can
> still provide an important larger adjustment based on how the franchise
> performed relative to expectations.
>
> I also want fan reactions to understand the context and perceived
> quality of decisions rather than reacting only to transaction type. The
> existing system currently treats trades too generically. Where possible,
> reuse the simulator's existing player valuation, trade evaluation, team
> direction, roster needs, contract value, or other relevant systems so
> fans can form a reasonable immediate perception of a trade. However, fans
> should not simply duplicate the analytical trade engine and always
> arrive at the objectively correct answer. Public reaction can differ from
> long-term basketball value. Trading a beloved franchise player may cause
> significant backlash even if the trade is strategically sensible, while
> acquiring a famous star may create excitement even if the contract is
> risky.
>
> Introduce a stronger concept of fan expectations and franchise context.
> Fans should not evaluate every franchise using identical standards. A
> rebuilding team with promising young players may maintain reasonable
> support despite losing games, while a championship contender may
> experience frustration after underperforming. Making the playoffs after
> years of failure should feel different from merely making the playoffs
> immediately after winning a championship. Market size, recent franchise
> success, current competitive direction, roster quality, expectations, and
> relevant historical context should influence how fans interpret results
> where appropriate. Keep this understandable and maintainable rather than
> creating an unnecessarily complicated hidden formula.
>
> I want individual players to matter more to the fanbase through some
> form of player popularity, fan affinity, or fan-favorite status.
> Determine the cleanest implementation based on existing player and
> historical data. Factors could include performance, star power, tenure
> with the franchise, whether the team drafted the player, awards,
> All-Star selections, championships, loyalty, memorable achievements, and
> other meaningful factors already represented by the simulator. This
> should allow distinctions such as a newly acquired superstar, a rising
> fan favorite, a beloved long-term player, or a genuine franchise icon.
> Consequently, trading or losing different players should generate
> appropriately different fan reactions rather than treating players of
> similar basketball value identically.
>
> Significantly improve the Fan Reactions/Fan Pulse experience. I do not
> want the entire fanbase speaking with one generic voice or one fixed
> phrase per transaction type. Create varied reaction perspectives or fan
> segments that make public opinion feel diverse without unnecessarily
> simulating thousands of persistent individual fans. For example, some
> fans may prioritize winning immediately, some may value loyalty, some may
> be optimistic about young players and rebuilding, some may be highly
> reactionary, and casual fans may care more about stars and exciting
> events. Different groups should be capable of disagreeing about the same
> decision. Reactions must remain grounded in events that actually occurred
> and should continue consuming the existing event/news infrastructure
> rather than becoming an independent event-generation system.
>
> Improve the Fan Hub so users can immediately understand why sentiment is
> changing. Instead of primarily displaying a raw Fan Happiness number,
> show its recent direction and the major positive and negative factors
> currently influencing it. Consider a clear sentiment breakdown such as
> recent performance, major transactions, star power, player loyalty,
> expectations, playoff results, coaching decisions, or whatever factors
> genuinely exist after your architecture review. Users should be able to
> look at the page and understand why fans are happy or angry without
> needing to understand the underlying formulas.
>
> Improve the historical Fan Happiness visualization so that it tells a
> story rather than merely plotting one point per completed season. Since
> Fan Happiness will now be capable of changing during the season, consider
> showing meaningful changes over time and allowing major events to explain
> spikes or drops where practical. A user should eventually be able to look
> back and see that sentiment rose after a major signing or winning streak,
> collapsed after a controversial trade or playoff elimination, and
> recovered following later success. Determine the appropriate level of
> granularity so this remains performant and visually readable across many
> seasons.
>
> Reconsider the existing derived Attendance, Franchise Popularity,
> Merchandise, Season Tickets, and Buzz presentation. Currently several of
> these values largely move together because they are derived from the
> same underlying numbers. I want them to tell more distinct and believable
> stories where doing so adds value. Attendance could respond to factors
> such as team performance, Fan Happiness, market size, star power and
> franchise momentum. Merchandise could respond more strongly to star
> players, breakout players, major acquisitions, championships, rookies,
> and player popularity. Season-ticket demand could represent longer-term
> confidence in the franchise rather than simply mirroring short-term buzz.
> Social buzz could be especially sensitive to major news and exciting
> players. Do not create an enormous financial simulation solely to support
> these metrics; keep the models understandable and appropriately
> lightweight.
>
> Consider adding player-level merchandise/jersey popularity if it can be
> supported cleanly. For example, the Fan Hub could show which players
> currently drive the most merchandise interest and which players are
> rising or falling in popularity. A newly acquired superstar or breakout
> rookie could surge in popularity. This should emerge from player
> popularity and actual league events rather than random labels.
>
> Fan Engagement should also have somewhat more meaningful gameplay
> consequences, but it should not become an overpowering mechanic.
> Currently Fan Happiness only provides a modest owner-confidence
> adjustment. Analyze where additional consequences would make sense
> without turning this project into a ticket-pricing or business-management
> simulator. Possible connections include attendance, franchise reputation,
> ownership pressure, ownership's willingness to tolerate expensive win-now
> spending, or small contextual influences on other systems where
> justified. Do not connect Fan Happiness to unrelated mechanics simply for
> the sake of making it important, and do not allow it to override
> basketball or salary-cap fundamentals.
>
> I also want fan pressure to occasionally become something the user
> actually experiences rather than something they only observe on the Fan
> Hub. Extreme or sustained sentiment could generate contextual situations
> such as fans demanding change during a long losing streak, strongly
> opposing the potential departure of a franchise icon, celebrating a young
> player's emergence, questioning a coach, demanding greater ambition from
> a contender, or supporting patience during a promising rebuild. These
> should communicate pressure and consequences without taking control away
> from the user. The user remains the GM and should always be free to
> ignore public opinion and make whatever decision they believe is best.
>
> Give Fan Engagement stronger long-term memory. Major franchise history
> should influence the fanbase beyond the season in which it occurred.
> Championships, long playoff droughts, repeated postseason failures,
> dynasties, successful rebuilds, beloved franchise players, controversial
> departures, and other major historical developments should be capable of
> shaping expectations and sentiment in later seasons where the existing
> historical data supports it. A championship should feel like an important
> part of franchise history rather than simply producing a temporary
> numerical increase that is eventually forgotten.
>
> Redesign or improve the Fan Hub UI as necessary to communicate this
> deeper system clearly. I want it to feel like a pulse of the franchise's
> relationship with its supporters. A user should be able to quickly
> understand overall Fan Happiness and its trend, what is currently driving
> sentiment, fan reactions and disagreements, attendance/popularity trends,
> important fan-favorite players, merchandise or jersey interest where
> implemented, and significant recent events. Keep the interface visually
> engaging but avoid filling it with decorative metrics that have no
> meaningful interpretation.
>
> Most importantly, maintain the distinction between fan opinion and
> objective basketball strategy. Fans should be another stakeholder the GM
> considers, not an omniscient advisor telling the user the correct move.
> Sometimes the strategically correct long-term decision should be
> unpopular. Sometimes fans should become excited about a move that
> ultimately fails. Rebuilding, loyalty, star power, winning, financial
> decisions and long-term planning should create genuine tensions between
> what is popular and what the GM believes is best for the franchise.
>
> I do not want this to expand into a detailed arena-business simulator.
> Do not add ticket-price management, concessions, parking management,
> stadium operations, sponsorship negotiation, or similar systems unless
> they already have a compelling architectural reason to exist. Likewise,
> do not simulate thousands of individual persistent fans. The goal is
> depth through meaningful context, consequences, varied reactions and
> long-term memory rather than unnecessary complexity.
>
> The overall goal is that Fan Engagement becomes another meaningful
> dimension of being an NBA GM. I want situations where I genuinely think,
> "This trade makes basketball sense, but the fans are going to hate losing
> this player," or, "We're rebuilding and losing games, but the fans are
> excited because our young core finally gives them hope." The Fan Hub
> should explain and visualize that relationship, while fan sentiment
> should evolve naturally from what actually happens throughout the
> simulation.
>
> Before implementing any of this, perform the architecture-overlap review
> and tell me what you recommend building, modifying, reusing, simplifying,
> or leaving out based on the actual current codebase. Do not begin
> implementation until I respond to that review.

### Status

Architecture-overlap review complete and approved (2026-07-24). Recommended
5-phase sequencing confirmed:

1. Mid-season dynamic sentiment (inline hooks at trade/signing/streak/
   injury/staff/rotation call sites, replacing season-end-only recompute).
2. Franchise context/expectations (reuse `TeamIdentity`/`EvaluationVerdict`
   to weight how fans read a result, rather than one universal standard).
3. Player fan-affinity (new nullable `LeaguePlayer.joinedTeamSeason: Int?`
   field + a computed, not persisted, affinity function drawing on rating,
   tenure, draft origin, `SeasonAward`/`AllStarSelection` counts, and
   championship participation).
4. Fan segments + Fan Hub redesign (sentiment breakdown, event-annotated
   trend chart, distinct attendance/merchandise/tickets/buzz formulas,
   player popularity display).
5. Playoff qualification/elimination/championship news (net-new -
   `playoffs.ts` currently writes zero `LeagueTransaction` rows) + long-term
   franchise memory + fan-pressure moments + the one new gameplay
   consequence below.

Additional decisions confirmed:

- Player fan-affinity: computed on-demand (no hidden persisted formula),
  plus one new lightweight per-season snapshot table (mirroring
  `FanHappinessSnapshot`) so "rising/falling" popularity can be displayed.
- One new gameplay consequence approved: sustained Fan Happiness modestly
  nudges the existing offseason payroll-directive confidence threshold
  (`DIRECTIVE_CONFIDENCE_THRESHOLD` in `offseason.ts`) - ownership more
  tolerant of heavy win-now spending when fans are thrilled, less tolerant
  when they're unhappy. Reuses the existing directive system directly;
  never overrides real cap/spending discipline.

**Built (Phase 1 - mid-season dynamic sentiment):**

- New `src/lib/fans/sentimentEvents.ts` - one small function per curated
  event category (trades, signings, win/loss streaks, injuries/recoveries,
  staff hires/fires, notable rotation changes, awards, All-Star selections/
  snubs/results), each reusing an existing valuation/classification signal
  (`evaluateTradeOffer`'s score, `PlayerValueTier`, `describeWinStreak`'s
  own importance tiers, injury severity) as its magnitude, bounded by a
  small per-category cap - no flat per-event bonus, no new opinion engine.
- `Fan Happiness` now moves the moment a curated event actually happens,
  inline at the exact existing action call site (`executeTradeAction`,
  `maybeExecuteCpuTrade`, `signFreeAgentAction`, `maybeExecuteCpuSigning`,
  the streak/injury handling inside `simulateGamesAction`/`applyLeagueEvents`,
  `hireStaffAction`/`fireStaffAction`, `updateRotationAction`, the awards
  block in `advanceSeasonAction`, and `generateAllStarWeekend`) - not just
  retroactively guessed at from a bulk `LeagueTransaction` scan once a
  season. Batch game-processing (streaks, injuries) accumulates deltas in
  a local map and flushes once per chunk, the same pattern
  `winIncrements`/`streakByTeam` already use, so no new query-count class
  was introduced.
- The season-end pass still runs and still provides the larger outcome-
  based adjustment (verdict/win%, star power, coach style), but its bulk
  `computeTransactionSentiment` scan is now narrowed to
  `RETIREMENT`/`GAME_MILESTONE`/`GAME_RESULT` only - the categories with a
  dedicated inline hook are excluded there to avoid double-counting. Award
  deltas (only knowable at season end) are accumulated into the same
  unified `fanHappinessUpdates` pass everything else already goes through,
  specifically to avoid a read-stale-snapshot race that would have
  silently erased them.
- `evaluateTradeOffer` is now asked from _both_ sides of a user trade (the
  same "ask both sides" pattern Phase 2 of CPU GM Intelligence already
  established for CPU-CPU trades) purely to judge how each team's own fans
  read the deal - it never gates whether the trade executes.
- Verified via `src/lib/fans/sentimentEvents.test.ts` (16 cases - caps
  actually cap, fair events net near zero, lopsided ones swing hard in the
  right direction) and a hands-on fast-forwarded season: **19 of 30 teams
  had already moved off the 65 baseline before the season even ended** -
  direct proof mid-season movement works, not just the season-end pass.
  Full pipeline (playoffs, draft, offseason) completed without errors.

**Not yet built:** franchise context/expectations weighting (Phase 2),
player fan-affinity (Phase 3), fan segments/Fan Hub redesign/distinct
attendance-merchandise-tickets-buzz formulas (Phase 4), playoff news +
long-term memory + fan-pressure moments + the payroll-directive-threshold
consequence (Phase 5).

---

## Monthly NBA Schedule Calendar (requested 2026-07-25)

### Request (verbatim)

> I want to redesign the current Your Schedule section from the vertical
> Day 1 / Day 3 / Day 5 list into a proper visual monthly NBA calendar.
>
> Use real-looking calendar months and dates, with a standard 7-day weekly
> grid. The NBA season should progress naturally through months such as
> October, November, December, etc., and users should be able to navigate
> between months.
>
> For every date where my team has a game, make the opponent's team logo
> the main visual element of the calendar cell, displayed large and
> slightly faded/translucent in the background. Clearly indicate vs for
> home games and @ for away games.
>
> Once that game has been simulated, overlay a large green W or red L over
> the opponent logo, along with the final score underneath. Future games
> should simply show the faded opponent logo and home/away indicator
> without revealing a result.
>
> Empty/rest days should simply be empty calendar cells. Do not display
> text such as "1 day rest" anymore - the spacing between games on the
> calendar should communicate rest naturally.
>
> Clearly highlight the current simulation date and visually distinguish
> past and future dates. Keep the existing Sim Next Game and Sim Next 10
> Games functionality, but have progression reflected naturally through the
> calendar as games become completed.
>
> I want the overall result to feel like a polished professional NBA
> schedule interface, with the team logos and W/L results making it
> possible to understand the season at a glance.
>
> Before implementing, inspect the existing schedule/calendar architecture
> and determine the cleanest way to map the existing simulation timeline to
> months and dates without breaking simulation logic or existing leagues.
> Follow our usual architecture-overlap review process if there are
> important architectural decisions I should make first.

### Architecture-overlap review outcome

`Game.dayIndex` (`src/lib/simulation/generateSchedule.ts`) was confirmed to
be a sequential per-season integer, never tied to a real calendar date -
no `seasonStartDate` field or equivalent exists. The clean fix: a new,
pure, presentation-only `dayIndexToDate(season, dayIndex)` mapping
(anchored to October 24 of `season`), with zero changes to `dayIndex`,
`Game`, schedule generation, or simulation ordering - fully additive, so
every existing league gets the new calendar automatically with no
migration. Team logos (`Team.logoUrl`) were confirmed real and already
populated for all 30 teams, rendered via the same plain-`<img>` convention
already used in `PlayoffBracket.tsx`.

### Design decision (answered 2026-07-25)

Dedicated new page (`/leagues/[id]/schedule`) rather than embedding the
full calendar in the standings page's existing 3-column layout - matches
how Playoffs/Draft already get their own pages.

### Status

**Built:** `src/lib/calendar/seasonCalendar.ts` (`dayIndexToDate`,
`buildMonthGrid`, `getSeasonMonthRange` - all pure, unit-tested), a new
`MonthlyScheduleCalendar` client component (faded logo backgrounds, vs/@
indicators, W/L overlay with score, empty rest-day cells, today
highlighted, past/future distinguished, month navigation bounded to the
season's actual date range), and the new `/schedule` page. The old
vertical `SeasonCalendar.tsx` list is removed; the standings page now
links to the new page instead of embedding it, and the dashboard nav row
gained a "Schedule" link. Verified via 12 new unit tests and a hands-on
Playwright run with screenshots confirming real logos, vs/@ indicators,
and W/L overlays with scores render correctly after simulating games.

---

## Live Playoff Game Experience (requested 2026-07-25)

### Request (verbatim)

> I want to make playoff games involving the user's team feel like major
> interactive events, instead of being simulated the same way as ordinary
> regular-season games.
>
> Keep regular-season simulation as it is: games can be simulated normally
> and the user simply sees the final result.
>
> However, during the playoffs, every game involving the user's team should
> have a dedicated live game experience. Instead of immediately revealing
> the final score, simulate and visually present the game as if the user
> is watching a live NBA game.
>
> The scoreboard should update progressively throughout the game. Show:
>
> Both teams and their logos
> Current score
> Current quarter (1st, 2nd, 3rd, 4th, and OT if necessary)
> Game clock counting down
> The score changing throughout the game as possessions/events are
> simulated
> Clear quarter transitions, halftime, and the final result
> The current playoff series score, such as BOS leads 2-1
>
> I don't need the game to run for an actual 48 minutes. It should be a
> condensed live simulation that lasts long enough to create tension and
> make playoff games feel important, while still progressing quickly
> enough that it doesn't become tedious. Determine an appropriate pacing
> and allow the user to speed up or instantly finish the game if they
> don't want to watch the entire simulation.
>
> The score progression should be generated from the actual underlying
> game simulation rather than simply taking a predetermined final score
> and randomly animating numbers until reaching it. Team strength,
> rotations, player quality, injuries, coaching, and other mechanics that
> currently influence game outcomes should continue to matter.
>
> Where the existing player box-score architecture supports it, have
> player statistics accumulate alongside the game so the live simulation
> and final box score are consistent with each other. If doing this
> properly requires changes to the current simulation architecture,
> explain that during the architecture review rather than creating fake
> live events that don't correspond to the actual simulated game.
>
> Make close playoff games feel especially exciting. The fourth quarter
> should naturally create tension when the score is close, overtime should
> work properly, and the final seconds of close games should progress more
> slowly than an early-game blowout. Blowouts can progress faster.
>
> After the final buzzer, transition into a polished postgame playoff
> result showing the final score, updated series score, leading
> performers, player box score, and any relevant news/storylines generated
> by the existing systems.
>
> The main goal is that pressing Play Game during the playoffs feels
> completely different from simulating an ordinary regular-season game.
> Every playoff game involving my franchise should feel like an event
> where I can watch the score develop, experience the tension of the game,
> and then see the consequences for the playoff series.
>
> Before implementing, inspect the existing playoff, game simulation,
> box-score, rotation, and statistics architecture and follow our normal
> architecture-overlap review. Determine the cleanest way to build this
> using the existing simulation engine rather than creating a disconnected
> fake live-game system.

### Status

Built. New `simulateLiveGame.ts` engine (independent, empirically-calibrated
per-quarter simulation, per the accepted design decision above), playoff
box scores wired up for the first time (`generateBoxScore` + `PlayerGameStat`
rows with `gameType: PLAYOFF`), `playoffs.ts` restructured so the user's own
series pauses for game-by-game play while every other series still resolves
in bulk exactly as before, and a new live scoreboard page/flow (pre-game
rotation check-in, speed-controlled progressive reveal with a dismissible
late-and-close suggestion, postgame summary with box score and news). Fixed
a stale-props bug found during hands-on testing: the "Play next game" link
stayed on the same URL across a series' games, so Next.js never re-ran the
server component between games, leaving home/away team identity stuck on
Game 1's values even though real home-court alternates game to game -
switched that link to a plain anchor to force a full reload between games.
Running the full e2e suite (not just unit tests/manual screenshots) against
this feature surfaced three more real bugs, all fixed: (1) a genuine race
where Next.js re-runs the live page's Server Component in the background
after the "Tip off" action resolves, and since a game can decide the series
(e.g. a sweep on Game 4), the page's own `notFound()` guard on `series.
winnerTeamId` would fire and yank the 404 UI in over the client's own
correct live/postgame view - fixed by no longer 404ing on a decided series
there, since `playLiveSeriesGameAction` already independently re-checks
"is there really a pending game" fresh at click time, which is the correct
single source of truth for that; (2) the "Play Game N" link was a
client-side `next/link`, vulnerable to the identical stale-router-cache bug
already fixed for "Play next game" (every game in a series shares the same
seriesId-scoped URL) - switched it to a plain anchor too; (3) clicking "Sim
to End" could unmount the whole scoreboard component near-instantly (all
waits, including the final-score pause, collapsed to zero), racing
Playwright's (and in principle a real browser's) click-completion check -
fixed by giving the final-score transition a small unconditional floor
delay that "Sim to End" can't skip. Also fixed a real, independent product
bug this surfaced: `PlayoffControls` claimed "Round N complete - the
bracket has advanced" even when a bulk "Simulate other series" click was a
complete no-op (e.g. at the Finals, where the user's own series is the
_only_ one in the round) - now shows an accurate "nothing else to simulate"
message in that case. All type-checks, lint, the full unit test suite, and
all 10 e2e tests (including three rewritten to actually play the user's
own series via the live flow instead of assuming "Simulate next round"
alone reaches a champion) pass. `docs/ARCHITECTURE.md` updated.

## Simulator Onboarding & Flow (requested 2026-07-25)

### Request (verbatim)

> I want to improve the overall user experience and flow of the simulator.
> As more features are added, I am concerned that users - especially
> first-time users - may feel overwhelmed by the number of available
> pages, systems, and decisions. I want the simulator to feel intuitive
> and approachable while still retaining all of its depth.
>
> Rather than implementing a specific solution that I prescribe, I want
> you to first analyze the current architecture, navigation, UI, and
> overall user flow of the application. Think critically about how a new
> user experiences the simulator from the moment they log in for the
> first time and how an experienced user progresses through multiple
> seasons.
>
> Your objective is to ensure that users always have a clear understanding
> of what they should focus on next without restricting their freedom to
> explore the simulator. The application should naturally guide users
> through the experience of managing an NBA franchise instead of
> presenting a large collection of unrelated features.
>
> Based on the existing architecture, determine the best way to
> accomplish this. If that means redesigning the dashboard, introducing
> contextual guidance, highlighting recommended actions, improving
> navigation, reorganizing features, adding progression systems,
> surfacing important events, or implementing another solution entirely,
> choose whichever approach you believe provides the best long-term user
> experience.
>
> Do not simply implement the first idea that comes to mind. First,
> evaluate the current architecture and identify the biggest usability
> problems or areas where users may become confused or overwhelmed. Then
> propose your recommended solution, explain why it best fits the
> existing architecture, and describe how it improves the overall flow of
> the simulator. If multiple approaches are possible, compare them briefly
> and recommend the one you believe is most appropriate.
>
> Prioritize solutions that feel natural, scalable, and maintainable as
> more features are added over time. The simulator should remain easy for
> casual NBA fans to understand while still offering the depth expected
> from a franchise management game.
>
> My goal is for users to always feel like they know what to do next.
> Every stage of the NBA calendar should have a natural rhythm, important
> decisions should be surfaced at the right time, and the simulator should
> provide direction without forcing users down a linear path. I want the
> overall experience to feel polished, cohesive, and comparable to a
> commercial sports management game rather than a collection of
> independent features.
>
> Before making significant architectural or UX changes, explain your
> reasoning and proposed approach so we can ensure it aligns with the
> long-term vision of the simulator.

### Architecture-overlap review outcome

Traced the actual current flow instead of guessing: the team dashboard
(`/leagues/[id]`) opens with a flat, undifferentiated 12-link button row
(Standings/Schedule/Playoffs/Offseason/Draft/Free agents/Staff/Fans/
Leaders/News/History/Propose a trade) regardless of what phase the league
is actually in, plus a dense stack of stat cards with no "what to do next"
signal. Every sub-page only has its own "&larr; Back to team" link - there is
no persistent in-league navigation at all, so moving between sections
always bounces back through that one row. The `/leagues` hub's
`describeStatus` already computes a 4-bucket phase enum (regular season /
playoffs / draft pending / ready for next season), but it's one of three
independent, duplicated ad hoc "phase" computations in the codebase
(`playoffs/page.tsx`, `offseason/page.tsx`, and the hub), and it's too
coarse to guide anything - "ready for next season" collapses re-signings,
free agency, and staffing into one label. No recommendation/nudge system
exists anywhere outside the rotation board's own unrelated "recommended
depth chart" button, and no time-boxed mechanic (e.g. a trade deadline)
creates rhythm during the regular season. This lines up with two already-
roadmapped, unbuilt/partial items: #94 Interactive League Dashboard and #98
Onboarding Tutorial.

Compared a full onboarding tutorial/wizard against a persistent, phase-
aware in-league sub-nav plus a ranked "Action Center" of recommended next
steps. Recommended the latter combination and explicitly recommended
against a tutorial as the primary fix - it only helps the very first
session, gets skipped/annoying on replay, and is a maintenance liability
as new features ship. The sub-nav fixes "get me anywhere"; the Action
Center fixes "tell me what matters" - together they address the actual
complaint. A first-time user's welcome moment can ride the same Action
Center mechanism (e.g. its first-ever entry for a brand-new league) rather
than needing a second, parallel tutorial system.

### Design decisions (answered 2026-07-25)

- Direction: build the persistent sub-nav + Action Center combination (no
  separate onboarding wizard).
- Sequencing: phase it - Phase 1 is a shared league-phase/status module
  (consolidating the three duplicated ad hoc computations) plus a
  persistent, badge-carrying in-league sub-nav (replacing the flat button
  row and the per-page "Back to team" links via a new
  `leagues/[id]/layout.tsx`). Phase 2 (separate pass) is the Action Center
  widget built on top of that shared phase module.

### Status

Phase 1 built. New `src/lib/league/leaguePhase.ts` (`computeLeaguePhase` +
a pure, unit-tested `deriveLeaguePhase`) consolidates the three previously
duplicated ad hoc phase computations - `offseason/page.tsx`, `draft/
page.tsx`'s `gatePhase`, and the `/leagues` hub's `describeStatus` now all
call the one shared function instead of recomputing it. New `src/lib/
league/subNavSections.ts` (pure, unit-tested) maps a phase to which of the
12 sections are "primary" vs "secondary" for that phase. New `src/app/
leagues/[id]/layout.tsx` wraps every page under a league with a persistent
header (team identity, clickable back to the dashboard) and the new
`LeagueSubNav` client component - every section is always directly
clickable (primary sections as bordered accent pills, secondary sections
as smaller muted text links), not hidden behind a click.

One deliberate deviation from the original plan: an early version hid
"secondary" sections behind a collapsed `<details>` "More" disclosure, but
running the full e2e suite immediately surfaced that this turned "one
click away" into "invisible until you find More first" for flows that
click a section directly mid-phase (e.g. Free Agents during the draft
window, News right after a trade) - the same friction a real user would
hit. Switched to always-visible-but-de-emphasized links instead; nothing
is ever hard-hidden, only de-prioritized visually. This also meant
dropping the badge concept per-se in Phase 1 (no counts/dots anywhere yet)

- purely structural, as scoped; the Action Center (Phase 2) is where
  badges/counts belong.

All 12 sub-pages plus the dashboard had their own inconsistent "&larr; Back
to team"/"Back to your team" links and a couple of redundant inline
cross-links (Standings' "View full schedule," Playoffs' "Standings" link,
etc.) removed, now redundant with the persistent nav. Also disabled
`prefetch` on every nav link (they render on literally every page view, so
eagerly prefetching all 12 sections every time was pure waste - discovered
while chasing an intermittent e2e failure, see the Live Playoff Game
Experience entry above for what that investigation actually turned up).

All type-checks, lint, the full unit test suite (579 tests), and all 10
e2e tests pass. `docs/ARCHITECTURE.md` updated.

### Phase 2 status (Action Center)

Built. Three parallel research passes (team health, front-office urgency,
season rhythm) confirmed every rule below is cheaply and honestly
derivable from state that already exists - nothing invented, and almost
all of it needs zero new queries beyond what the team dashboard already
fetches. New `src/lib/gm/actionCenter.ts` (`computeActionCenterItems`,
pure and unit-tested, 18 tests; `getActionCenterItems`, a thin async
wrapper that runs the handful of extra queries) implements 9 rules in a
fixed priority order - pending live playoff game, pending All-Star
Weekend, GM job security critical, ready to advance to next season, an
unmet owner payroll directive, a rotation needing attention (never set,
or an OUT/SEASON_ENDING player still occupying a rotation slot), a good
player's contract expiring after this season, a staff vacancy, and cap
space paired with a real roster need. New `src/components/dashboard/
ActionCenter.tsx` renders the top 3 that actually apply (`ACTION_CENTER_
DISPLAY_LIMIT`) between the team dashboard's overview-card row and cap-
stat row, colored by severity; shows a calm "nothing urgent" message
rather than disappearing when none apply.

Verified hands-on with a screenshot of a freshly created league: the
Action Center correctly showed "You haven't set your rotation yet" as
the only applicable item (confirmed via `ensureStaffGenerated` that new
leagues auto-hire all 3 staff roles for every team, so no staff-vacancy
false positive) - a concrete demonstration of the original "always know
what to do next" goal working for a brand-new user's very first dashboard
view. All type-checks, lint, the full unit test suite (597 tests), and
all 10 e2e tests pass. `docs/ARCHITECTURE.md` updated.

Out of scope, per the agreed plan: surfacing Action Center items anywhere
outside the team dashboard (e.g. in the persistent nav itself), and
per-item dismiss/snooze state - always a fresh read of current reality.

## GM Career Mode — Phase 1 (requested 2026-07-26)

### Request (verbatim)

> [User]: "taking an indepth look on the current state of the simulator,
> suggest things to improve on/add"
>
> Read `docs/IMPLEMENTATION_PLAN.md` (the 100-item tracker) and
> `docs/FEATURE_ROADMAP.md`, cross-referenced against the actual codebase,
> and presented a set of concrete suggestions (cap/trend visualizations,
> global search, Trade Grades, Player Comparison Tool, CPU free-agency
> evaluation Phase 3, and GM Career Mode). Asked which to tackle next via
> `AskUserQuestion`.
>
> [User selected]: "GM Career Mode" - the big, ambitious pillar already
> designed (but unstarted) in `docs/IMPLEMENTATION_PLAN.md`'s Phase 12
> section: persistent GM Reputation across leagues, a real "you've been
> fired" dramatic event with a recap screen, a choice between entering a
> reputation-gated GM job market or retiring with a full career summary
> (seasons, record, notable trades, career earnings, career
> grade/title).

### Architecture-overlap review outcome

Three parallel research passes (existing firing/accountability mechanics,
User/League multi-franchise architecture, career-stat aggregation
feasibility) found: owner confidence hitting the CRITICAL tier today is
purely cosmetic (a label + an Action Center nudge) - no firing event,
persistent reputation, or career-record concept exists anywhere in the
codebase; this is fully greenfield on top of real, already-working
prerequisites (owner confidence, job security tiers, season expectations).
`User` is auth-only today - a clean, uncontested place to add
cross-league reputation. Critically, **league deletion is a hard,
cascading delete** (`deleteLeagueAction`) - nothing survives it - so any
career summary must be snapshotted permanently onto the `User` at the
moment a tenure ends, never computed live from league tables afterward.
Playoff appearances/championships are fully available and permanent
within a league's life (just need a new aggregate query, not new
tracking); trade data is structured enough to retroactively grade the
most notable trade at snapshot time using the existing valuation models;
career earnings is the one genuine tracking gap (expired `Contract` rows
are deleted, so nothing preserves historical payroll) - needs new
incremental accumulation going forward. `/leagues/new`'s team picker has
zero real eligibility gating today (only a cosmetic "already run this
team" label), so a reputation-gated job market is a substantial new
sub-system, not a small add-on.

### Design decisions (answered 2026-07-26)

- Scope: **phase it** - this pass covers real firing, a career-record
  snapshot, and a retirement path; the reputation-gated GM Job Market is
  an explicit follow-up pass.
- Firing trigger: **`ownerConfidence` hits the hard floor of 0** (already
  clamped there each season) rather than merely entering the CRITICAL
  tier - reaching the literal floor takes several bad seasons, so it
  reads as a real endpoint, not a cheap gotcha.

Full design (schema, the firing trigger inside `advanceSeasonAction`, the
ended-league view reusing `leagues/[id]/layout.tsx`, and the new `/career`
page) is captured in the approved plan file
(`.claude/plans/tender-orbiting-scone.md` at planning time) and summarized
in this doc's Status section below as it's built.

### Status

Architecture-overlap review complete, plan approved. **Phase 1 completed
2026-07-28** (resumed after the mid-stream pause):

- **Firing trigger** wired into `advanceSeasonAction`: when owner confidence
  hits the hard floor (0) after a season, the tenure ends - the career is
  snapshotted permanently onto the `User` (via the pre-existing
  `computeCareerRecordSnapshot`), `User.gmReputation` moves by
  `computeReputationDelta`, and `League.endedAt` is set. Guarded so an ended
  league can never be advanced again.
- **Career-earnings tracking** (the one genuine gap the review flagged) wired:
  `LeagueTeam.totalPayrollPaidCents` now accumulates each completed season's
  payroll in the finances pass, before expired contracts are deleted.
- **Voluntary retirement** (`src/lib/actions/careerActions.ts` +
  `RetireButton` on the dashboard): end a tenure on your own terms - a
  `RETIRED` `CareerRecord` with no firing penalty.
- **Ended-league recap**: `leagues/[id]/layout.tsx` locks any ended franchise
  to a read-only "You've Been Fired / You Retired" recap
  (`CareerEndRecap`) reading the permanent snapshot.
- **`/career` page** (+ NavBar link): current GM reputation + title, career
  aggregate stats, active franchises, and every past tenure.
- Verified: `tsc`/`eslint` clean, 730 tests pass (existing
  `careerRecord.test.ts` covers the formulas), routes compile.

**Phase 2 (not built):** the reputation-gated GM Job Market (other teams make
offers scaled to reputation after a firing) - the explicit follow-up pass.

## Draft Lottery Experience (requested 2026-07-26)

### Request (verbatim)

> I want to implement a Draft Lottery experience, and I want this to be
> one of the most polished, exciting, visually impressive, and
> interactive features in the entire NBA Front Office Simulator.
>
> Do not approach this as simply another page that calculates and
> displays the lottery order. I want the Draft Lottery to feel like a
> major annual NBA event that users genuinely look forward to reaching
> every season.
>
> Before implementing anything, inspect the existing draft, draft-pick
> ownership, standings, playoffs, season progression, calendar, News,
> Fans, History, team assets/logos, and any other relevant architecture.
> Follow our normal architecture-overlap review and reuse existing
> systems rather than duplicating them. If important design decisions or
> conflicts exist, explain them before implementation.
>
> The lottery itself should use realistic NBA Draft Lottery rules and
> odds appropriate to the simulator. Draft-pick ownership must be
> respected, including traded picks and any protections if the simulator
> currently supports them. The result must genuinely come from the
> lottery simulation rather than being predetermined for presentation
> purposes.
>
> Most importantly, make the Draft Lottery presentation exceptional.
>
> I want a dedicated Draft Lottery experience with strong visual
> presentation, animations, team logos, lottery odds, projected
> positions, pick movement, and suspense. Treat this more like an event
> in a sports game than a database screen.
>
> Before the lottery begins, show a polished overview of the lottery
> teams and their odds. Make it immediately clear which teams have the
> best chances at the #1 pick, which picks are owned by other teams, and
> which outcomes are especially important.
>
> When the user starts the lottery, do not instantly display all 14
> picks.
>
> Create a dramatic pick-by-pick reveal, starting from Pick #14 and
> progressing toward Pick #1. Each reveal should have satisfying pacing
> and animation. Team logos should be prominent. Build suspense as the
> lottery reaches the top picks.
>
> Make unexpected movement exciting. If a team jumps significantly above
> its projected position, visually emphasize it. If a team falls several
> spots, communicate that clearly. If the user's team jumps into the top
> four, that should feel like a huge moment.
>
> The final few picks should receive especially strong presentation. The
> reveal of Pick #1 should feel like the climax of the entire event
> rather than just another row appearing.
>
> Give users control over the experience. They should be able to:
>
> Reveal the next pick manually
> Auto-play the lottery reveal
> Adjust reveal speed if appropriate
> Skip directly to the final results if they don't want to watch
>
> However, skipping or changing presentation speed must never change the
> actual lottery result.
>
> Once completed, transition naturally into a polished Lottery Results
> view showing the complete draft order, original lottery odds, movement
> from projected position, biggest winners and losers, pick ownership,
> and any other useful information.
>
> Integrate the result deeply with the rest of the simulator. The
> lottery should determine the actual draft order used by the Draft
> system. News should react to major lottery jumps, falls, the #1 pick
> winner, and particularly important outcomes. Fans should react where
> appropriate. History should preserve lottery results so users can look
> back at previous seasons. CPU teams should understand their resulting
> draft position afterward.
>
> If the simulator has generated draft prospects available by this
> stage, use them to increase the stakes where appropriate. For example,
> if there is an elite or generational projected #1 prospect, the UI and
> News system can naturally communicate why winning that year's lottery
> is particularly important. Do not manufacture this storyline if the
> actual draft class does not support it.
>
> I also want the experience to account for the user's emotional
> investment. If they own multiple lottery picks, clearly track all of
> them throughout the reveal. If they own another team's pick, make that
> obvious. If their pick has already been revealed, the remaining lottery
> should still be easy to follow.
>
> Visually, I want you to push this feature much further than an
> ordinary CRUD-style page. Use the existing design language of the
> simulator, but give the Draft Lottery its own premium event atmosphere.
> Use excellent typography, spacing, hierarchy, team branding/logos,
> animations, transitions, probability visualization, suspenseful
> reveals, and responsive feedback to user actions.
>
> Feel free to introduce creative visual or interaction ideas I haven't
> explicitly requested if they genuinely improve the experience. You
> have access to the codebase and therefore understand the available
> components and assets better than I do. I want you to use your
> judgment and creativity rather than implementing only the minimum
> interpretation of this prompt.
>
> At the same time, don't sacrifice correctness for spectacle. The
> underlying lottery mathematics, draft-pick ownership, persistence,
> season progression, and integration with the Draft must be robust and
> deterministic where required. The visual reveal should be a
> presentation of a legitimate simulated lottery result, not fake
> suspense layered over incorrect logic.
>
> Think of this as one of the simulator's signature features. I want
> someone seeing the Draft Lottery for the first time to think that an
> unusual amount of care went into it.
>
> The standard I want is essentially: make the best Draft Lottery
> experience you reasonably can within this simulator's architecture.
> Prioritize polish, suspense, interactivity, visual quality,
> authenticity, and integration with the wider league.
>
> Do not artificially limit yourself to exactly what I described. If,
> after inspecting the application, you see opportunities to make the
> Draft Lottery substantially more immersive or memorable, propose them.
>
> Before implementation, perform the architecture-overlap review and
> present your recommended design, architecture, integrations, and any
> decisions you need from me. Do not begin implementation until I
> approve it.

### Status

Built and verified. Architecture-overlap review confirmed the lottery
math, pick-ownership, and CPU draft-position logic already worked and
needed zero changes - this added a presentation and persistence layer
around them:

- Schema: new `LotteryResult` model (permanent per-team snapshot of
  projected seed, real odds, and actual outcome) and `DRAFT_LOTTERY`
  transaction type, migrated.
- `runDraftLotteryAction` (`src/lib/actions/draftLottery.ts`) replaces
  the old presentation-free `startDraftAction`: same seeded compute-and-
  persist pass, plus writes `LotteryResult` rows, creates news for
  what's genuinely notable, and applies fan-sentiment deltas.
- Pure helpers (`src/lib/draft/lotteryPresentation.ts`): odds overview,
  headline-prospect detection (only above a real ratings threshold -
  never a manufactured storyline), and notable-movement detection -
  all unit tested.
- `/leagues/[id]/draft/lottery` (`DraftLotteryExperience.tsx` +
  `LotteryOverview`/`LotteryReveal`/`LotteryResults`): a pre-draw odds
  overview, a pick-14-to-pick-1 animated reveal with manual/auto/1x-4x/
  Fast/Skip-to-Results controls (built on the same `waitTicks`/ref-
  mirrored-speed pattern as the live playoff scoreboard, including its
  "skip must still hold on the authoritative final state" fix), and a
  results view with movement, ownership, and biggest riser/faller -
  verified the skip control never changes the underlying result and
  that revisiting the route after completion reads the persisted
  result rather than re-running anything.
- Integration verified end-to-end via a full season/playoffs/lottery
  run: Action Center surfaces a "Draft Lottery is ready" item once a
  champion is crowned; `DRAFT_LOTTERY` news and fan-happiness deltas
  are created for the real result; League History shows each season's
  lottery winner, odds, and any notable jump/fall permanently; the
  `/draft` entry point now gates on the lottery instead of an instant
  "Start the draft" button.
- `tsc`/`eslint`/the full `vitest` suite (616 tests) all pass; both
  `draft.spec.ts` and `offseason.spec.ts` e2e tests were updated for the
  lottery-first flow and pass.
- Out of scope, unchanged: real draft-pick protections (roadmap #72,
  still unstarted - `DraftPick.protectionNote` remains inert), and the
  actual lottery odds/mechanics or picks 15-60 ordering (untouched).

## Draft Experience Redesign (requested 2026-07-26)

### Request (verbatim)

> I want to significantly redesign and expand the NBA Draft so that it
> feels like one of the biggest events of every offseason rather than
> simply selecting players from a list. The draft should become an
> immersive, polished, and exciting experience that users genuinely look
> forward to every season.
>
> Redesign the entire Draft interface with a premium presentation
> inspired by real NBA Draft broadcasts. The experience should clearly
> show the current pick, the team currently on the clock, the remaining
> time to make a selection where appropriate, team logos, draft order,
> and an organized draft board that updates live throughout the event.
> The interface should feel modern, cinematic, and professional rather
> than resembling a simple table or list.
>
> Every prospect should have a rich draft profile rather than simply a
> name and overall rating. Prospect profiles should include a headshot
> or placeholder image, age, position, height, weight, college or
> international team, nationality, strengths, weaknesses, play style,
> projected role, athletic profile, potential, current ability,
> projected draft range, scouting confidence, comparisons to current or
> former NBA players where appropriate, and any other information that
> makes evaluating prospects more engaging.
>
> Allow users to inspect and compare prospects before making their
> selection. Users should be able to sort, search, filter, bookmark,
> compare multiple prospects side-by-side, and build their own draft
> board before the draft begins. Team needs should also be displayed so
> users can understand which positions each franchise is likely
> targeting.
>
> When each selection is made, present it as an event rather than
> instantly updating the draft order. Animate each pick being announced,
> update the draft board in real time, and display a draft card
> introducing the selected player along with the selecting team. The
> presentation should feel exciting and polished while keeping the
> pacing smooth.
>
> The AI should draft intelligently based on team needs, positional
> depth, player potential, current roster construction, rebuilding
> versus contending timelines, player fit, and overall prospect value.
> Teams should not simply draft the highest-rated player every time.
> Reaching for a prospect, drafting for positional need, or selecting a
> high-upside project should all be realistic possibilities depending on
> the organization's philosophy.
>
> Implement dynamic draft-night events that make every draft unique.
> Teams should occasionally trade picks during the draft, unexpected
> prospects should rise or fall, projected lottery players may
> unexpectedly slide, hidden gems should occasionally emerge, and
> surprising selections should create league-wide discussion. Every
> draft should feel different rather than following the exact same
> pattern every season.

### Status

Architecture-overlap review complete, plan approved and explicitly
phased (user-approved): **both Phase A (CPU intelligence + data) and
Phase B (the full broadcast-style visual/interaction redesign) are
built and verified.**

Phase A, built and verified:

- Schema: `DraftProspect` gained `heightInches`/`weightLbs`/
  `collegeOrTeam`/`isInternational`/`nationality`/`comparisonPlayerName`;
  new `DraftProspectBookmark` model; new `DRAFT_SELECTION` transaction
  type.
- `src/lib/draft/draftAi.ts` - CPU picks now weigh team identity
  (contend vs. rebuild), positional need, and GM personality, reusing
  the exact same primitives the trade AI already established
  (`TeamIdentity`/`TeamNeed`/`GmPersonality`/`playerFillsNeed`/
  `NEED_FIT_BONUS_MULTIPLIER`) rather than a parallel system. Reaches,
  slides, and high-upside project picks emerge from real per-team
  scoring differences - no scripted "surprise" mechanic.
- `src/lib/draft/draftPickTradeRoll.ts` - occasional same-draft CPU-CPU
  pick trades (a team trading up), judged by the same
  `evaluateTradeOffer`/`computeDraftPickTradeValue` the pre-draft trade
  builder uses; both sides must genuinely accept.
- `src/lib/draft/draftNightNarrative.ts` - reach/steal detection, forked
  from the Draft Lottery's own notable-movement shape; logged as real
  `DRAFT_SELECTION` news.
- `src/lib/draft/prospectBio.ts` - height/weight/college-or-international-
  team/nationality/a tiered real-player comparison (always framed as
  scouting opinion, per your explicit sign-off on that specific piece),
  generated once alongside the existing rating curve.
- `scoutingConfidence`/projected draft range are computed/display-only
  (age-derived and class-rank-derived respectively) - no new columns,
  no hidden-information mechanic; every rating stays fully visible, as
  documented.
- Bookmarking ("build your own draft board") via a new per-league join
  table and a star toggle + "My Draft Board" filter.
- A rookie's `heightInches`/`weightLbs` now actually carry onto their
  real `Player` row at draft time (a genuine, low-risk correctness fix -
  the field already existed for real players, just was never populated
  for rookies).
- Verified end-to-end via a full season/lottery/draft run: CPU teams
  visibly favor upside vs. floor by identity, in-draft trades fired and
  produced real news, genuine reaches/steals were detected and read
  believably, height/weight now show up on a rookie's player page, and
  bookmarking persists across a reload.

Phase B, built and verified - `DraftExperience.tsx` is now a thin
orchestrator (`src/components/draft/`) composing:

- `DraftBroadcastHeader.tsx` - on-the-clock hero with team logo, round/
  pick number, the team's identity and top needs, and a purely cosmetic
  countdown clock (resets per pick, no gameplay consequence on timeout -
  a real countdown that force-picks for the user would be hostile UX in
  a single-player game, not exciting).
- `DraftOrderRail.tsx` - an auto-scrolling strip of all 60 picks with
  team logos, highlighting the current/user-owned/decided state of each.
- `PickRevealStage.tsx` - forked directly from the Draft Lottery's
  `LotteryReveal.tsx`: the same manual/auto/1x-4x/Fast/skip mechanism,
  including its "skip must still hold on the authoritative final state"
  discipline (a real staleness bug was caught and fixed while forking
  this - the naive port read React state instead of a closure-local
  counter when force-applying skipped entries). Handles both a full CPU
  batch and the user's own single pick (hiding pacing controls entirely
  when there's only one entry to show). Trade/reach/steal moments get a
  distinct banner, reusing the lottery's existing animation keyframes.
  The board, order rail, and prospect list all update live pick-by-pick
  during the reveal, not just once at the end.
- `DraftBoard.tsx` - round-grouped decided-picks list with a "My Picks"
  filter.
- `ProspectBoard.tsx` - search, sort (Overall/Potential/Age/Name),
  position filter, bookmark star, and a compare checkbox (capped at 4)
  per prospect - one persistent panel usable throughout the whole draft,
  not just before it starts.
- `ProspectProfileModal.tsx` - the full rich profile in a dedicated
  modal.
- `ProspectCompareTray.tsx`/`ProspectCompareModal.tsx` - side-by-side
  comparison of 2-4 selected prospects across every profile field.
- `TeamNeedsOverview.tsx` - every team's identity/needs at a glance, the
  same data the draft-AI already computes for its own decisions.
- `src/lib/gm/teamDraftContext.ts` (new, shared) - extracted so the
  AI's own context-builder and the new display layer compute team
  identity/needs from one place, not two that could drift apart.
- Verified end-to-end with real screenshots through a full draft: the
  broadcast header, live order rail, a mid-reveal batch with visible
  trade/reach banners, an expanded profile modal (height/weight/club/
  nationality/comparison all populated), a 3-prospect compare table, and
  the team-needs tab all confirmed working as designed.
- `tsc`/`eslint`/the full `vitest` suite (644 tests) all pass; both
  `draft.spec.ts` and `offseason.spec.ts` e2e tests were updated for the
  new UI (a selector collision with the new "My Draft Board" button's
  accessible name in Phase A, and new reveal-stage text/controls in
  Phase B - both real issues the tests caught) and pass.
- Out of scope, unchanged: real pick protections (#72), cross-season
  future-pick trading during the draft, fog-of-war/hidden scouting
  uncertainty, pick-for-player draft-night trades, Draft Combine (#70),
  Mock Draft generator (#69).

## Homepage/Landing Page Redesign (requested 2026-07-27)

### Request (verbatim)

> I want to completely redesign the homepage/landing page of the NBA
> Front Office Simulator.
>
> The current homepage is too focused on presenting the project as a
> software engineering portfolio. It contains sections such as "The
> engineering behind the front office," development milestones, tech
> stack, shipped/planned engineering features, Next.js, TypeScript,
> PostgreSQL, Prisma, testing tools, etc.
>
> Remove this developer-facing content from the user-facing homepage.
> This information can remain in documentation/README files, but the
> actual simulator homepage should feel like the opening screen of a
> polished NBA front-office management game.
>
> I want the new homepage to be simple, visually impressive, premium,
> and immediately understandable without becoming cluttered.
>
> The primary purpose of the page should be to make the user want to
> start managing a franchise.
>
> Create a strong hero section centered around the fantasy of becoming
> an NBA GM. Use bold typography, strong basketball/front-office visual
> identity, subtle animations or visual effects where appropriate, and
> the existing dark design language of the simulator.
>
> The primary CTA should be something obvious such as Start Your
> Franchise, Create League, or whatever best matches the application's
> existing flow. Returning users should have an intuitive way to
> Continue League / My Leagues.
>
> Below the hero, include only a small amount of high-impact content
> that demonstrates what makes the simulator exciting. Instead of
> explaining the technology, showcase the gameplay experience: building
> a roster, making trades, managing the salary cap, drafting players,
> signing free agents, setting rotations, managing staff, dealing with
> ownership and fans, competing for championships, watching the league
> evolve, etc.
>
> Do not create a giant feature checklist. Prefer a few visually
> impressive sections/cards that communicate the experience quickly.
>
> Where appropriate, use existing NBA/team visual assets already
> available in the project, such as team logos, to make the page feel
> connected to basketball. Do not introduce unnecessary new assets or
> dependencies if the existing project already has what is needed.
>
> I also want the page to communicate that this is a deep simulation,
> but do this through the design and gameplay messaging rather than
> technical terminology.
>
> Remove development labels such as Shipped, Planned, In Progress,
> milestone numbers, architecture links, testing information, and
> tech-stack lists from the main experience.
>
> Keep the page relatively short. I would rather have 3-4 excellent
> sections than 10 mediocre sections.
>
> A possible structure could be:
> Hero → Start/Continue Franchise → Short gameplay showcase → Key
> franchise-management experiences → Final Start Franchise CTA
> However, you have access to the actual application, existing UI
> components, navigation, league creation flow, assets, and design
> system, so use your own judgment about the exact layout rather than
> blindly following that structure.
>
> The final result should feel like the opening screen of an actual NBA
> GM simulator, not a university/software portfolio project.
>
> Before implementing, inspect the existing homepage, design system,
> available assets, authentication/league flow, and reusable components.
> Then redesign the page comprehensively. You have creative freedom over
> the visual direction as long as it remains consistent with the rest of
> the simulator and prioritizes simplicity, polish, and the fantasy of
> running an NBA franchise.

### Status

Built and verified. Architecture-overlap review confirmed this was a
pure presentation-layer change - no new routes, actions, or schema; the
sign-up/`leagues/new`/`leagues` hub/`teams` flows the new CTAs point to
were all already correct and untouched:

- `Hero.tsx` rewritten: dropped the "in active development" dev badge
  and CBA-engine bragging copy for GM-fantasy framing. The primary CTA
  is now session-aware (`src/lib/marketing/primaryCta.ts`, shared with
  the new closing banner so they can't drift): signed out → "Start Your
  Franchise" (`/sign-up`), signed in with no franchise yet → "Start Your
  Franchise" (`/leagues/new`), signed in with a franchise → "Continue
  Your Franchise" (`/leagues`). Secondary CTA "See the League" →
  `/teams`.
- `TeamLogoMarquee.tsx` (new): a quiet, continuously-scrolling strip of
  every real team's crest beneath the hero - pure CSS `@keyframes`
  (`logo-marquee-scroll` in `globals.css`), reusing the exact
  `Team.logoUrl` data and plain-`<img>` convention already used on
  `/teams`/`/leagues/new`. No new assets or dependencies.
- `GameplayShowcase.tsx` (new, replaces `FeatureGrid.tsx`): 4 cards in
  GM-fantasy language (Build Your Roster / Master the Cap / Run the
  Whole Organization / Chase a Championship) - no status badges, no
  "shipped/planned," reusing the existing `animate-lottery-card-in`
  entrance keyframe.
- `FinalCta.tsx` (new): a closing CTA banner mirroring the hero's
  session-aware logic.
- `TechStrip.tsx` and `RoadmapSection.tsx` deleted outright (fully
  engineering-facing, nothing to salvage); `SiteFooter.tsx` dropped "a
  solo portfolio project," kept the real NBA-affiliation disclaimer.
- Follow-on fixes for the two places that linked to the now-removed
  `#engineering` anchor: `NavBar.tsx`'s "Engineering" link removed;
  `src/app/leagues/page.tsx`'s "Explore" card repointed to the existing,
  genuinely user-facing `/guide/finances` rules guide instead.
- Verified end-to-end with screenshots in all three session states
  (signed out, signed in with no franchise, signed in with a franchise)
  confirming the correct CTA text/destination in each, plus the
  `/leagues` hub's replaced card linking to `/guide/finances`.
  `tsc`/`eslint`/the full `vitest` suite (644 tests) all pass - no test
  coverage expected or added, since this is presentation-only with no
  new pure logic or server actions.
- Out of scope, unchanged: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`,
  `README.md` - the engineering narrative still lives there, just not
  on the user-facing homepage.

## Player Morale & Personality System (requested 2026-07-28)

### Request (verbatim)

> I want to implement a comprehensive Player Morale and Personality
> system that makes players feel like individuals with their own
> expectations, priorities, reactions, and career interests rather than
> simply assets with ratings and contracts.
>
> Before implementing anything, thoroughly analyze the existing
> architecture and determine how this system should integrate with
> everything already built. Follow our existing architecture-overlap
> review protocol. Reuse existing systems and data wherever appropriate,
> and if there are significant overlaps, conflicts, missing foundations,
> or a better architectural approach, explain them to me before
> implementation.
>
> The core goal is to make managing people an important part of being a
> GM. Roster decisions should sometimes have human consequences, and
> different players should react differently to the same situation.
>
> Give players believable personalities and priorities that influence
> what makes them happy or unhappy. These should develop into meaningful
> differences between players rather than simply producing random
> flavor text. Determine the appropriate personality model based on the
> existing simulator architecture.
>
> Player morale should evolve dynamically from what actually happens
> within the simulation. It should respond to relevant circumstances
> involving the player's role, playing time, starting status, team
> performance, roster decisions, contracts, transactions, coaching,
> career stage, team direction, and any other factors that genuinely
> make sense based on systems that currently exist.
>
> This should integrate especially deeply with Rotation Management.
> Changes to a player's role or minutes should matter. However,
> reactions must be contextual. Players should have different
> expectations based on their ability, previous role, age, career
> situation, personality, contract, team circumstances, and other
> relevant factors. I do not want every player becoming unhappy simply
> because another player receives more minutes.
>
> Morale should have meaningful but balanced gameplay consequences.
> Determine what consequences make sense within the existing simulation
> rather than arbitrarily adding penalties. I want morale to matter
> enough that users consider it when making decisions, without making
> roster management frustrating or forcing users to constantly satisfy
> every player.
>
> Create ways for players or their representatives to communicate
> important concerns to the GM. When something meaningful happens, the
> user should be able to understand why a player is satisfied or
> dissatisfied rather than only seeing a morale number change. Determine
> the most immersive and appropriate interaction model based on the
> existing application.
>
> Serious dissatisfaction should be capable of escalating naturally if
> the underlying issue continues. The system should support believable
> longer-term consequences where appropriate rather than having morale
> simply fluctuate up and down without meaning. At the same time,
> escalation should be relatively significant and contextual rather than
> constantly happening.
>
> Personality should influence these reactions. Two players placed in
> essentially the same situation should not necessarily respond
> identically. Personality should also remain consistent enough across
> seasons that users gradually learn what their players value and feel
> like they are managing actual individuals.
>
> Integrate morale and personality with existing systems wherever
> logically appropriate. Decisions and events that already occur within
> the simulator should become inputs into this system rather than
> requiring duplicate event-detection pipelines. Likewise,
> morale-related consequences should feed naturally into existing
> systems where appropriate rather than creating disconnected
> mechanics.
>
> Consider how this should interact with CPU-controlled teams as well.
> Players on the other 29 teams should still have personalities,
> expectations and morale. CPU GMs should be capable of responding
> appropriately to serious player situations so that these mechanics
> create league-wide consequences rather than existing only for the
> user's franchise.
>
> Make the system work naturally across many simulated seasons and with
> generated players. Nothing should depend on hardcoded current NBA
> players. Personalities, expectations, relationships with teams, and
> career circumstances should continue evolving as the league becomes
> increasingly fictional.
>
> The UI should communicate all of this clearly without overwhelming
> casual users. Users should be able to understand a player's current
> morale, important concerns, expectations and personality when that
> information is relevant, while deeper information can be available for
> users who want to investigate it. Avoid turning roster management into
> constant micromanagement.
>
> Most importantly, I want this system to create emergent situations and
> decisions. Morale should not primarily exist as another number on the
> player profile. What happens on the court and in the front office
> should create believable player reactions, those reactions should
> sometimes create situations the GM has to manage, and the GM's
> response should have consequences.
>
> The system should make existing mechanics more interconnected rather
> than simply adding another standalone feature. Rotation decisions,
> transactions, contracts, performance, team direction and other
> relevant systems should feel more meaningful because actual players
> now have opinions about what is happening to their careers.
>
> Use your knowledge of the actual codebase to decide the exact
> mechanics, data model, thresholds, UI, interactions, consequences,
> automation and scope. Do not blindly implement every idea if it
> conflicts with the existing architecture or would make the simulator
> worse.
>
> The overall goal is to make players feel like people the GM has to
> manage, not just numbers the GM moves around, while keeping the
> experience accessible, believable, fun, and deeply integrated with the
> rest of the simulator.
>
> Perform the architecture/overlap analysis first and report any
> important findings or decisions you need from me before creating the
> implementation plan or changing code.

### Status

Both Phase A (data model, personality/morale computation, and full
backend integration) and Phase B (dedicated Personality tab, Action
Center items, News Feed polish, rotation-board indicator) are built and
verified. Architecture-overlap review confirmed this was genuinely
greenfield (`docs/ARCHITECTURE.md` already flagged it as deliberately
deferred), and reused the Fan Happiness system's shape (bounded per-event
deltas, all 30 teams, transaction-log narration) as the closest existing
precedent rather than Ownership Confidence's user-team-only/season-only
shape:

- Schema: `PlayerPersonalityProfile` (competitiveness/roleSensitivity/
  loyalty/financialMotivation, 0-100, generated once and never mutated),
  `LeaguePlayer.morale` (0-100, default 70) / `tradeRequestActive` /
  `tradeRequestSince`, `LeagueTransaction.subjectLeaguePlayerId` (nullable,
  lets player-specific news be queried without text-matching), new
  `PLAYER_MORALE` transaction type.
- `src/lib/morale/generatePersonality.ts` - seeded, deterministic
  generation (same `createSeededRandom` convention as the rest of the
  sim) wired into both real places a `LeaguePlayer` is created (league
  bootstrap in `league.ts`, draft-to-roster conversion in `draft.ts`); a
  purely cosmetic label (`describePersonalityLabel`) derived from the
  axes on read, never stored.
- `src/lib/morale/moraleLevel.ts` / `moraleEvents.ts` - named morale
  levels (mirrors `jobSecurity.ts`'s bucket pattern), a bounded event
  catalog (role change, minutes shortfall, team performance, contract
  situation, coach fit, post-trade fresh start, season-end decay), and
  `applyMoraleChange` - the single hysteresis-aware escalation/clear
  gate every integration point goes through so a standing trade request
  can't flip on and off within one bad week.
- Integrated into every system the request named: `rotation.ts` (role-
  change reaction, same boundary as the existing fan-happiness delta),
  `developPlayerRating.ts`/`retirement.ts` (a third modest, neutral-
  anchored input, same shape as the existing dev-coach/minutes bonuses),
  `offseason.ts` (contract-situation + coach-fit deltas, season-boundary
  decay, retention pass), `reSigningDecision.ts` (a standing trade
  request raises the re-signing bar 2.5x), `trade.ts` + CPU-CPU trades in
  `leagueEvents.ts` (a trade is a fresh start - morale resets toward
  baseline, weighted by new-team fit), and a new `applyPlayerMoraleEvents`
  mid-season pass (minutes-shortfall + team-performance signals, called
  right after `applyLeagueEvents` in `simulateGamesAction`) - all running
  league-wide across all 30 teams, not just the user's.
- CPU reach: disgruntled/demanding-trade players bias `pickTradeTarget`'s
  candidate pool in `src/lib/simulation/leagueEvents.ts` (a real "on the
  market" signal), still gated by the existing mutual `evaluateTradeOffer`
  ACCEPT requirement - no parallel acceptance path.
- Explicit scope boundaries (confirmed with the user before building): no
  effect on box-score/game-simulation output; no per-player morale
  history/snapshot table (the news feed, filtered by
  `subjectLeaguePlayerId`, is the "why" surface); no teammate-relationship
  modeling.
- Backfill: `scripts/backfill-player-personalities.ts` (run once against
  the dev DB - 178,851 existing `LeaguePlayer` rows backfilled), plus a
  defensive lazy-generate fallback in `profileData.ts`'s loader.
- Minimal Phase A verification surface: a "Personality" card + "At a
  glance" morale badge on the player profile's Overview tab (full
  Phase B tab/Action-Center/News-Feed polish still to come).
- Phase A verified: `tsc`/`eslint`/the full `vitest` suite (694 tests, up
  from 644) all pass. Hands-on in a real browser: created a fresh league,
  confirmed each player has a distinct, deterministic personality and a
  default 70 morale; simulated ~50 games and confirmed morale actually
  diverged across the league, a real trade-request escalation fired
  (`tradeRequestActive: true` at morale 14) exactly as the hysteresis
  design intends, and `PLAYER_MORALE` news stories were generated with
  real team/streak-driven narration.

**Phase B** - the polished UI pass:

- `PlayerProfileContent.tsx` gained a dedicated "Personality" tab
  (label/description, the four axes, current morale + level + trade-
  request badge, and that player's own recent morale news via
  `subjectLeaguePlayerId`) - the Overview tab keeps only a compact
  one-line morale badge for zero-click visibility, matching the "don't
  overwhelm casual users, let deep-divers investigate" instruction.
- `actionCenter.ts` gained two new items - `critical` when a player is
  `tradeRequestActive`, `warning` when trending toward it (`DISGRUNTLED`
  but not yet escalated) - mutually exclusive so they never compete for
  the same display slot, same `{severity, label, description, href}`
  shape as every existing item.
- `NewsFeed.tsx` gained a "Morale" category pill and a rose badge color
  for `PLAYER_MORALE`, same extension pattern used for every prior
  transaction type.
- `RotationBoard.tsx` gained a small colored morale dot per player row
  (plus a "Trade Request" tag when active) - visible right where the
  user makes the role decisions that might cause it.
- **A real bug caught during hands-on testing, not a nitpick**: the
  initial mid-season team-performance pass reacted to raw competitiveness
  percentile every single batch, which - since roughly half the league is
  always above/below the 0.5 mark by construction - fired for something
  like half the league's rostered players on _every_ simulated batch,
  producing 150+ near-duplicate "is pleased with the team's strong recent
  play" stories from a single ~50-game test. Root-caused via a real
  browser + News Feed screenshot, not just reasoning about the code.
  Fixed by (1) gating the team-performance reaction on a genuinely
  notable streak (`Math.abs(currentStreak) >= 5`, reusing
  `describeWinStreak`'s own threshold rather than a new constant) instead
  of firing on ambient season-long percentile, and (2) narrating at most
  one story per team per batch (the single most-affected player) instead
  of one story per rostered player, mirroring the "narrate the team
  event, not every individual" shape `describeWinStreak` itself already
  uses. Cut a 159-story test run down to 34 - one per team per real
  streak, not a wall of duplicates.
- Verified: `tsc`/`eslint`/the full `vitest` suite (685 tests) all pass.
  Hands-on in a real browser across three fresh leagues: confirmed the
  Personality tab renders correctly (axes, morale, empty-state "Recent
  concerns" copy before any events exist), the rotation board shows a
  colored dot per player, the Action Center produced no false positives
  on a healthy contending roster, and - after the volume fix - the News
  Feed's Morale filter reads like real, sparse news rather than a spam
  wall.

## Franchise Finances & Business Operations (requested 2026-07-28)

**Original request (verbatim):**

I want to implement a comprehensive Franchise Finances and Business Operations system that expands financial management beyond player contracts, salary cap rules, luxury tax, and payroll.

Before implementing anything, thoroughly inspect the existing architecture and determine how this should integrate with everything already built. Follow our existing architecture-overlap review protocol. In particular, examine the existing salary-cap/payroll systems, ownership expectations, Fan Engagement, team market differences, staff management, franchise popularity, team performance, playoffs, contracts, News, historical systems, and any other mechanics that could naturally connect to franchise finances.

Reuse existing systems and data wherever appropriate rather than creating parallel mechanics. If there are significant overlaps, conflicts, missing foundations, or architectural decisions that need my input, explain them before implementation.

The goal is to make running the business side of an NBA franchise another meaningful part of being a GM, while keeping basketball decisions at the center of the simulator. I do not want this to become a detailed accounting or business-management simulator. Financial mechanics should exist primarily because they create interesting basketball and franchise-management decisions.

I want the franchise to have a believable financial ecosystem where its financial health changes according to what actually happens throughout the simulation. Success, popularity, market characteristics, star players, fan engagement, attendance, playoff runs, championships, spending decisions and other relevant factors should naturally influence the business.

Users should be able to understand where their franchise's money comes from, where meaningful money is being spent, whether the franchise is financially healthy, and how their decisions have affected the organization financially.

Introduce meaningful revenue and expense concepts at whatever level of abstraction best fits the simulator. Avoid unnecessary accounting detail. I care much more about interesting decisions and consequences than accurately modeling every expense an NBA organization has.

Fan Engagement should become particularly meaningful here. Fan happiness, franchise popularity, star power, performance, market characteristics and major franchise events should be capable of affecting financially relevant outcomes where appropriate. Do not duplicate Fan Engagement calculations; consume the existing system wherever possible.

Attendance should feel connected to the state of the franchise rather than being an arbitrary generated number. Determine an appropriate model using information the simulator already tracks. The user should be able to understand why demand is high or low.

Consider whether users should have control over selected business decisions where doing so creates genuine strategic trade-offs. The system should avoid filling the simulator with meaningless sliders. Any business decision exposed to the user should have understandable benefits, costs and consequences.

Consider how ownership should interact with finances. Ownership should care about both basketball performance and the financial consequences of running the franchise. Existing owner expectations and spending mechanics should be reused and expanded where appropriate rather than replaced by another independent ownership system.

I want spending to involve meaningful opportunity costs without destroying the realism of NBA roster construction. A wealthy or successful franchise should not simply accumulate unlimited money that lets it bypass salary-cap rules, and a financially struggling franchise should not arbitrarily become unable to operate. Salary-cap/CBA mechanics must remain authoritative where they apply.

Consider whether financial resources should affect areas outside player payroll where it would create interesting gameplay, and determine which investments are actually worthwhile given the systems currently implemented. Avoid adding upgrade systems purely for the sake of having things to purchase.

The financial consequences of playoff success should matter. Making deep playoff runs, hosting additional games, winning championships and sustaining contention should have appropriate business effects, while rebuilding or prolonged poor performance should create different financial circumstances.

Star players should also have appropriate business significance where the existing architecture supports it. A superstar may provide value beyond their basketball production, while losing an iconic or popular player could have consequences beyond simply lowering team strength. These effects should integrate with existing popularity and Fan Engagement mechanics rather than creating duplicate concepts.

CPU franchises should participate in the same financial ecosystem. Financial constraints and incentives should be capable of influencing CPU behavior where appropriate, but do not cripple CPU decision-making or make financially motivated moves unrealistically common. Market differences, competitive windows, ownership expectations and franchise circumstances should create believable differences between teams.

Make the system meaningful across many simulated seasons. Financial success, franchise growth, periods of rebuilding, dynasties and prolonged struggles should leave understandable long-term effects. Generated players and increasingly fictional future leagues must work exactly the same way as the initial real-player league.

Consider whether a long-term concept such as franchise value or organizational financial health would meaningfully improve the simulator, but only include it if it has legitimate gameplay or historical value rather than being a decorative number.

Create an appropriate user-facing Finances/Business section if the architecture supports one. It should give the user a clear, visually engaging overview of the franchise's financial situation and explain the causes behind important changes. Prioritize useful information, trends, decisions and consequences rather than overwhelming the user with financial tables.

Financial events should integrate with existing News, Fan Engagement, ownership, historical tracking and other relevant systems where appropriate. Significant developments should feel like part of the same living league rather than isolated calculations happening silently in the background.

Most importantly, create feedback loops between basketball and business. Building a successful and exciting team should affect the business; the business condition of the franchise should influence relevant front-office decisions; those decisions should then affect the basketball product. However, basketball success should remain the primary objective rather than turning the game into a profit-maximization simulator.

Keep the system accessible to casual NBA fans. Users should not need accounting knowledge to understand whether their franchise is financially healthy or why. Whenever possible, explain financial consequences in intuitive basketball/front-office language.

Use your knowledge of the actual codebase to determine the exact mechanics, formulas, data model, UI, level of abstraction, user decisions, CPU behavior, consequences and scope. Do not blindly implement concepts if they would be redundant, unrealistic, overly complex, or incompatible with the existing architecture.

The overall goal is to make money feel like a real strategic resource and consequence of running an NBA franchise, rather than finances ending at salary-cap compliance. I want users to feel that they are managing both the basketball organization and the broader health of the franchise, without losing the accessibility and basketball-first identity of the simulator.

Do not implement anything yet. Perform the architecture/overlap analysis first. Tell me what already exists that should be reused, what genuinely needs to be added, any systems this would affect, any risks of unnecessary complexity, and any important design decisions you need from me before creating the implementation plan.

### Status

Architecture/overlap review delivered 2026-07-28. User chose the **full
ecosystem** scope (P&L + owner pressure + investment budget + active
franchise value), **two levers** (investment allocation + ticket-pricing
posture), and **active franchise value**. Plan approved.

**Phase A (built, 2026-07-28)** - the business ledger + consequence layer:

- Schema: `LeagueTeam.cashReserveCents` / `franchiseValueCents` /
  `ticketPricingPosture` / `facilitiesInvestment` / `medicalInvestment`, a
  new `FinancialSnapshot` model (per league+team+season, mirrors
  `FanHappinessSnapshot`), `TicketPricingPosture` / `InvestmentLevel` enums,
  `FINANCIAL_REPORT` / `FRANCHISE_MILESTONE` transaction types. Migration
  `franchise_finances` applied.
- `src/lib/finances/` pure model (revenue/expenses/net income/financial
  health/franchise value + Phase-B lever effect tables) with 19 unit tests;
  a market-scaled starting balance sheet at league bootstrap; a backfill
  script for existing leagues (210 teams seeded).
- League-wide season P&L pass in `advanceSeasonAction`, a shared
  `computeTeamSeasonFinances` closure feeding both the all-30-teams
  persistence and the user-team owner-confidence financial-health nudge
  (`computeConfidenceDelta` extended, backward-compatible).
- News (`FINANCIAL_REPORT` user recap each season, `FRANCHISE_MILESTONE` on
  billion-dollar crossings), a NewsFeed "Finances" filter, a `/finances`
  dashboard (health/value/cash summary, revenue-vs-expense breakdown, drivers
  explainer, franchise-value trend chart), a team-dashboard Finances card,
  and a Finances nav entry.
- Verified: `tsc`/`eslint` clean, 704 tests pass, and a real-data P&L check
  (Boston Celtics dev league) read believably - large markets ~$420M revenue
  vs small ~$275M, superstar media bump visible, 24/30 profitable with
  small-market over-the-tax teams driven into the red (the intended tension).

**Phase B (built, 2026-07-28)** - the two levers + investment sinks:

- Ticket-pricing posture now applies its fan-happiness tradeoff at the season
  boundary (`TICKET_POSTURE_FAN_DELTA`) on top of the gate-revenue multiplier;
  facilities investment feeds `developPlayerRating` and medical investment
  feeds the injury-frequency roll (`INVESTMENT_QUALITY_DELTA`).
- Interactive `/finances` controls (`BusinessStrategyControls` + a
  server-validated `updateBusinessStrategyAction`) replaced the read-only
  strategy panel; CPU teams get a market-based ticket posture
  (`pickCpuTicketPosture`) at bootstrap + backfill.
- Verified: `tsc`/`eslint` clean, **709 tests pass** (5 new: facilities
  development, medical injury-frequency, CPU posture), `/finances` route
  compiles.

**Phase C (built, 2026-07-28)** - depth & polish, completing the feature:

- CPU financial restraint: `financialSpendingResistance(cash)` raises a
  cash-strapped CPU team's re-signing bar (new optional
  `financialThresholdMultiplier` on `evaluateReSigningDecision`). Salary-
  normalized scoring means it only cuts expensive marginal retentions, never
  bargains - it nudges without crippling, closing the money→CPU-behavior loop.
- A profit/loss-by-season chart (`NetIncomeHistoryChart`) on `/finances`.
- **Deliberate scope call:** CPU investment into the development/injury
  systems is held at neutral - big-market CPU teams buying PREMIUM facilities
  would compound a hard-to-balance development edge over many seasons for
  little user-visible payoff. CPU financial participation stays at
  revenue/expenses/value/ticket-posture/spending-restraint.
- Verified: `tsc`/`eslint` clean, **713 tests pass** (4 new: financial
  resistance thresholds, re-signing multiplier tips a marginal call but never
  a bargain).

All three phases of the Franchise Finances & Business Operations system are
now built and verified.

**Phase D (built, 2026-07-28)** - a focused "make money strategically
meaningful at both ends" pass, after an agreed weakness review (money bit when
struggling but went inert when winning). Decisions confirmed: emergent tax
tolerance (not an explicit war chest) and a derived franchise-icon model.

- **Emergent owner tax tolerance + escalating loss pressure**
  (`src/lib/finances/ownershipFinance.ts`): a multi-season `FinancialStanding`
  (from `FinancialSnapshot` net-income history + cash) modulates the existing
  owner-confidence system - a financially strong franchise earns patience on
  down years and ownership _backing to spend into the tax_ (payroll directives
  suppressed while profitable), so accumulated success buys title-chasing
  runway rather than a dead cash pile; sustained losses issue an escalating
  "return to profitability" mandate (`League.financialMandateSeason`) that can
  push the GM toward the firing band. Cap/CBA rules untouched throughout.
- **Franchise icons** (`src/lib/finances/franchiseIcon.ts`): a derived
  icon score from star tier + tenure (`LeaguePlayer.joinedTeamSeason`) +
  homegrown (`LeaguePlayer.homegrown`, set at draft) + career awards. Marquee
  icons lift franchise value (value beyond production); trading away a genuine
  icon deals a scaled franchise-value + fan-happiness hit and an "end of an
  era" news beat. Fields set at draft/trade/FA/bootstrap; existing saves
  backfilled.
- **Mid-season projection** on `/finances` (forward P&L before advancing),
  an **ownership-standing** card + dashboard financial-mandate warning,
  **investment ROI** cost labels on the levers, and a **franchise-icon badge**
  on the player profile.
- Verified: `tsc`/`eslint` clean, **730 tests pass** (17 new), routes compile,
  and a real-data icon spot-check read sensibly (superstars start as
  Cornerstones; legend status is earned via tenure/awards over a save).

---

## Current NBA Rosters, 2K-Style Ratings & Real-Prospect Draft Pipeline (requested 2026-07-31)

### Request (verbatim)

> I want to completely replace the simulator's outdated 2023/24 roster data
> and inaccurate player ratings with the most current NBA rosters and the
> most accurate NBA 2K-style ratings available.
>
> Before implementing anything, inspect the entire current roster/data
> pipeline and identify exactly where players, teams, contracts, ratings,
> positions, ages, draft information, and other roster data are sourced,
> transformed, seeded, cached, and persisted. Follow our normal
> architecture-overlap review process and explain any major migration or
> compatibility concerns before changing code.
>
> The final result should include current NBA players on their correct
> teams, with current positions, basic biographical information, contract
> information where the simulator uses it, and accurate overall ratings that
> closely match the latest NBA 2K ratings. I do not want the existing
> formula-generated ratings to remain the primary source for initial player
> quality if they produce unrealistic results.
>
> Use the most reliable and legally usable data sources available. You may
> use official sources, public APIs, reputable datasets, licensed data, or a
> carefully maintained import file. Do not rely on fragile scraping that
> violates a site's terms, and do not fabricate ratings when a reliable value
> can be obtained. If exact official 2K ratings cannot be legally or reliably
> imported, build the closest defensible alternative and clearly explain the
> limitation before implementation.
>
> Create a clean, repeatable data-import or synchronization process rather
> than manually editing hundreds of players throughout the codebase. The
> system should normalize names, team assignments, positions, ratings,
> contracts, and identifiers, handle duplicate or mismatched names, and
> produce a validation report for missing or suspicious records.
>
> Preserve the simulator's long-term progression model. These imported
> ratings should establish the starting state of a newly created league, but
> after the league begins, player development, decline, injuries,
> performance, trades, free agency, and other simulation mechanics should
> continue changing players naturally. Do not repeatedly overwrite simulated
> ratings with external real-world data.
>
> Determine how existing saves should be handled. Do not silently replace
> players or ratings inside active long-running leagues if doing so would
> corrupt their history. Prefer applying the updated dataset to newly created
> leagues, with an explicit migration or reset option only if it can be done
> safely.
>
> Update all dependent systems that rely on roster data, including team
> strength, rotations, trade valuation, player profiles, contracts, free
> agency, draft assets, statistics, player photos, news, and any other
> affected feature. Make sure every NBA team has a valid and realistic roster
> and that no team is left with missing, duplicated, retired, or incorrectly
> assigned players.
>
> Add thorough validation and tests. Confirm roster sizes, team assignments,
> player uniqueness, rating ranges, required fields, contract consistency, and
> successful league creation from the new dataset. Produce a concise audit
> showing which data source was used, how many players were imported, which
> records required manual resolution, and any remaining limitations.
>
> I care more about having accurate, current and maintainable roster data than
> preserving the old 2023/24 implementation. You have freedom to redesign the
> ingestion pipeline if necessary, but do not begin implementation until you
> have inspected the architecture, identified the best trustworthy data source
> and approach, and presented your recommended migration plan to me. I also
> want future draft classes to use real-world prospects for as long as reliable
> prospect data is available, rather than immediately switching to entirely
> fictional generated players.
>
> Build a maintainable prospect pipeline that can include eligible college
> players, international prospects, G League players, and highly regarded
> high-school prospects. Use trustworthy, legally usable sources and respect
> draft eligibility and realistic timing. A high-school player should not enter
> the draft immediately unless the simulator has advanced to a season where
> that player would plausibly be eligible.
>
> Organize real prospects into future draft classes based on expected or
> plausible draft years, while recognizing that real players may reclassify,
> remain in college, withdraw, or change their expected draft year. Design the
> data so these assignments can be updated without rewriting the draft system.
>
> Prospect ratings and potential should be grounded in available scouting
> information, production, age, competition level, projected draft range,
> physical profile, and reputable consensus rather than arbitrary random
> generation. However, do not present uncertain prospects as perfectly known.
> Where appropriate, store scouting estimates, ranges, or confidence rather
> than pretending there is an objectively exact rating for high-school and
> college players.
>
> Avoid hardcoding only one or two future classes. Create a repeatable
> update/import process so the prospect database can be refreshed as new
> college, international, and high-school prospects emerge.
>
> Eventually the simulator will advance beyond the years for which real
> prospects are known. At that point, transition smoothly into generated
> fictional prospects. Make these generated classes as believable as possible
> by grounding them in realistic names, ages, nationalities, schools,
> development pathways, positions, physical profiles, production, strengths,
> weaknesses, draft projections, and class-strength variation. Clearly
> distinguish imported real prospects from generated future prospects
> internally, but present both naturally within the same scouting and Draft
> experience.
>
> Do not duplicate real prospects across classes or allow a player to exist
> simultaneously as both a prospect and an NBA player. Validate identities,
> expected draft years, eligibility, duplicate names, and transitions into the
> league.
>
> Treat real-world data as the starting state for new saves only. Once a
> league begins, its draft classes and players should become part of that
> save's independent timeline and should not be silently overwritten by later
> real-world updates.
>
> Before implementation, explain what reliable data can realistically be
> obtained for current NBA rosters, 2K-style ratings, college prospects,
> international prospects, and high-school prospects; what would require
> estimation; how many future draft classes can be populated credibly; and how
> the system will transition into fictional prospects afterward.

### Status

**Planning (2026-07-31)** - architecture-overlap inspection complete; data-
source reality assessment + phased migration plan presented and **approved**.
Implementation not yet started (Phase 0 next).

**Confirmed decisions (2026-07-31):**

- **Rating strategy:** hybrid consensus. Recalibrated stat-based model as the
  foundation + a _minimal_ dev-maintained override layer for cases where the
  model clearly disagrees with broad NBA consensus. Not a copy of NBA 2K/any
  proprietary board (none are legally redistributable) - our own editorial
  ratings, legally suitable for a public portfolio project, refreshable each
  season.
- **Baseline season:** most current rosters obtainable.
- **Data access: strictly free.** No paid API. Verified free + legal sources:
  balldontlie **free tier** for current rosters/bios, and **hoopR-nba-data**
  (MIT-licensed, redistributable, 2002-present) for current player box scores.
  Honest limitation: the free path gives traditional box scores + TS%, not
  BPM/VORP-grade advanced metrics (paid balldontlie advanced tier was
  declined), so the override layer carries more of the consensus accuracy.
  Phase 0 checks whether a free _advanced_-stat release also exists.
- **Existing saves:** new-leagues-only by default **plus** a guarded, opt-in
  "reset this league to the new dataset" action.
- **Phasing:** roster + ratings first (Phase 1); real-prospect draft pipeline
  is a separate later phase (Phase 2).

**Architectural refinements required by the user (2026-07-31) - must be
honored in the build:**

1. **Provider-adapter architecture.** Import pipeline is built around a
   _canonical internal player schema_ with per-provider adapters
   (balldontlie, hoopR, future/replacement providers) - not tightly coupled
   to any one provider. New providers plug in with minimal change.
2. **Hard boundary between imported real-world ratings and a league's evolving
   simulated ratings.** Real-world data establishes the _initial state of a
   newly created league only_; after creation, all gameplay runs on the
   league's own simulated progression and real-world data is never re-read /
   re-synced onto an in-progress save.
3. **Keep the override layer as small as genuinely necessary.**
4. **Validation includes gameplay readiness**, not just data shape: rotations,
   team composition, salary-cap integrity, trade initialization, etc. - "can a
   league actually be created and played from this dataset."
5. **Version every imported NBA dataset with metadata**: roster date, data
   sources, ratings-model version, included transactions.

**Build progress:**

_Phase 0 (done, 2026-07-31)_ - foundation: canonical player/stat schema +
`DatasetManifest` (`src/lib/data-sources/canonical.ts`, `seed*` naming encodes
the seed/sim boundary) and provider-adapter contracts
(`src/lib/data-sources/providers/adapter.ts`).

_Phase 1a (done, 2026-07-31)_ - free source pinned + adapter proven:
hoopR-nba-data (MIT) `rosters` (bios/current team/photos) + `player_box`
(stats). `parquet.ts` reader (hyparquet, dynamic-import for tsx+vitest);
`providers/hoopR.ts` adapter (regular-season aggregation, TS%, exact
`athlete_id` joins). Confirmed the free bulk data has NO advanced metrics (box
scores + TS% only). Live-proven on the completed 2025-26 season (537 bios, 505
stat lines). Fixed a real bug: ESPN's `active` flag is unreliable (reads false
for ~half a star's played games) - use `minutes > 0` instead.

_Phase 1b (done, 2026-07-31)_ - realistic ratings + merge, all validated on
real 2025-26 data:

- `seedRating.ts` - a dedicated seed-rating model (separate from the in-sim
  valuation composite, preserving the seed/sim boundary). Recalibrated to fix
  the old model's failures on real data: volume-aware (per-game, not per-36) +
  minutes/sample regression kills the low-minute-efficient-big inflation
  (Jericho Sims 99->72), and a compressed top end makes 99 rare. Result: a
  believable leaguewide curve (~14 players 90+, most role players in the 70s).
- `ratingOverrides.json` + `.ts` - the minimal consensus layer (15 curated
  marquee targets, our editorial ratings, keyed by normalized name).
- `buildDataset.ts` - the canonical merge (exact-id join + prior-season
  fallback so injured-all-season stars still get a real rating: Haliburton 90
  and Lillard 88 pulled from their 2024-25 lines) + versioned manifest + an
  audit report (fallback counts, unmatched overrides, duplicate names).
- Verified: 763 tests pass (31 new), tsc + eslint clean. Top tier reads true:
  SGA 98, Jokic 98, Giannis 96, Luka 95, Wembanyama 95.

_Phase 1c - part 1 (done, 2026-07-31)_ - the real dataset artifact:

- `teamCrosswalk.ts` - maps the 6 ESPN team abbreviations that differ from ours
  (GS->GSW, NO->NOP, NY->NYK, SA->SAS, UTAH->UTA, WSH->WAS); validated + tested.
- `scripts/import-hoopr-dataset.ts` (npm `import:dataset`) - the repeatable
  offline importer: fetch -> canonical merge -> team mapping -> writes
  `prisma/data/nbaDataset.json` (versioned manifest + players) with a full audit.
- Generated + validated the real file: 537 players, **30/30 teams covered,
  none short, 0 unmapped teams, 0 duplicates**. Written non-destructively (old
  `players.json` + its fixtures untouched) pending the seed cutover.

_Phase 1c - part 2 (done, 2026-07-31)_ - DB cutover, current rosters now live:

- Schema: `Player.seedOverallRating/seedPotentialRating` (+ migration
  `add_player_seed_ratings`) - the seed/sim boundary in the data model.
- `seed.ts` cut over to `nbaDataset.json` (writes seed columns, additive
  upsert, never deletes). Seeded the dev DB: 537 players, 0 skipped.
- `age.ts`: `ageFromBirthDate` + `estimateExperienceFromAge` (the dataset
  carries real birth dates, so age/contract-scaling are now accurate).
- Bootstrap (`createLeagueAction`) rewired: baseline season 2023 -> 2025;
  selects the current dataset (`seedOverallRating != null`) with each player's
  most-recent real line; starting rating = stored seed rating; and a new
  **top-15-per-team roster trim** (surplus -> free agents) replaces the old
  rating cutoff. Job-market page selects/ranks off the same seed ratings.
- Verified against the seeded DB: 30 teams, **450 rostered (exactly 15/team),
  87 free agents, no short teams**; Denver reads true (Jokic 98, Murray 90,
  role players in the 70s). 767 tests pass, tsc + eslint clean.

_Phase 1d (in progress, 2026-07-31):_

- **Coarse positions fixed:** ESPN G/F/C now infers PG/SG/SF/PF/C by height
  (`inferPosition` in hoopR.ts). All 5 positions represented (PG139/SG117/
  SF129/PF74/C78) instead of PG/SF/C-only.
- **Gameplay-readiness validator:** shared `rosterConstruction.selectTopPerTeam`
  (the bootstrap now uses it too, so validation reflects what's built) +
  `validateDataset.ts` - checks rating ranges, potential>=overall, required
  fields, unique ids, team coverage, and per-team roster balance (a legal
  backcourt/frontcourt after the trim). Wired into the import audit (`PASS`)
  and unit-tested. 776 tests pass.
- **Fixed a re-seed bug (found in hands-on): "each team has 30+ players."**
  Re-seeding stacked the 497 legacy-dataset Players on top of the 537 new ones
  in the global `Player` table (~35/team), so any global team view was a mix of
  both datasets. `seed.ts` now retires superseded players (clears their
  `currentTeamId`; rows kept for older saves' FK), so global rosters show the
  current ~18-man roster and in-league rosters stay a clean 15.

_Phase 1d (done, 2026-07-31):_ dependent-system spot-check passed on a real
current-roster league - photos 522/537 (97%), player profiles show current
team/pos/rating/stats, and a new league has 87 FAs, 360 draft picks, 450
contracts, top player SGA 98. The **opt-in per-league reset was skipped by the
user's decision** (creating a new league already gives current rosters, and a
reset inherently discards a save's progress). Legacy import scripts/data
(`import-players.ts`, `import-season-stats.ts`, `players.json`) are left in
place as historical/non-breaking.

**Phase 1 (current NBA rosters + 2K-style ratings) is COMPLETE and verified
end-to-end.** ARCHITECTURE.md's Data-sourcing section updated. Remaining for
this feature: **Phase 2 - the real-prospect draft pipeline** (college /
international / G-League / HS prospects, future draft classes, transition to
generated fictional prospects), still a separate later phase per the agreed
phasing.

---

## Finances as a First-Class Gameplay Pillar (requested 2026-08-02)

### Request (verbatim)

> I want to redesign the financial side of the simulator into a first-class
> gameplay pillar, on the same level of importance as drafting, trading, free
> agency, and roster management. Very high interactivity for the user
>
> Do not simply add more numbers, reports, or hidden calculations. I want the
> user to make meaningful, high-impact business decisions that have immediate
> and long-term consequences throughout the season.
>
> Every major financial system should create interesting trade-offs rather than
> obvious optimal choices. The player should regularly face decisions that
> affect fan happiness, revenue, franchise value, owner confidence, roster
> flexibility, player morale, and long-term competitiveness.
>
> Think like you're designing the greatest sports management game ever made.
> Borrow inspiration from Football Manager, Out of the Park Baseball, F1
> Manager, Civilization, and tycoon games, while keeping everything grounded in
> running an NBA franchise.
>
> I want finances to feel alive. The user should constantly receive business
> opportunities, ownership directives, sponsorship offers, arena decisions,
> investment opportunities, crises, negotiations, expansion projects, and
> long-term strategic choices instead of only seeing season-end financial
> reports.
>
> Every system should interact naturally with the existing mechanics (fans,
> franchise value, ownership, salary cap, drafting, player development,
> superstar icons, ticket pricing, investments, media, and GM reputation).
> Nothing should feel isolated.
>
> Prioritize immersion, player agency, replayability, and difficult strategic
> decisions over complexity for its own sake.
>
> Before writing code, first produce a complete design proposal explaining every
> new mechanic, why it improves gameplay, how often the player interacts with
> it, how it integrates with the existing simulator, and why it makes the
> financial side as engaging as building the roster. Only after I approve the
> design should implementation begin.

### Status

**Design proposal delivered 2026-08-02** — see `docs/FINANCES_PILLAR_DESIGN.md`
for the full architecture-overlap review, the eight systems, cadence table,
integration map, risks, and phasing.

**Decisions confirmed 2026-08-05** (full text in the design doc, Part 5):

1. Build **all seven core systems, phased** across sessions.
2. **Relocation exists but as an extremely rare late-game last resort** —
   gated behind prolonged financial distress, repeated failed arena
   negotiations, an expiring lease, and sustained ownership pressure. The
   finance system is designed around franchises staying in their markets;
   relocation is never an optimization tool.
3. **Business expansion (System 8) joins this pillar now**; **NBA league
   expansion stays a separate flagship feature for later** (applications, city
   selection, ownership approval, expansion fees, branding, expansion draft,
   schedule regeneration). Stay forward-compatible, avoid coupling.
4. **CPU selective depth** — franchise-defining events genuinely simulate,
   routine business stays abstracted.

**Phase 1 (the spine) built and verified, 2026-08-05:**

- Schema: `BusinessDecision` (headline/body/options-as-JSON/deadline/status)
  and `BusinessLedgerEntry` (itemized in-season income/expense, category
  `EVENT_INCOME`/`EVENT_EXPENSE`), a `BUSINESS_DECISION` transaction type,
  and `FinancialSnapshot.otherIncomeCents`/`otherExpenseCents`. Migration
  `finances_pillar_phase1_spine` applied.
- `src/lib/finances/businessDecisions.ts` - the System 7 "Business Events"
  card catalog (8 cards: SPONSOR_PULLOUT, ARENA_SYSTEMS_FAILURE,
  TICKETING_SCANDAL [BREAKING], LEAGUE_REVENUE_DOWNTURN,
  INTERNATIONAL_PRESEASON_GAME, DOCUMENTARY_CREW, JERSEY_REDESIGN,
  MERCHANDISE_PUSH), each gated on real state (fan happiness, ticket
  posture, star power) with 2 options where no option is free or strictly
  dominant. 9 unit tests, including a dominance-check property test across
  the whole catalog.
- `applyBusinessDecisionEvents` in `src/lib/actions/leagueEvents.ts` - rolls
  a new decision into the user's inbox during regular-season simulation
  (~6-10/season target) and auto-expires anything past its deadline to its
  own deliberately-suboptimal default option. CPU teams never roll business
  decisions (Tier 2 abstraction, per the confirmed CPU-depth decision).
- Sim-loop interruption: `simulateGamesAction` now halts (same "must
  resolve before continuing" shape as the existing All-Star-weekend gate)
  when a BREAKING decision lands, and refuses to simulate further while one
  sits PENDING. `SimulateControls`/`ScheduleExperience` surface this with an
  inbox link, mirroring the weekend-pending banner.
- `resolveBusinessDecisionAction` - applies the chosen option's cash/fan-
  happiness/owner-confidence effects, writes a `BusinessLedgerEntry` and
  `BUSINESS_DECISION` news entry, marks the decision resolved.
- `computeSeasonRevenue`/`computeSeasonExpenses` gained optional
  `otherIncomeCents`/`otherExpenseCents` inputs; `advanceSeasonAction` sums
  the season's `BusinessLedgerEntry` rows per team and folds them into the
  P&L exactly like every other bucket - a resolved decision now shows up in
  the season report, not just the moment it's resolved.
- UI: a "Front Office Inbox" section on `/finances` (`BusinessDecisionInbox`
  - `resolveBusinessDecisionAction`), and an Action Center item
    surfacing pending-decision count/urgency, critical when BREAKING.
- No backfill script needed - new tables start empty, existing leagues get
  decisions automatically once they next simulate.
- Verified: `tsc`/`eslint` clean, **787 tests pass** (13 new), `next build`
  compiles all routes including `/finances`.

**Phase 2 (Sponsorship & Commercial Deals) built and verified, 2026-08-06:**

- Schema: `SponsorshipDeal` (kind, label, `annualValueCents`, `startSeason`/
  `endSeason`, an optional `conditionLeaguePlayerId` "star clause", an
  optional `franchiseValueUpsideFraction` for the "equity swap" variant,
  status ACTIVE/EXPIRED/VOIDED), 4 new `BusinessDecisionKind` values
  (`SPONSORSHIP_BET_ON_YOURSELF`, `SPONSORSHIP_STAR_CLAUSE`,
  `SPONSORSHIP_UNPOPULAR_MONEY`, `SPONSORSHIP_EQUITY_SWAP`), and
  `FinancialSnapshot.sponsorshipRevenueCents` (its own bucket, distinct
  from Phase 1's `otherIncomeCents`). Migration
  `finances_pillar_phase2_sponsorship` applied.
- `src/lib/finances/businessDecisions.ts` - extended: `BusinessDecisionOption`
  can now carry a `sponsorshipDeal` payload (term/value/condition-player,
  resolved at generation time from the roster - never re-derived later);
  context gained `starPlayer` (replacing the old boolean `hasStarPlayer`,
  now carrying the actual player id/name for the star-clause card) and
  `isEarlySeasonWindow` (the 4 sponsorship cards only appear in the first
  30 days of a season - a "preseason" proxy, since this simulator has no
  separate preseason phase). Every card offers "decline" as its
  `defaultOptionId`, so ignoring a real offer has the same understood cost
  Phase 1 already established. 10 new tests (16 total in the file),
  including one confirming the generic "no dominant option" property test
  correctly exempts deal-bearing options (their trade-off is committed
  recurring revenue vs. flexibility, not reducible to 3 instant numbers).
- `src/lib/finances/sponsorship.ts` (new) - `computeCpuSponsorshipRevenueCents`
  (a market/star-tier formula baseline for the 29 CPU teams, deliberately
  below what a user can negotiate, since CPU never shops for the best
  offer - Tier 2 abstraction) and `computeSponsorshipVoidPenaltyCents` (a
  bounded buyout cost when a star-clause deal voids). 6 unit tests.
- `resolveBusinessDecisionAction` creates the `SponsorshipDeal` row when
  the chosen option carries one; `advanceSeasonAction` sums each team's
  ACTIVE deals (real for the user, formula for CPU) into
  `computeSeasonRevenue`'s new `sponsorshipCents` bucket every season the
  deal is active for, folds `franchiseValueUpsideFraction` into
  `computeFranchiseValue` alongside the existing icon premium, and
  transitions deals to EXPIRED once their term ends.
- `executeTradeAction` (`src/lib/actions/trade.ts`) voids any active
  star-clause deal whose condition player is being traded away, charges
  the buyout penalty to cash, and writes a news beat - the trade itself is
  never blocked, matching the "cap/CBA rules stay authoritative, money is
  pressure not a bypass" philosophy. `TradeBuilder` shows a non-blocking
  amber warning when a selected player holds an active clause.
- UI: an "Active Sponsorships" section on `/finances` listing every active
  deal (label, term, condition player if any, annual value), a
  "Sponsorships" P&L row, and the mid-season projection now includes real
  signed-deal revenue.
- Verified: `tsc`/`eslint` clean, **800 tests pass** (13 new), `next build`
  compiles all routes including `/finances` and `/trades/new`.

**Phase 3 (Ownership as a Character) built and verified, 2026-08-06:**

- Schema: `OwnerArchetype` enum (WIN_NOW_BILLIONAIRE, PENNY_PINCHER,
  PATIENT_BUILDER, ABSENTEE, MEDDLER), `League.ownerArchetype` +
  `ownerArchetypeSince` (tenure), `payrollDirectiveStaked`/
  `financialMandateStaked` flags, and 2 new `BusinessDecisionKind` values
  (`OWNERSHIP_PAYROLL_NEGOTIATION`, `OWNERSHIP_FINANCIAL_NEGOTIATION`).
  Migration `finances_pillar_phase3_ownership` applied.
- `src/lib/gm/ownerArchetype.ts` (new, pure) - a confidence-delta
  multiplier, an expectation-level shift, a directive-threshold adjustment,
  and a mandate-issuance override per archetype, plus the ownership-change
  roll/confidence-blend/news-text helpers. Deliberately does NOT model
  "capital access" from the design brief - no financing system exists yet
  for an archetype to modulate there. 14 unit tests.
- `businessDecisions.ts` gained 2 hand-built negotiation card builders
  (`buildPayrollDirectiveNegotiation`/`buildFinancialMandateNegotiation`) -
  NOT part of the randomly-rolled catalog; `advanceSeasonAction` calls them
  directly, exactly when it's about to issue a directive/mandate. Turns a
  one-way announcement into a real choice: accept the standard terms, or
  push back and stake a bigger swing (both ways) on delivering more. 6 new
  tests.
- `advanceSeasonAction` wiring: the archetype multiplier/shift/threshold
  apply at the existing confidence-delta, expectation-level, and directive/
  mandate-issuance touchpoints (no parallel system - the same code paths,
  archetype-modulated); the existing directive/mandate resolution points
  branch on the staked flags for an amplified reward/penalty; a rare
  (~4%/season, 3-season minimum tenure) ownership-change roll re-rolls the
  archetype, blends confidence toward neutral (not a hard reset), and
  writes a big OWNERSHIP_MESSAGE news beat.
- `resolveBusinessDecisionAction` sets the staked flag when the user
  chooses "push back," reusing the exact same resolution pipeline Phase
  1/2 already built.
- New leagues roll a real archetype at bootstrap (`createLeagueAction`);
  `scripts/backfill-owner-archetype.ts` gave all 8 existing leagues a
  deterministic-random archetype ("this is who your owner has been all
  along," not a disruptive new event) - already run against the dev DB.
- UI: an "Your Owner" card on `/finances` (archetype, description, tenure);
  negotiation cards render through the existing Front Office Inbox with no
  new UI component.
- Verified: `tsc`/`eslint` clean, **818 tests pass** (20 new), `next build`
  compiles all routes.

**Phase 4 (Department Budget & Season Tickets) built and verified, 2026-08-06:**

- Decisions confirmed before build: all 6 departments get real, distinct
  mechanical identities (not generic percentage boosts); Scouting's natural
  mechanic (fuzzing prospect ratings) conflicted with an existing, explicit
  design principle in `scoutingProfile.ts` ("no mechanic hides a real number
  from the user") - resolved by keeping OVR/POT always exact and instead
  gating the _reliability of qualitative reads_ (bust risk, trajectory, work
  ethic, readiness, injury outlook, ceiling range) on Scouting investment.
  Richer information, not hidden information.
- Schema: `DepartmentLevel` enum (5 levels, MINIMAL-MAXIMUM) replaces the old
  3-level `InvestmentLevel`; `LeagueTeam` gained 6 department-level columns
  (`scoutingLevel`, `playerDevelopmentLevel`, `sportsScienceLevel`,
  `analyticsLevel`, `marketingLevel`, `coachingSupportLevel`) and
  `seasonTicketBase`; `facilitiesInvestment`/`medicalInvestment` **dropped**
  (210 non-null rows) - a genuine subsume, not a parallel system left
  running alongside the new one. Migration `finances_pillar_phase4_departments`
  hand-written and applied via `migrate deploy` (the interactive
  confirmation `migrate dev` needs for a destructive column drop isn't
  available non-interactively). No backfill script needed - Postgres's own
  `ADD COLUMN ... DEFAULT` already back-filled all 210 existing rows to the
  correct neutral values, verified directly against the dev DB.
- `src/lib/finances/departments.ts` (new) - the shared zero-sum plumbing:
  every league's 6 levels must sum to `DEPARTMENT_BUDGET_TOTAL` (12 - six
  departments at STANDARD), an asymmetric cost/quality-delta scale per
  level, and a real reallocation constraint enforced both client-side (the
  new UI) and server-side (`updateDepartmentBudgetAction` re-validates,
  never trusts the client's own bookkeeping). 11 unit tests.
- `src/lib/fans/seasonTickets.ts` (new) - System 5, "Season Tickets": a
  sticky 0-100 base that grows _slowly_ (winning/happiness/fair pricing)
  and erodes _quickly_ (premium pricing/losing) - the asymmetry is the
  whole mechanic. Forms a floor under the existing `computeAttendancePct`,
  never replaces it; deliberately inert at the neutral starting base (65)
  so it only protects a team that's genuinely earned it. 10 unit tests.
  In-season pricing moments (playoff pricing, promotional nights) explicitly
  cut from this phase's scope - the core sticky-floor mechanic is built;
  event-driven pricing moments are deferred.
- **Player Development** (was facilities) and **Sports Science** (was
  medical) migrated directly, keeping their existing hooks
  (`developPlayerRating.ts`, `simulation/leagueEvents.ts`'s injury roll)
  but widened to the new 5-level scale's bigger specialization payoff.
- **Scouting** (new) - `generateScoutingReport` in `scoutingProfile.ts`:
  6 qualitative reads computed from real signals (rating/potential gap,
  age, position) where they exist, seeded-but-fixed "true" values where no
  real signal exists (work ethic, injury outlook) - then fuzzed by a
  reliability curve keyed to department level, from 15% reliable (MINIMAL)
  to 100% (MAXIMUM). Threaded through `/leagues/[id]/draft` ->
  `DraftExperience` -> `ProspectProfileModal` -> `ProspectProfile`'s new
  "Scouting Report" section. 8 new tests.
- **Analytics** (new) - `TradeBuilder.tsx` reveals `evaluateTradeOffer`'s
  precise fair-value percentage (previously computed but never shown) at
  HIGH/MAXIMUM instead of just the ACCEPT/COUNTER/REJECT bucket - real
  information, not better luck.
- **Marketing** (new) - boosts `computeFranchisePopularity` growth directly,
  and multiplies sponsorship-card dollar values in `businessDecisions.ts`
  (`computeMarketingSponsorshipMultiplier`) - applied only to the 4
  sponsorship cards, never the crisis/opportunity ones. 1 new dominance-
  aware test.
- **Coaching Support** (new) - `effectiveStaffQuality` in
  `coachModifiers.ts` amplifies whichever coach a team has already hired
  (Head Coach win bonus + box-score modifier in `simulation.ts`, Player
  Development Coach quality in `offseason.ts`) rather than being a
  standalone number - a team with no coach hired has nothing to amplify.
  5 new tests.
- UI: `DepartmentBudgetControls` (new) - a stepper-based zero-sum allocator
  with a running "points remaining" indicator and per-department identity
  blurbs, replacing the old Facilities/Medical dropdowns on `/finances`;
  `BusinessStrategyControls` slimmed to ticket pricing only; a new
  Season-Ticket-Base card.
- Verified: `tsc`/`eslint` clean across the whole codebase despite touching
  ~20 files, **854 tests pass** (37 new), `next build` compiles all 30
  routes including `/finances`, `/leagues/[id]/draft`, and `/trades/new`.

**Phase 5 (Arena, Financing & Business Expansion) built and verified, 2026-08-06:**

- Decisions confirmed before build: city arena negotiations and the
  relocation decision use a lightweight multi-round negotiation (2-4
  rounds, real choices, a visibly-tracked running "city willingness"
  score) rather than a single probability roll or a full negotiation
  minigame; Arena and Business Expansion share one `CapitalProject` model
  (same "pay now, benefit later, multi-season" mechanic, different flavor).
- Schema: `Negotiation` model (a generic, reusable round-based engine -
  `kind` ARENA_FUNDING/RELOCATION_DECISION, `round`/`totalRounds`,
  `cityWillingness`, an `outcome` JSON accumulator) delivered entirely
  through the existing BusinessDecision/Front Office Inbox pipeline via a
  new `negotiationId` FK and `NEGOTIATION_ROUND` kind - no new UI needed
  for the negotiation itself. `CapitalProject` model (6 kinds: 2 arena, 4
  expansion). `LeagueTeam` gained arena state (quality/age/lease/failed-
  negotiation count), `debtCents`, and relocation fields
  (`marketSizeOverride`/`relocatedCityName`/`relocatedAtSeason`).
  `FinancialSnapshot.interestExpenseCents`. Migration
  `finances_pillar_phase5_arena_financing` applied (purely additive - no
  destructive drops this time).
- `src/lib/finances/arena.ts` (new) - arena quality/aging/attendance-bonus
  math; `isRelocationEligible` (ALL of: 3 consecutive losing seasons + cash
  negative, 2+ failed negotiations, an expired/expiring lease, owner
  confidence at the CRITICAL floor - checked once per season boundary,
  never user-triggered); `computeStartingCityWillingness` (financial
  standing/market size/owner archetype/negotiation history set where a
  negotiation starts, the user's own round choices move it from there);
  the full ARENA_FUNDING (3 rounds) and RELOCATION_DECISION (3 rounds)
  content catalogs, each option a real choice with a visible cost -
  aggressive asks/holds risk the deal, private commitment or community
  support cost cash but build trust, a "threaten relocation" leverage play
  is a real gamble, and "walk away"/"refuse" are genuine early exits.
  27 unit tests, including a per-round "never a pure no-op" property test.
- `src/lib/finances/capitalProjects.ts` (new) - cost/duration/effects
  tables for all 6 kinds; `sumCompletedProjectEffects` aggregates a team's
  finished projects into the flat bonuses their consuming systems read.
  10 unit tests.
- `src/lib/finances/financing.ts` (new) - System 3: fixed-tier loans
  (interest-only, no forced amortization - a documented simplification, a
  single revolving balance with voluntary repayment), owner capital calls
  ("the cleanest trade-off in the design" - free cash, priced entirely in
  confidence), distressed financing (eligible only when cash is deeply
  negative, priced through an immediate reputational hit rather than a
  separate worse rate). `computeFinancialStanding` (ownershipFinance.ts)
  gained an optional debt-leverage input - heavy debt caps how good a
  standing can read even with healthy income/cash. 22 new tests combined.
- `resolveBusinessDecisionAction` now dispatches: negotiation-round
  decisions advance the Negotiation (next round's card, or finalize) in
  addition to their instant deltas; finalization applies the real
  consequences - a discounted `CapitalProject` on ARENA_FUNDING success, a
  `failedArenaNegotiations` mark on failure, or an actual relocation
  (market override, a severe permanent fan-happiness hit sized by the
  user's own round-3 choice, a franchise-value jump, a fresh lease) on
  RELOCATION_DECISION success.
- `advanceSeasonAction`: capital projects complete and apply their
  permanent effects (arena quality bump, lease extension, department-
  adjacent bonuses, recurring income) the season they finish; arenas age
  when nothing completes; debt interest is a real expense bucket; every
  market-size read resolves through `marketSizeOverride ?? team.
marketSize`; the relocation eligibility check runs once per boundary.
  `leagueEvents.ts` wired the two in-season secondary effects (Practice
  Facility's Sports Science bonus into the injury roll, International
  Academy's bonus into the Marketing sponsorship multiplier) so no
  computed project effect field goes unused.
- New actions: `startArenaRenovationAction`, `startArenaNewBuildNegotiationAction`,
  `startBusinessExpansionProjectAction` (each of the 4 expansion kinds is a
  one-time, non-stacking unlock - re-building a completed kind is blocked),
  `takeOutLoanAction`, `repayDebtAction`, `requestOwnerCapitalAction`,
  `takeDistressedFinancingAction`.
- UI: `ArenaCard` (quality/age/years-left-on-lease, in-progress status,
  Renovate/Negotiate buttons), `BusinessExpansionCard` (a 4-project grid,
  "Built" badges), `FinancingCard` (debt/interest, loan/repay/capital-call/
  distressed-financing controls) on `/finances`; a relocation banner if a
  save has ever relocated.
- Verified: `tsc`/`eslint` clean, **904 tests pass** (50 new), `next build`
  compiles all 30 routes.

**Next: Phase 6 - CPU Selective Depth, Balance & Docs** (Tier-1 CPU event
simulation for franchise-defining moments, a 20-season CPU-only balance
harness, small-market viability tuning), not yet started. This closes out
the originally-scoped Finances as a Gameplay Pillar feature.

---

## Business Decision catalog expansion (requested 2026-08-06)

**Verbatim request:** "Ok I would look into the business decision cards
thing, since I want the simulator to feel alive, i think more variety shd be
considered" - following a question about how many cards existed (12) and
whether that was enough (assessed as thin for multi-season replayability).

Confirmed scope via follow-up questions: team-performance-driven variety
(win/loss streaks, playoff contention, blowout results) as the single axis
for this pass; ~12-15 new cards. Full design in
`docs/FINANCES_PILLAR_DESIGN.md` Part 7.

### Status

**Built (2026-08-06).** All 13 cards from Part 7 are live in the CATALOG:
`HOT_STREAK_MEDIA_FEATURE`, `MOMENTUM_MERCHANDISE_SURGE`,
`BANDWAGON_SPONSOR_INTEREST` (win streak >= 4); `SEASON_TICKET_HOLDER_BACKLASH`,
`BOOSTER_CLUB_PATIENCE_TEST`, `LOCAL_MEDIA_CRITICISM_CYCLE` (loss streak <= -4);
`PLAYOFF_PUSH_TICKET_DEMAND`, `NATIONAL_TV_SLOT_REQUEST`,
`PLAYOFF_WATCH_PARTY_PROPOSAL` (top 6 of conference); `TANK_WATCH_FAN_FRUSTRATION`,
`REBUILD_PATIENCE_APPEAL` (outside the play-in field); `SIGNATURE_WIN_HIGHLIGHT_DEAL`
(margin >= 25), `EMBARRASSING_LOSS_DAMAGE_CONTROL` (margin <= -25). Catalog is
now 25 cards, up from 12.

- Schema: 13 new `BusinessDecisionKind` enum values, purely additive
  migration (`expand_business_decision_catalog`), no dropped columns.
- `BusinessDecisionContext` gained 4 read-only fields: `currentStreak`
  (passed straight through from the pre-existing `LeagueTeam.currentStreak`
  - no new tracking), `isPlayoffContender`/`isLotteryBound` (derived each
    roll from a cheap same-conference win% rank, reusing the top-6/top-10 line
    `seedConference` already uses - not a full seeding computation),
    `lastGameMargin` (point differential of the most recently completed game,
    `null` before any game this trigger).
- `leagueEvents.ts`'s roll site extended with 2 more parallel queries: the
  league's conference standings (id/wins/losses/conference only) and the
  user's most recent completed game (for margin).
- Caught and fixed one design-discipline violation before shipping: the
  property test (adapted from Part 2's "no option ever free, no option
  strictly dominant" checker) caught that `PLAYOFF_WATCH_PARTY_PROPOSAL`'s
  "pass" option was a true free lunch (0/0/0) - fixed by giving both options
  a real fan-happiness/owner-confidence trade-off instead of one being a
  no-op.
- Verified: `tsc`/`eslint` clean, **917 tests pass** (13 new), `next build`
  compiles all 34 routes.

No existing-save backfill needed - pure catalog content plus new read-only
context fields at generation time, nothing persisted to existing rows.

---

## Phase 6 - CPU Selective Depth, Balance & Docs (requested 2026-08-06)

**Verbatim request:** "ok phase 6" - the last originally-scoped phase of the
Finances as a First-Class Gameplay Pillar feature, confirmed via follow-up
scoping question to be the biggest option: full Tier-1 CPU simulation
(real capital projects, financing, and relocation for CPU teams, plus a
per-team owner archetype), not just a tuning pass.

Full design in `docs/FINANCES_PILLAR_DESIGN.md` Part 8.

### Status

Design proposed. Audit found the "routine business" half of the original
Tier 2 abstraction is already built (CPU teams already get full season-end
finances, franchise value, and arena aging) - what's actually missing is
the decision-driven layer (capital projects, financing, relocation, and a
per-CPU-team owner archetype don't exist for CPU teams at all). Scoped as a
lighter, formula-driven CPU policy that produces the same class of outcomes
without replicating the user's interactive confidence/mandate apparatus for
30 teams. Includes an owner-archetype schema migration (League-scoped ->
LeagueTeam-scoped, with existing-save backfill), a new 20-season balance
harness script, and the deferred 4-doc-set update.

**Steps 1-3 built (2026-08-06):**

- **Owner archetype migration** - `ownerArchetype`/`ownerArchetypeSince`
  moved from `League` to `LeagueTeam` (hand-written migration
  `20260805201936_owner_archetype_per_team`, preserving each league's
  existing value on the user's own team before dropping the source
  columns). All 6 call sites updated. `scripts/backfill-owner-archetype.ts`
  rewritten to roll a fresh archetype for every CPU team still at the
  migration-default sentinel - run against the dev database, backfilled
  232 CPU teams. League bootstrap (`league.ts`) now rolls a seeded
  archetype for every team, not just the user's.
- **CPU capital-project + financing policy** (`src/lib/finances/
cpuPolicy.ts`, new, pure functions) - `shouldCpuRenovateArena` (low
  arena quality + healthy cash + a probability roll scaled by owner
  archetype) and `shouldCpuTakeLoan` (deeply negative cash + a roll,
  same archetype-scaled shape). Wired into `advanceSeasonAction` right
  after the season-end finance pass persists, so decisions use each
  team's actual post-season cash. No CPU `ARENA_NEW_BUILD` or business-
  expansion projects (both require either the Negotiation engine or
  represent a human's strategic choice, not a league story - Part 8.2).
- **CPU relocation** - `isCpuRelocationEligible` reuses `isRelocationEligible`'s
  gate shape, substituting arena quality at the aging floor for "failed
  negotiations" (CPU never negotiates) and a longer sustained-losing-seasons
  requirement for "owner confidence at breaking point" (CPU has no
  confidence number) - the bar stays at least as hard to clear as the
  user's, never easier. Resolved as a single weighted outcome (no
  round-by-round negotiation), picking from the same `RELOCATION_DESTINATIONS`
  and applying the identical fan-happiness hit / franchise-value multiplier
  / lease reset the user's own relocation applies. Posts a `FRANCHISE_MILESTONE`
  news story exactly like the user's version.
- Verified: `tsc`/`eslint` clean, **937 tests pass** (30 new), `next build`
  compiles all 34 routes.

**Steps 4-5 built (2026-08-06):** `scripts/balance-harness.ts` - a
standalone, database-free script driving the same pure finance/cpuPolicy
functions the real game uses across 15 synthetic teams (5 per market size)
plus a deliberately reckless worst-case stress team, over N synthetic
seasons (default 20). Not a vitest file - matches the existing
`scripts/backfill-*.ts` convention (run by hand, prints a report).
`advanceSeasonAction` itself is auth-gated (NextAuth `auth()`) and its
~2000 lines of orchestration (real playoffs, awards, retirements) weren't
worth replicating just to validate the finance model's long-run shape, so
the harness drives `computeSeasonRevenue`/`computeSeasonExpenses`/
`computeFranchiseValue`/`cpuPolicy.ts` directly against a plausible
synthetic win%/payroll distribution.

**Real bug caught and fixed by the harness:** the first run showed 0/16
teams ever relocation-eligible even after 20 seasons of a deliberately
reckless, deeply-bankrupt stress team (-$1058M cash). Root cause: the CPU
relocation gate's arena-quality threshold was set to
`ARENA_MIN_QUALITY_FROM_DECAY` (20) - the aging floor - but arena decay is
only -1/season from a neutral start of 65, so reaching 20 requires ~45
seasons of complete neglect, unreachable in any realistic save length. The
original code comment ("already a strong, rare signal") was itself the bug

- confusing "eventually reachable" with "actually reachable." Fixed by
  raising `CPU_RELOCATION_STUCK_ARENA_QUALITY` to 48 (reachable in ~15-20
  seasons, overlapping the same multi-season window the sustained-losses gate
  already requires) in `src/lib/finances/cpuPolicy.ts`. Re-verified with a
  40-season run: only the reckless stress team ever relocated; every
  sensibly-run team (including an unlucky-but-normal small-market team that
  came close) stayed well clear - the "near-unreachable last resort" design
  goal holds.

Other harness findings: small markets are solidly viable long-run (no
sensibly-run team ever went negative), ~39% of team-seasons cross the
luxury-tax line under a realistic payroll spread (real tax pressure exists),
and CPU renovation/loan policy fires at a believable, non-runaway rate.

Verified: `tsc`/`eslint` clean, **937 tests pass**, `next build` compiles
all 34 routes.

**Next: Step 6 - update the 4 doc sets**, not yet started.

---

## Fans Page Ground-Up Redesign (requested 2026-08-06)

**Verbatim request:**

> I want to redesign the Fans page from the ground up. The current page looks clean, but it feels too passive—users mostly open it to read numbers and then leave. I do not want to artificially add buttons or repetitive management mechanics just to increase interaction. Instead, I want this page to become the place where players understand the emotional and public consequences of every major decision they make throughout the simulator.
>
> Redesign the page with the following goals:
>
> 1. Explain, don't just report.
>    Instead of only showing metrics like Fan Happiness, Popularity, Attendance and Merchandise, clearly communicate why those numbers are what they are. Break down the biggest positive and negative contributors to fan sentiment (winning streaks, rebuilding success, trading a franchise icon, raising ticket prices, missing expectations, signing a superstar, etc.) and explain how each decision affected the fanbase.
>
> 2. Make the page useful for future decisions.
>    The page should help players make smarter choices elsewhere in the simulator. Rather than only showing the current state, it should help answer questions like:
>
> - What do the fans expect from me this season?
> - What kind of franchise do the fans currently want me to build?
> - How are expectations changing?
> - What are the likely fan consequences of my next major move?
>   I want the page to become a decision-support tool rather than just a historical report.
>
> 3. Show trends and direction, not just snapshots.
>    Every major metric should communicate whether it is improving or declining and why. I want users to immediately understand where fan sentiment is heading instead of only seeing static values.
>
> 4. Give the fanbase personality.
>    Different franchises should feel different. A rebuilding fanbase should react differently from a championship-or-bust fanbase. Large-market and small-market franchises should develop different expectations over time based on success, history and recent decisions. I want the fanbase to feel like a living entity rather than a number from 0–100.
>
> 5. Improve immersion.
>    Replace generic status updates with richer, more believable fan reactions. Consider things like:
>
> - realistic fan discussions
> - media narratives
> - public opinion shifts
> - memorable reactions after blockbuster trades, championships, collapses or rebuilding decisions
>   The page should feel like reading the pulse of an NBA fanbase, not just looking at statistics.
>
> 6. Preview consequences.
>    One feature I think could be valuable is allowing players to understand the projected fan reaction before making major decisions elsewhere in the simulator (for example trading a franchise icon, raising ticket prices or entering a rebuild). If you believe this belongs somewhere else in the simulator instead of the Fans page, explain why.
>
> 7. Challenge the current information architecture.
>    Do not assume the current layout is correct. If metrics belong somewhere else, move them. If entire sections should be redesigned or replaced, recommend that. If the page should have different sections, cards or visual hierarchy, redesign it completely.
>
> 8. Review for feature overlap and responsibility.
>    Before recommending any new feature, evaluate whether it overlaps with an existing system elsewhere in the simulator (Finances, News, Home Dashboard, Front Office Inbox, Player Profiles, League pages, etc.). I want each page in the simulator to have a clear identity and purpose. If a proposed feature would be better suited to another page, recommend placing it there instead. Avoid duplicate information, redundant mechanics, or two different pages trying to solve the same problem. The Fans page should complement the rest of the simulator rather than compete with it. If moving existing features out of the Fans page would create a cleaner overall product, recommend that as well.
>
> Important constraints
>
> - Do not add meaningless busywork.
> - Do not add repetitive click-heavy mechanics.
> - Do not turn this into another Finance page.
> - Every recommendation should either:
>   - make the world feel more alive,
>   - help players understand why things happened,
>   - or help players make better decisions elsewhere.
>
> I want this to feel like a premium AAA sports management simulator. Be ruthless—if the current Fans page is fundamentally flawed, don't preserve it. Redesign it into the best version it can possibly be.

### Status

Design approved with two refinements the user requested before Phase 1:
(1) a one-sentence page purpose with explicit responsibility boundaries vs.
Home/Finances/News/Inbox, and (2) a genuine Fan Culture system (Patience/
Expectation Ceiling/Loyalty - three slow-moving traits derived from real
franchise history) so different franchises develop distinct fan identities
over decades, not just a happiness number. See
`docs/FANS_PAGE_REDESIGN.md` Part 3.0 and 3.1a.

**Phase 1 built (2026-08-06) - the sentiment ledger.** The core finding that
drove this phase: `src/lib/fans/sentimentEvents.ts` already computed a
precise fan-happiness delta for every major event (trades weighted by real
fairness score, injuries by severity, lottery results by seed movement,
etc.) - it was applied to `LeagueTeam.fanHappiness` and then discarded.
Nothing persisted _why_ the number was what it was.

- New `FanSentimentEvent` model (leagueId/leagueTeamId/season/dayIndex/kind/
  delta/description/leaguePlayerId) - a permanent, never-rewritten log,
  same relationship to `fanHappiness` that `BusinessLedgerEntry` has to cash.
- `src/lib/fans/sentimentLedger.ts` - pure functions grouping the ledger into
  3 themes (On the Court / Front Office / The Business), ranking the
  biggest positive/negative contributors, and reconstructing an **in-season**
  trend line by walking backward from the current happiness value (the
  once-a-season `FanHappinessSnapshot` could never show an in-season
  collapse or hot streak - this can).
- `src/lib/fans/describeSentiment.ts` - fixes the sharpest complaint in the
  request: the old reaction feed said "Fans are buzzing" for _every_ trade
  regardless of outcome, even though the delta that says whether it was
  good or bad already existed. Every description now reads the real delta
  ("fans think you robbed them" vs. "fans are furious about it").
- `src/lib/fans/recordSentiment.ts` - one shared write path (plain,
  transaction-array, and interactive-`tx` forms) so all ~14 existing call
  sites write through the same helper instead of hand-rolling inserts.
- Wired into all 14 existing fan-happiness call sites across 9 action
  files: trades (user and CPU), signings (user and CPU), win/loss streaks,
  injuries/recoveries, staff hire/fire, rotation changes, business
  decisions (including relocation - the single largest fan event in the
  game), distressed financing, awards, All-Star selections/snubs/results,
  and draft lottery results.
- Fans page gained an in-season trend chart and a new "Why They Feel This
  Way" section (theme breakdown + top contributors) - both pure renders
  over the ledger, no new logic in the page itself.
- `scripts/backfill-fan-sentiment-ledger.ts` - seeds the _current_ season
  only from real `LeagueTransaction` history (no fabricated historical
  precision, same principle as the existing finance backfill), run against
  the dev database: 6 of 8 existing leagues seeded.
- Verified: `tsc`/`eslint` clean, **955 tests pass** (18 new), `next build`
  compiles all 34 routes.

**Phase 2 built (2026-08-06) - The Mood + delta-aware reactions.**

- `src/lib/fans/moodLabel.ts` - a plain-language mood (Euphoric, Bought In,
  Content, Restless, Patient, Turning On You, Hostile) computed from
  happiness level **and** direction together, never level alone - the
  design point in Part 3.1: 55-and-climbing and 55-and-falling are
  different rooms, and a static number can't say that. Direction blends a
  recent in-season trend (summed from the sentiment ledger over a real day
  window via the new `recentTrendDelta` helper) with the season-over-season
  change from `FanHappinessSnapshot` history.
- `MoodSection` replaces the old 2-card + 3-card stat block entirely.
  Attendance, Merchandise, and Season Tickets cards are **deleted** - all
  three were the same `franchisePopularity` tier relabeled three ways (the
  code's own comment said so), and Season Tickets/Attendance already have a
  real home on `/finances`. What's left: one honest Fan Happiness headline
  with its mood label and both trend arrows, Franchise Popularity as the
  one genuinely distinct secondary metric, and attendance demoted to a
  single evidence line ("the building is 78% full") rather than a metric
  this page owns.
- `ReactionFeedSection` replaces the old `fanReactions.ts` lookup table
  entirely (file deleted, along with its test - fully unreferenced once the
  page stopped calling it). The old table said "Fans are buzzing" for every
  trade regardless of outcome; the new feed renders the real, delta-aware
  descriptions already written into the sentiment ledger by Phase 1's
  `describeSentiment.ts` ("fans think you robbed them" vs. "fans are
  furious about it"). Ordered by recency across season boundaries (a trade
  from just before a season flip doesn't vanish from "recent reactions"),
  a deliberately different cut of the same ledger `SentimentLedgerSection`
  ranks by magnitude - one source of truth, two lenses.
- `scripts/backfill-fan-sentiment-ledger.ts` updated to drop its dependency
  on the now-deleted `fanReactions.ts`, inlining the same small fixed-tone
  classification directly.
- Verified: `tsc`/`eslint` clean, **957 tests pass** (22 new, 6 removed with
  `fanReactions.test.ts`), `next build` compiles all 34 routes.

**Phase 3 built (2026-08-06) - Fan Culture.** The fanbase's decades-long
identity - three slow-moving 0-100 traits (Patience, Expectation Ceiling,
Loyalty), one row per `LeagueTeam`, recomputed wholesale (never
incrementally nudged) from a bounded 15-season lookback at every season
boundary.

- `src/lib/fans/fanCulture.ts` - the pure derivation. Patience rewards a
  rebuild that visibly paid off and punishes one that dragged on or
  resolved into nothing (a real bug caught by the test suite here: a
  rebuild that never ends was originally scored _more leniently_ than one
  that resolved and failed - fixed before it shipped). Expectation Ceiling
  rises with championships/deep runs/current star power and falls only
  slowly with irrelevance. Loyalty rewards keeping real icons and
  fan-friendly pricing, punishes icon departures and relocation (a severe,
  permanent hit). `explainFanCulture` generates the real facts behind each
  number for the page, reading the same inputs the numeric derivation used.
- **Genuinely wired into the simulation, not cosmetic** - the design's
  explicit requirement. `applyScaledFanHappinessDelta` (in
  `sentimentEvents.ts`) is the one chokepoint every sentiment call site now
  routes through: Patience dampens negative-delta magnitude, Loyalty
  dampens magnitude in both directions and sets the floor happiness can
  decay to. All 14 of Phase 1's call sites (trades, signings, streaks,
  injuries, staff, rotation, awards, All-Star, lottery, business decisions,
  financing - user and CPU paths) were re-touched so every scaled delta is
  what's both applied to `fanHappiness` **and** written to the sentiment
  ledger, so a ledger row always explains the real number. One deliberate
  exception, documented in place: relocation's fan-happiness hit is NOT
  culture-scaled, since relocation is itself an input to next season's
  Loyalty - softening it by the trait it's meant to damage would be
  circular.
- `src/lib/actions/fanCulture.ts` - `recomputeFanCultures` (the
  season-boundary write) and `buildFanCultureHistoryInputs` (shared with
  the Fans page, so its "real facts" explanation reads the identical
  history the numbers came from).
- `FanCultureSection` on the Fans page - "Who This City Has Become," each
  trait with a tier label and the real facts behind it.
- `scripts/backfill-fan-culture.ts` - runs the season-boundary derivation
  once against each existing save's real history rather than starting
  every team at a meaningless neutral 50/50/50. Run against the dev
  database: 240 teams backfilled across 9 leagues.
- Verified: `tsc`/`eslint` clean, **981 tests pass** (24 new), `next build`
  compiles all 34 routes.

**Phase 4 built (2026-08-06) - What the City Wants.** What the _fanbase_
expects, deliberately separate from `ExpectationLevel` (ownership's
payroll-driven bar) - the tension between the two is real, emergent
gameplay: an owner wanting payroll cut while fans refuse to accept trading
their icon.

- `src/lib/fans/fanMandate.ts` - 5 mutually-exclusive trajectory mandates
  (`CHAMPIONSHIP_OR_BUST`, `WIN_NOW`, `SHOW_ME_PROGRESS`,
  `BE_PATIENT_WITH_THE_KIDS`, `GIVE_US_A_REASON_TO_CARE`), checked in
  priority order, plus a separate `keepOurGuy` boolean overlay - confirmed
  with the user that a genuine franchise icon is its own standing
  expectation that coexists with any trajectory (a championship-or-bust
  fanbase can simultaneously refuse to accept trading its icon), not a 6th
  competing option. The core mechanic proven by test: the _identical_ young/
  rebuilding roster resolves to `BE_PATIENT_WITH_THE_KIDS` in a patient city
  and `SHOW_ME_PROGRESS` in one whose patience is spent - Fan Culture
  actually gates the outcome, not just roster state. `computeMandateSatisfaction`
  scores how well current behavior serves the active mandate;
  `explainFanMandate` generates the real facts behind it, same "no second
  opinion" principle as Phase 3's `explainFanCulture`.
- `src/lib/actions/fanMandate.ts` - `recomputeFanMandates`, called right
  after `recomputeFanCultures` at the season boundary (the mandate depends
  on that same pass's Patience/Expectation Ceiling) and reusing its
  returned history inputs rather than re-querying `PlayoffSeries` a second
  time. `recomputeFanCultures` itself was extended to return its computed
  traits + inputs for exactly this reuse.
- `FanMandateSection` on the Fans page - the primary mandate with its
  satisfaction bar and real facts, with `KEEP_OUR_GUY` rendered as a
  visually distinct callout beneath it (never merged into the primary
  card), naming the actual player.
- `scripts/backfill-fan-mandate.ts` - reuses each team's already-backfilled
  Phase 3 `FanCulture` rather than recomputing it, deriving only the
  mandate-specific inputs (roster strength/age, recent lottery picks) fresh.
  Run against the dev database: 240 teams backfilled across 9 leagues.
- Verified: `tsc`/`eslint` clean, **992 tests pass** (11 new), `next build`
  compiles all 34 routes.

**Phase 5 built (2026-08-06) - Narratives + Franchise Memory. This closes
out the full 5-phase Fans Page Redesign.**

- **Media narratives** - confirmed with the user as two deliberately
  different lifecycles rather than one:
  - **Event-driven** (`ICON_DEPARTURE_FALLOUT`, the design's flagship
    example, scope deliberately kept to just this one kind per the user's
    explicit call to build it exceptionally rather than spread thin) opens
    immediately in `trade.ts`, inside the same interactive transaction the
    trade itself commits in - a narrative surviving a rolled-back trade
    would be actively misleading. Tracks genuine recovery via a new
    `openedFanHappiness` field (added mid-build after catching that the
    first version of the recovery check always evaluated to the same
    constant regardless of actual current happiness - a real bug fixed
    before it shipped) and closes with a resolution beat once happiness
    recovers or a max duration elapses.
  - **Trajectory** (`REBUILD_PROGRESS_WATCH`, `CHAMPIONSHIP_WINDOW_WATCH`)
    open/close only at the season boundary, since both depend on
    `FanMandate`, which itself only updates once a season. `recomputeFanMandates`
    was extended to return its computed mandate per team so
    `progressFanNarratives` (called right after, in `offseason.ts`) doesn't
    re-derive it.
  - Volume capped at 3 concurrently open narratives per team, per the
    design's "a handful, not a wall."
- **Franchise Memory** - genuinely "nearly free" as the design predicted:
  `src/lib/fans/franchiseMemory.ts` is a pure curated read over existing
  `LeagueTransaction` history (BREAKING/MAJOR importance, filtered to a
  curated type allowlist so a routine big signing doesn't sit next to a
  championship) plus the relocation fields already on `LeagueTeam` -
  **no new model, no new derivation, no backfill needed** (it's computed
  live on every page load).
- `NarrativesSection`/`FranchiseMemorySection` added to the Fans page.
- `scripts/backfill-fan-narratives.ts` - initializes trajectory narratives
  only (reads each team's already-backfilled Phase 4 mandate) for existing
  saves; deliberately does NOT retroactively fabricate icon-departure
  fallout narratives for trades that already happened in the past, since
  that would invent a timeline that never played out in real time. Run
  against the dev database: 240 teams checked.
- Verified: `tsc`/`eslint` clean, **1011 tests pass** (19 new), `next build`
  compiles all 34 routes.

**Fans Page Redesign complete.** All 5 phases from `docs/FANS_PAGE_REDESIGN.md`
are now live: the sentiment ledger (why fans feel what they feel), the Mood

- delta-aware reactions (Section 1 rebuilt, 3 fake metrics deleted), Fan
  Culture (a genuine decades-long identity wired into real sentiment
  mechanics), Fan Mandate (what the city wants, distinct from ownership's
  bar), and now narratives + Franchise Memory (the page finally reads like a
  living fanbase, not a stat sheet). Per-decision fan-impact previews (Part 4
  of the design doc - the Trade Builder/ticket-pricing chips) remain
  explicitly out of scope for this feature, since the design concluded they
  belong at their own decision sites, not on the Fans page itself.

## New-Player Onboarding Philosophy (requested 2026-08-06)

### Request (verbatim)

> One of my biggest concerns is the new-player experience. Right now, when
> someone starts a new franchise, they're essentially thrown into the
> simulator with little guidance. I want this to feel like a polished AAA
> management game—not a complex spreadsheet or software application.
>
> I want you to design a complete onboarding philosophy for the simulator.
>
> Before proposing solutions, first determine what the actual problems
> are. Audit the current simulator as if you were a first-time player with
> little or no NBA front office knowledge.
>
> Specifically identify:
>
> Where a new player would likely become confused.
> Which mechanics are introduced too early.
> Which mechanics are never properly explained.
> Which pages lack context or clear purpose.
> Where the simulator assumes too much prior NBA knowledge.
> Which concepts should be learned naturally through gameplay instead of
> explicit tutorials.
>
> Then design a complete onboarding experience.
>
> Consider:
>
> First-launch experience.
> Franchise creation.
> Interactive walkthroughs.
> Context-sensitive guidance.
> Tooltips.
> "How does this work?" buttons.
> A searchable Help / Knowledge Base.
> A GM Advisor who explains mechanics and offers strategic guidance
> throughout a save.
> Progressive introduction of advanced systems (salary cap, finances,
> scouting, morale, ownership, etc.).
> Ways to remind returning players of important mechanics without becoming
> repetitive.
> How experienced players can skip or disable onboarding entirely.
>
> However, I do not want tutorials for the sake of tutorials.
>
> Whenever possible, prefer teaching through excellent UI, progressive
> disclosure, advisor recommendations, contextual explanations, previews,
> and natural gameplay rather than long walls of text or forced pop-ups.
>
> Treat this like you're designing the onboarding experience for a AAA
> management game such as Football Manager, not a software manual.
>
> Finally:
>
> Present the overall onboarding philosophy.
> Walk through the player's journey from launching the simulator for the
> first time to completing their first season.
> Identify every place where the current simulator should be changed to
> support that journey.
> Be mindful of overlap with existing systems. Avoid duplicating
> information or creating unnecessary complexity—every new onboarding
> feature should have a clear purpose and integrate naturally with the
> rest of the simulator.

### Status

Design only - nothing built yet. Full audit + philosophy + journey +
change list + overlap review written to `docs/ONBOARDING_DESIGN.md`.

Key audit finding: the teaching layer already exists but was built for
exactly one system (finances) and never generalized - `"How does this
work?"` appears only 6 times across 4 files, all pointing at the single
`/guide/finances` article, and there is no `/guide` index. A grep for
`tooltip|onboard|tutorial|walkthrough` across `src/components` and
`src/lib` returns zero UI primitives. So the fix is mostly extending a
proven pattern, not inventing a system.

Also confirmed and preserved: the 2026-07-25 onboarding pass explicitly
rejected a tutorial wizard as the primary fix, and anticipated that a
first-time user's welcome moment should ride the existing Action Center
mechanism. This design does not overturn that - the proposed first-session
guidance is new rules inside `actionCenter.ts`, not a parallel system.

Sharpest concrete gap found: `simulateGamesAction` is reachable only from
Standings and Schedule, and `computeActionCenterItems` has no first-session
rule - so a brand-new GM's dashboard never tells them how to actually play
games.

Follow-up (same day): before building, pushed on discoverability - how do
the Action Center, GM Advisor, contextual explanations, and Guide work
together for a player who doesn't know what to ask? Auditing all 15 Action
Center rules against a proposed "Why is this recommended?" idea surfaced a
real, pre-existing bug: 3 items (`player-demanding-trade`,
`player-trending-unhappy`, `job-security-critical`) linked back to the
page the player was already on, because `ActionCenterItem` had no field to
carry an explanation, so items with no good destination faked one. Design
revised to a three-layer teaching ladder (Action Center label -> reasoning/
consequence -> Guide article) and the GM Advisor was **cut entirely** - its
job is absorbed into per-item reasoning, so a separate panel would just
restate what the card already says. `docs/ONBOARDING_DESIGN.md` Part 4B
has the full writeup. User confirmed this direction.

### Status

**Phase 1 built.** `/guide` index page (new), `/guide/roster` and
`/guide/season-flow` (new articles covering rotation/morale/staff and
playoffs/lottery/offseason - systems the Action Center already cites but
that previously had zero guide coverage), `/guide/finances` refactored
onto a shared `GuideLayout`/`GuideSection` shell with all content and
anchors preserved exactly. New `HowDoesThisWork` component +
`GUIDE_TOPICS` registry (`src/lib/guide/registry.ts`) - every "How does
this work?" trigger in the app (7 call sites) now resolves through one
typed topic id instead of a hand-typed href, so a renamed anchor is a
build error, not a silent dead link.

**Phase 2 built** (the heart of the redesign, Part 4B.2). Extended
`ActionCenterItem` with optional `reasoning`/`consequence` fields; all 15
rules in `computeActionCenterItems` now carry both. New collapsed-by-
default "Why is this recommended?" disclosure in `ActionCenter.tsx` (now
a client component) - the item label still navigates, the disclosure only
ever reveals text, nothing fires unasked. This incidentally fixed the 3
dead-end items found in the audit: `player-demanding-trade` now links to
the Trade Builder (`/trades/new`), `player-trending-unhappy` now links to
the new `/guide/roster#morale` article instead of a non-existent
"personality tab." Added a first-session rule (`first-games-not-
simulated`) that fires exactly once per league - regular season underway,
zero games played yet - derived from a query the Action Center already
ran, no new state. Added a quiet-state "Did you know?" pointer
(`src/lib/gm/didYouKnow.ts`) shown only when zero items fire, rotating
daily per league from a curated pool of 6 tips, deterministic with no new
query or DB write.

Typecheck, lint (2 pre-existing unrelated warnings, unchanged), and the
full unit test suite (119 files, 1019 tests, up from 1011 - 8 new tests
covering the first-session rule and the two fixed hrefs) all pass.

Phases 3-4 (jargon inline definitions, 0-100 baselines, progressive
disclosure of advanced systems) not yet started.

## Scouting Pillar Redesign (requested 2026-08-06)

### Request (verbatim)

> I want to fundamentally redesign the Scouting pillar of the simulator.
>
> My vision is for the pre-draft offseason to become one of the most
> engaging parts of an entire franchise save.
>
> Right now, I don't think scouting creates enough gameplay. I want
> scouting to become one of the primary things the player actively does
> between the end of the season and Draft Night.
>
> I don't simply want better scouting reports.
>
> I want a scouting experience that players genuinely look forward to every
> offseason.
>
> The fantasy I want to create
>
> I want players to feel like they're running one of the NBA's scouting
> departments.
>
> I want them to experience moments like:
>
> "I think we've found a hidden gem."
> "Everyone else has this player ranked too low."
> "Do we trust our scouts or the consensus?"
> "We've spent months scouting this prospect—we're betting our future on him."
> "We ignored this player all year... was that a mistake?"
> "The draft board keeps changing as we learn more."
>
> I want Draft Night to feel like the culmination of months of preparation
> rather than simply opening a list of prospects.
>
> Core Design Goals
>
> Scouting should become one of the simulator's major gameplay pillars.
>
> It should:
>
> Make the pre-draft offseason highly interactive.
> Reward preparation.
> Reward long-term planning.
> Create uncertainty.
> Create excitement.
> Create memorable stories.
> Make every draft class feel different.
> Feel satisfying over multiple decades of franchise play.
>
> Most importantly
>
> I do not want scouting to become tedious.
>
> Avoid mechanics that create repetitive clicking or busywork.
>
> Every interaction should involve an interesting strategic decision.
>
> If a mechanic doesn't create meaningful choices, don't add it.
>
> Challenge everything
>
> Don't assume the current scouting philosophy is correct.
>
> Review the existing implementation and ask yourself:
>
> What is missing?
> What makes scouting fun in the best management games?
> What emotions should scouting create?
> What decisions should players make throughout the offseason?
> What information should remain uncertain?
> What makes discovering talent exciting?
> How should scouting naturally build toward Draft Night?
>
> If necessary, redesign the entire scouting philosophy from first
> principles.
>
> Integration
>
> Review the entire simulator before making recommendations.
>
> Any redesign should naturally integrate with:
>
> Draft
> Departments
> Player Development
> Analytics
> Finances
> News
> Action Center
> Guide
> Player Profiles
> League History
> Future prospect generation
> Overall simulator philosophy
>
> Avoid duplicated systems or feature overlap.
>
> Deliverables
>
> Before writing any code:
>
> Critique the current scouting system.
> Define the ideal philosophy for scouting.
> Design the complete offseason scouting experience from the day the season
> ends until Draft Night.
> Explain what the player should be doing each week of the offseason.
> Rank recommendations by impact vs implementation effort.
> Split the redesign into implementation phases.
>
> Finally, answer this question:
>
> If someone played a 25-year franchise, would the scouting process become
> one of the parts of the save they looked forward to every single
> offseason?
>
> If the answer is no, keep redesigning until it becomes yes.

### Status

Design only - nothing built. Full critique, philosophy, week-by-week
experience, impact/effort ranking, phasing, and the 25-year answer written
to `docs/SCOUTING_PILLAR_DESIGN.md`.

Key audit finding that reframed the whole request: **there is no pre-draft
offseason to put scouting into.** `generateDraftClass` has exactly one
non-test caller - `runDraftLotteryAction` (`draftLottery.ts:112`) - which
generates the class, runs the lottery, and starts the draft in a single
action. `LeaguePhase` has no offseason value at all; the moment a champion
is crowned the league is already in `draft-incomplete`. So the requested
"pre-draft offseason" is a period of time that does not currently exist in
the simulation. This is a missing-calendar-phase problem, not a
scouting-report problem.

Two further findings: scouting effort cannot be concentrated (department
level applies uniformly to all 60 prospects, so "we've spent months on this
guy" is unexpressible), and there is no consensus to disagree with
(`computeProjectedDraftRange` ranks by _true_ overallRating - it's the
answer key, not a public board, so "everyone has him ranked too low" is
impossible).

Design keeps the two genuinely good existing decisions - ratings are never
hidden or falsified (uncertainty lives only in the qualitative read), and
deterministic seeding - and re-keys `generateScoutingReport` off a new
per-prospect Scouting Depth instead of the flat department level, rather
than building a second uncertainty engine. Department budget becomes
assignment _capacity_.

Answer to the 25-year question: yes, but Phase 4 (class character variance)
is what makes it unconditional - it's the cheapest item in the document and
the only real defense against a dominant strategy calcifying by year eight.
Recommendation is to treat Phase 4 as core scope, not polish.

### Refinements (2026-08-06, before Phase 1)

User confirmed the direction and asked for three refinements before coding,
all incorporated into `docs/SCOUTING_PILLAR_DESIGN.md`:

1. Post-draft resolution must not reveal a prospect's true potential or
   pronounce steal/bust - only what the player knew (Depth reached, Big
   Board vs. own ranking, which risks were resolved vs. left unresolved).
   True potential emerges over seasons through existing player development,
   same as any other player.
2. Big Board errors must come from a believable public-evaluation model
   (age, physical profile, competition level, visibility, production,
   tournament performance) rather than arbitrary planted noise - so a
   mis-ranking is explainable ("he's 22 and played in Lithuania") rather
   than random.
3. Three delegation levels (Manual / Recommend / Delegate window with a
   chosen strategy), all reading the same underlying assignment system -
   delegation must be competent, not a strawman to make manual play look
   good.

Also verified (not assumed) the existing-save/phase-transition question by
reading the actual code: two consumers are exhaustive
`Record<LeaguePhase, ...>` maps and correctly fail to compile until handled;
both draft-facing pages already collapse every post-playoff phase into one
`"active"` gate, so they need no change; a save already sitting in
`draft-incomplete` stays there under the new phase ordering (the lottery
having already run is exactly what keeps it out of `pre-draft`) - no
backfill, no half-state.

### Status

**Phase 1 built** - the structural prerequisite. `pre-draft` added to
`LeaguePhase` (`src/lib/league/leaguePhase.ts`), sitting between
`playoffs-incomplete` and `draft-incomplete`; `deriveLeaguePhase` takes a
new `draftStarted` argument (the lottery-ran signal, previously conflated
with `draftComplete`). New `src/lib/actions/draftClass.ts`
(`ensureDraftClassGenerated`) extracts class generation out of
`runDraftLotteryAction` into its own idempotent, self-healing action (same
convention as `ensureStaffGenerated`) - given its own dedicated RNG seed
(`{leagueId}-{season}-draft-class`), deliberately decoupled from the
lottery's own seed, since the two draws used to share one stream in a
specific order. `runDraftLotteryAction` now calls it as a fallback rather
than generating inline. Wired into the Draft page so the class exists the
moment a league reaches `pre-draft`, even before anyone visits the lottery.

Found and fixed a real, silent bug surfaced by this work while auditing
`actionCenter.ts`: `pendingDraftLottery` was gated on
`phase === "draft-incomplete" && startedDraftPicks === 0`, a combination
`deriveLeaguePhase` can no longer produce (draft-incomplete now implies the
lottery already ran) - simplified to `phase === "pre-draft"`, which is now
that phase's exact definition.

The two exhaustive `Record<LeaguePhase, ...>` consumers
(`PHASE_LABEL` in `/leagues`, `PRIMARY_BY_PHASE` in `subNavSections.ts`)
were updated with real content, not placeholders - Draft/Offseason/Staff
promoted to primary nav during the window. Found and fixed a third,
non-exhaustive-but-real gap the type checker caught:
`OffseasonControls.tsx` had its own hand-duplicated local `Phase` type
(missing `pre-draft` entirely, which would have silently rendered nothing
for that phase) - replaced with the shared `LeaguePhase` import and given
its own explanatory message.

Verified the Draft page's existing "lottery not run yet" card
(`gatePhase === "active" && draftPicks.length === 0`) already handles
`pre-draft` correctly with zero changes - it was already written generally
enough to cover this state, need only confirmed by reading, not built.

No schema changes. Typecheck, lint (2 pre-existing unrelated warnings,
unchanged), and the full unit test suite (119 files, 1022 tests, up from 1019) all pass.

Phases 2-5 (Scouting Depth + assignments, the Big Board, delegation,
class-character variance, post-draft resolution) not yet started.

### Status (Phase 2)

**Built.** The core loop. `DraftProspect.scoutingDepth Int @default(0)`
(0-3: Unknown/Seen/Studied/Known) added via migration. New
`src/lib/draft/scoutingAssignments.ts` (pure, unit-tested, 15 tests):
capacity-by-department-level (MINIMAL 4 - MAXIMUM 20, STANDARD 12 matching
the department system's own default), `scoutingAssignmentsSpent`/
`Remaining` (derived from the sum of every prospect's Depth - no second
counter to drift out of sync), `checkFocusedLook`, and
`recommendScoutingAssignments` (Recommend mode's deterministic plan,
weighted toward real team needs, spreading depth across several prospects
rather than maxing out only the top one).

`generateScoutingReport` (`scoutingProfile.ts`) re-keyed to take Depth
(0-3) instead of `DepartmentLevel` - same `scoutedLabel` uncertainty
machinery, same labels, new depth-indexed reliability/confidence/ceiling-
range tables (4 tiers instead of 5). New
`src/lib/actions/scoutingAssignments.ts`: `assignFocusedLookAction`
(re-validates both real constraints server-side, never trusts a client-
computed remaining-budget display), `getScoutingBudgetSummary`, and
`acceptScoutingRecommendationAction`.

New `PreDraftScoutingView` component and Draft page wiring - this surfaced
a real gap the design doc hadn't accounted for: `DraftExperience` only ever
rendered once the lottery had run, so the scouting UI would have been
unreachable during the exact window it exists for. Built a dedicated
lightweight pre-draft view (prospect board + profile + Focused Look +
Recommend, no pick-order rail or "on the clock" mechanics) rather than
overloading `DraftExperience` with a second, structurally different mode.
`ProspectProfile`/`ProspectProfileModal` updated to read `scoutingDepth`
directly off the prospect instead of a threaded department-level prop.

Also fixed the existing `pending-draft-lottery` Action Center item, which
pointed straight at the lottery - now correctly routes to the Draft page
(where scouting lives) first, since the class being revealed before the
lottery is the entire point of the redesign and the old copy nudged players
past the window.

New guide coverage: a "Scouting the Class" section added to the existing
`/guide/season-flow` article (between All-Star Weekend and the Draft
Lottery, matching the real chronological order) rather than the dedicated
`/guide/scouting` article, which stays Phase 5 scope as originally planned.

### Refinements confirmed before Phase 2 (asked via AskUserQuestion)

- Delegation scoped to Manual + Recommend only for Phase 2 - the "Delegate
  window" mode's Best Player Available strategy needs the Big Board
  (Phase 3), so the full 3-strategy delegate mode is deferred rather than
  shipped with an artificially incomplete strategy list.
- Weekly pacing resolved as one capacity pool for the whole pre-draft
  window, not a new ticking-week calendar system - there's no existing
  offseason day-tracker to hook into (`dayIndex` only exists for scheduled
  games), and inventing one would have been a materially bigger phase than
  "the core loop, minimum viable" called for.

Typecheck, lint (2 pre-existing unrelated warnings, unchanged), and the
full unit test suite (120 files, 1038 tests, up from 1022) all pass.

### Status (Phase 3)

**Built.** The disagreement fantasy. New `src/lib/draft/bigBoard.ts` (pure,
unit-tested, 12 tests): `computePublicEvaluationFactors` implements the
public-evaluation model exactly as refined - age (younger reads as more
upside), physical profile (prototypical size for position overvalued),
competition/visibility (international/small-program prospects
systematically under-scored, verified statistically across 40 trials in a
test, not just spot-checked), generated production (deliberately
uncorrelated with true rating), and tournament performance (revealed once
the player has spent any scouting assignment this window - the confirmed
refinement tying the reveal to a real action rather than a nonexistent
calendar tick). `computeBigBoard` ranks by `publicEvaluation` only -
`overallRating`/`potentialRating` are structurally absent from
`BigBoardProspect`, so it's impossible for the module to rank by truth.

Per Part 5's overlap review ("Delete, don't duplicate"), removed
`computeProjectedDraftRange` entirely rather than building the Big Board
alongside it - it had exactly one consumer (`ProspectProfile.tsx`), now
replaced with the prospect's real Big Board rank.

New "My Board" - the player's own ranked list, built on the existing
`DraftProspectBookmark` model rather than a second parallel one (confirmed
via AskUserQuestion: adds `boardRank Int`, bookmarking joins the bottom of
the list, `reorderDraftBoardAction` rewrites the full order atomically and
rejects a stale client view rather than silently reconciling it). Named
"My Board" specifically to avoid colliding with the pre-existing
`DraftBoard.tsx` component (the live pick-results board) - a real naming
collision caught before shipping, resolved via AskUserQuestion. Drag-to-
reorder (`@dnd-kit`, same library/pattern as `RotationBoard.tsx`). On
Draft Night, "My Board" is now its own tab (alongside Prospects/Team
Needs) and is the tab shown by default, satisfying Part 3.4's "presented
first" requirement - and, going further than the design doc explicitly
asked, can draft directly from it when on the clock, not just browse.

CPU draft AI deliberately left untouched - Part 3.1 mentions the Big Board
could "give CPU teams something honest to draft from," but rewiring an
established, carefully-tuned AI system (whose reach/slide/steal narrative
generation depends on its current true-rating-based scoring) wasn't scoped
into this phase; documented as an explicit, intentional deferral in
`draftAi.ts` rather than silently skipped.

Typecheck, lint (0 new warnings), and the full unit test suite (121 files,
1047 tests, up from 1038) all pass. One additive migration
(`scouting_pillar_phase3_big_board` - `boardRank Int` on
`DraftProspectBookmark`), confirmed safe against 0 existing rows before
applying.

Phases 4-5 (class-character variance, Sweeps/Workouts, post-draft
resolution, `/guide/scouting` as its own dedicated article) not yet
started.

### Status (Phase 4)

**Built.** Texture and longevity - the last two mechanical pieces (Sweeps,
Private Workouts) plus the 25-year answer (class-character variance).

**Prospect Pathway** - this phase's biggest scope expansion, per explicit
user direction to prioritize a reusable, future-proof taxonomy over the
minimum needed for Sweeps alone. New `ProspectPathway` enum (Power
Conference/Mid-Major/International Professional/Development Pathway),
grounded in how real prospects actually enter the draft (Mid-Major's
description cites the real Steph Curry/Damian Lillard/Ja Morant
precedent). `prospectBio.ts`'s college pool split into real power-
conference and mid-major tiers; a new fictional development-pathway org
pool added. Investigating the draft-to-Player boundary surfaced a real,
pre-existing gap: `collegeOrTeam`/`isInternational`/`nationality` were
already being silently dropped at Draft Night, never reaching the real
`Player` row - `pathway` was built to survive that boundary from day one
(new `Player.pathway` field, `draftProspectsToTeams` updated to carry it
over), and now surfaces in the player profile page's Overview tab and in
draft-night steal narratives (an under-visibility pathway gets an
explanatory clause: "out of the Mid-Major ranks").

**A real budget-tracking bug found and fixed before it shipped**: the
existing "assignments spent" derivation summed Scouting Depth across
prospects - correct for Focused Look (1 assignment = +1 depth on one
prospect) but wrong for Sweep (1 assignment raising 5 prospects' depth
would have silently cost 5x) and Private Workout (2 assignments, zero
depth change, would have cost nothing at all). Fixed by adding a real
per-season ledger (`ScoutingAssignmentSpend` - confirmed via
AskUserQuestion over a mutable counter specifically to avoid needing an
explicit reset at every season advance, the same class of bug an earlier
phase already found and fixed in `pendingDraftLottery`). Naturally scoped
by season, so a new pre-draft window simply starts with zero rows.

**Regional Sweep** (1 assignment) - targets a pathway, gives shallow Depth
(capped at Seen) to up to 5 Unknown prospects sharing it, deterministic
per league+season+pathway+prior-sweep-count so a second sweep on the same
pathway surfaces different names. **Private Workout** (2 assignments,
gated at Scouting Depth >= 2 - confirmed via AskUserQuestion as "late
window" defined by real prior investment rather than a fake calendar tick)

- resolves work ethic or injury outlook outright, bypassing
  `generateScoutingReport`'s uncertainty entirely for that axis.

**Class-Character Variance** - one character rolled per class (Top-Heavy/
Deep-but-Flat/International-Heavy/Injury-Riddled/Weak-Class/Balanced,
weighted so Balanced is the plurality and a real character reads as a
standout year), perturbing `generateDraftClass`'s rating-curve constants,
the international rate, true injury risk, and the Big Board's noise
multiplier - all from one seeded roll, no second generation system.
Visible to the player via a banner on the scouting view (only shown for a
non-Balanced year, so an ordinary class doesn't shout).

Caught and fixed a genuine latent bug in the pre-existing
`generateDraftClass.test.ts` while updating it for the new return shape:
its "is deterministic" test used two rng closures that secretly shared one
`let i` counter, which happened to be harmless under the old single-path
generation but would have silently passed for the wrong reason once class
character could branch generation down paths that consume different
numbers of rng() calls. Fixed with genuinely independent counters.

Typecheck, lint (0 new warnings), and the full unit test suite (123 files,
1086 tests, up from 1047) all pass. Three additive migrations
(`scouting_pillar_phase4_pathway`, `_assignment_ledger`,
`_sweep_pathway_ledger`, `_class_character`).

### Status (Phase 5)

**Built.** The payoff - post-draft resolution, the long-tail News beat, and
a dedicated `/guide/scouting` article.

**The prospect-to-player link.** The long-tail beat needs to reach
draft-time scouting data years later, from a player who by then may be on
any team. Confirmed via AskUserQuestion: a new `Player.draftProspectId
String? @unique` field, deliberately `onDelete: SetNull` rather than
`Cascade` - a league's deletion must never destroy a real `Player` row,
unlike most other league-scoped data. Wired into
`draftProspectsToTeams`'s existing `createManyAndReturn` call.

**Post-draft resolution recap** (`draftResolution.ts`, pure/Prisma-free,
covered by `draftResolution.test.ts`). Shown once, right when the user's
own pick resolves in `PickRevealStage` (never for a CPU pick).
Deliberately a receipt for what the player _knew_, never a grade on
whether the pick was _right_: Scouting Depth reached, My Board rank vs.
Big Board rank (directional language only - "higher/lower than," never a
verdict), and which hidden axes (work ethic, injury outlook) got resolved
via a Private Workout versus stayed unresolved. `potentialRating` and any
steal/bust verdict are absent from the type by construction - one of
`draftResolution.test.ts`'s tests asserts the summary object has no such
keys at all, so a future edit can't reintroduce them by accident.

**The long-tail beat, split into two narrative types** (`draftHindsight.ts`,
pure/Prisma-free, covered by `draftHindsight.test.ts`) - the one genuine
scope expansion in this phase, from the user's own explicit direction
(2026-08-06): rather than one beat that fires whenever an under-scouted
(Depth 0-1 at draft time) player makes his first All-Star team, there are
two distinct stories depending on whose roster he's on:

- **`GOT_AWAY`** - drafted by someone else, now thriving elsewhere. Framed
  as regret: "barely registered on your board... now an All-Star for
  [team]."
- **`GAMBLE_PAID_OFF`** - the user drafted him anyway despite the thin
  scouting. Framed as vindication of instinct, explicitly never as luck -
  the user was clear this should read as "a draft gamble that paid off,"
  not "you got lucky." `draftHindsight.test.ts` encodes this directly: one
  test asserts the `GAMBLE_PAID_OFF` description never contains the word
  "lucky" and does contain "gamble."

Wired into `generateAllStarWeekend` (`allStarWeekend.ts`) by reusing the
function's existing `priorSelectionIds` check - the same gate that already
identifies a "first career All-Star selection" for the ordinary news
headline, so the hindsight beat only ever fires once, at the moment it
first becomes true. A small scoped query (only for that selection's
first-timers, not the whole roster) walks
`LeaguePlayer -> Player -> DraftProspect` to recover the stored Scouting
Depth; the user's controlled team is looked up once to classify
on-team/off-team. Deliberately not folded into the shared
`buildAllStarPerformancePool` query, which is reused elsewhere and wasn't
worth bloating for one niche lookup.

**`/guide/scouting`.** New dedicated article, registered in
`GUIDE_ARTICLES`/`GUIDE_TOPICS` alongside the existing three. Consolidates
the three sections that used to live under `/guide/season-flow`
("Scouting the Class," "Class Character," "The Big Board" - removed from
there, with a forward link left in its Draft Lottery section) and adds
three new sections covering ground that had no home before: delegation
(Manual/Recommend/Delegate window), what the post-draft resolution recap
actually shows, and the long-tail payoff. The resolution card now carries
its own `HowDoesThisWork` link into the new "What Draft Night Actually
Resolves" section.

**One pre-existing, unrelated bug found and fixed in passing**: a casing
mismatch (`@/lib/actions/freeAgency` importing a file actually named
`freeagency.ts`) in uncommitted work from a prior session was blocking
`tsc --noEmit` for the entire project, not just Phase 5's files. Fixed the
one-line import casing; unrelated to this phase's scope otherwise.

Typecheck (project-wide), lint (0 new warnings), and the full unit test
suite (125 files, 1102 tests, up from 123/1086) all pass. One additive
migration (`scouting_pillar_phase5_prospect_link`).

### Status (overall)

**Phases 1-5 built - the complete fantasy, the 25-year defense against it
going stale, and the payoff that makes any of it memorable.**
