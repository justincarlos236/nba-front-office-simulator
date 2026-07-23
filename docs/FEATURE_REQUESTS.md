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
- A more premium/polished UI beyond the current three-section page.
