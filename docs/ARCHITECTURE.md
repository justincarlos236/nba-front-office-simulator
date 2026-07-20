# Architecture

## Product framing

The user plays GM of exactly one NBA team inside their own `League` (a save
file). The other 29 teams are AI-controlled. A `League` is created by
cloning a real-world snapshot of the NBA — teams, players, contracts — and
from that point forward it evolves independently: trades, signings, aging,
and retirements in one user's league never affect another user's league or
the canonical reference data.

This "snapshot, then diverge" model is deliberately borrowed from how
franchise-mode sports games are built: static roster/ratings data is
maintained once, and each save gets its own mutable copy layered on top.

## Data model: reference data vs. per-save state

Two layers, on purpose:

**Reference data** (`Team`, `Player`, `PlayerSeasonStat`) — a single
real-world snapshot, imported once by the seed pipeline. Never mutated by
gameplay. This is what a scouting page's career stats table reads from.
Note `Player.currentTeamId` reflects each player's actual real-world team
as of the seed run, while `PlayerSeasonStat` is season-scoped historical
data - the two can legitimately disagree (e.g. Luka Doncic's bio points to
the Lakers post-trade, while his 2023-24 stat line is correctly still
attributed to Dallas).

**Per-save state** (`League`, `LeagueTeam`, `LeaguePlayer`, `Contract`,
`ContractYear`, `DraftPick`, `Trade`, `TradeAsset`, `TradeException`) — one
set of these rows per `League`. `LeaguePlayer` is the mutable copy of a
`Player` within a specific league (rating, injury status, current team);
`Contract`/`ContractYear` model salary precisely enough to support real cap
math (see below).

Why not just mutate `Player`/`Team` directly? Two reasons: (1) it would make
every save globally shared state, so one user's trade would corrupt another
user's league; (2) it would conflate "who this person really is" (career
stats, biographical data) with "what's true in this specific fictional
timeline" (current team, current rating, current contract) — those are
different lifecycles and need to evolve independently per save.

## Salary cap & trade engine

The core "hard engineering" piece of this project: real 2023 CBA mechanics,
not a simplified stand-in. Lives in plain, dependency-free TypeScript
modules under `src/lib/cap` and `src/lib/trade` (not scattered across API
routes or React components), so it's unit tested in isolation and reused
unmodified by three call sites: the team roster pages, the trade builder
UI, and (later) the AI assistant's tools.

Shipped:

- Salary cap, luxury tax line, first apron, second apron thresholds per
  season (`src/lib/cap/constants.ts`).
- Team cap sheets: committed salary, cap holds for empty roster spots,
  dead money, apron classification (`computeCapSheet`).
- Trade legality validation (`validateTrade`): salary-matching bands (which
  tighten the further over the cap/into the aprons a team is), the second
  apron's no-aggregation restriction, no-trade clauses, and a Stepien-lite
  draft pick check.
- The trade builder (`/leagues/[id]/trades/new`) runs this exact validator
  client-side for instant feedback as the user selects players, then
  **re-runs it server-side** in `executeTradeAction` before touching the
  database - the client-side check is a UX affordance, not the
  authorization boundary. Execution (reassigning `LeaguePlayer`/`Contract`
  rows between teams) happens inside a single Prisma transaction.

Not yet built:

- The bi-annual exception and Bird/Early-Bird/Non-Bird re-signing rights.
- Trading draft picks - the Stepien-lite check exists in `validateTrade`,
  but no `DraftPick` inventory is generated during league bootstrap yet, so
  the trade builder is player-only for now.
- Trade exceptions (created when a team takes back less than it sends out)
  aren't banked/spendable yet, even though the `TradeException` model exists.

## Free agency

`validateSigning` (`src/lib/freeagency/validateSigning.ts`) checks whether
a team can sign a free agent at a given first-year salary: cap space for
teams under the cap, the non-taxpayer/taxpayer mid-level exception for
teams over it (gated by apron level via the same `eligibleMidLevelException`
the trade engine uses), or a veteran-minimum deal, which is always legal
regardless of apron status - the one exception the CBA never restricts.
The free agency board (`/leagues/[id]/free-agents`) and offer flow follow
the exact same pattern as the trade builder: live client-side validation
as the user edits the offer, then a full server-side re-validation in
`signFreeAgentAction` before any write happens.

Every real player in the snapshot currently has a real team, which would
leave free agency permanently empty. League bootstrap works around this by
starting fringe/replacement-level players (rating below 25, roughly the
bottom 15% - two-way/10-day caliber in reality) as unsigned free agents
instead of placing them on their actual current team; every other real
player starts on their real team as usual.

Known simplification: this checks each signing against the exception's
full per-season ceiling, but doesn't track cumulative exception spend
across multiple signings the way the real MLE (one bucket to split across
any number of players in a season) works - a full offseason-length
simulation is future work.

## Season simulation & standings

`src/lib/simulation/` is the same "plain, dependency-free, unit-tested
functions" pattern as the cap/trade/valuation engines: a team-strength
calculator, a game simulator, and a schedule generator, none of which
touch Prisma - the imperative shell (`src/lib/actions/simulation.ts`,
league bootstrap) is what wires them to the database.

- **Team strength** (`teamStrength.ts`): a weighted average of a roster's
  top ~9 rotation players' ratings (starters weighted more than bench),
  not a straight average - so a top-heavy star roster isn't penalized for
  a weak bench the way a naive average would.
- **Game simulation** (`simulateGame.ts`): two teams' strength (plus a
  flat home-court bonus) go into a logistic win-probability curve; the
  winner is drawn from that probability, then a plausible final score is
  generated around a realistic NBA scoring baseline. **This is
  deliberately not a possession-by-possession simulation** - no shot
  clock, no individual box scores, no play-by-play. That's a large scope
  increase for a mechanic whose actual product value here is "produce a
  believable season length and standings," which a strength-based model
  delivers at a fraction of the complexity.
- **Schedule** (`generateSchedule.ts`): every team plays every other team
  twice (once home, once away) - 58 games/team, not the real NBA's 82,
  which weights division rivals (4x) and conference opponents (3-4x)
  unevenly by a rotating formula. Replicating that exact weighting was
  judged not worth the complexity for what it would add; the flat
  round-robin is simple to generate, easy to verify (unit tests assert
  the exact 58/29-home/29-away split), and still produces meaningful
  standings.
- **Simulating games** (`simulateGamesAction`) is deliberately batch-
  limited (1/10/50 games per call, never "the whole season" in one
  request) - simulating all ~870 league-wide games in a single serverless
  invocation risks a function timeout. A user advances a full season by
  clicking "simulate 50" a couple of times instead.
- The batch's game/team updates run concurrently (`Promise.all`) rather
  than as one strictly sequential Postgres transaction, since they don't
  need cross-game atomicity. This was a real production-only bug fix, not
  a preemptive optimization: a 10-game batch worked fine locally but
  returned a 500 on Vercel, because the app's Neon database is in
  `ap-southeast-1` while Vercel's default function region is much
  farther away - ~20-30 sequential round trips at that added latency
  risked the serverless timeout even though the exact same code was fast
  against a lower-latency local connection. Also added `vercel.json` with
  `regions: ["sin1"]` to run the functions themselves closer to the
  database. Another example (like the `trustHost`/`AUTH_SECRET` issues)
  of a class of bug only a real deployed environment surfaces.
- Standings' games-back is clamped at 0 for display - the raw formula can
  go slightly negative when teams have played an uneven number of games
  (expected here, since games are simulated in random schedule order, not
  strict rounds), which real standings never show.

## Playoffs

Built on top of the season-simulation engine above rather than duplicating
it: play-in games and playoff series reuse `simulateGame` (and, for
best-of-7 series, a home/away wrapper around it) with the same team
strength numbers the regular season uses.

- **Seeding** (`playoffSeeding.ts`): top 6 teams per conference by winning
  percentage qualify directly; seeds 7-10 go to the play-in tournament.
  Ties broken by total wins - a simplification of the real tiebreaker
  rules (head-to-head, division standing, etc. aren't modeled).
- **Play-in** (`playInTournament.ts`): the real 3-game format - 7 vs 8
  (winner is the final 7-seed), 9 vs 10 (loser eliminated), then the
  loser of the first game vs the winner of the second for the final
  8-seed. Simulated all at once (not batched like the regular season)
  since it's only 3 games per conference; the resulting `Game` rows are
  created already-played (`type: PLAY_IN`).
- **Series** (`simulateSeries.ts`): best-of-7 with the real 2-2-1-1-1
  home-court pattern. `simulateSeriesToCompletion` plays out an entire
  series in one call rather than one game at a time - unlike the regular
  season, a full round is still only a handful of games per series, so
  batching isn't needed to avoid a serverless timeout.
- **Bracket structure** (`src/lib/actions/playoffs.ts`): a fixed
  single-elimination bracket, not reseeded each round - round-1 matchups
  are 1v8, 4v5, 2v7, 3v6 within each conference, and each round's winners
  feed a specific next-round slot (`PlayoffSeries.bracketSlot`), exactly
  like the real playoffs (the 1/8-or-4/5 survivor always meets the
  2/7-or-3/6 survivor in the conference finals). Home-court advantage in
  rounds 2+ (and the cross-conference Finals) goes to whichever advancing
  team had the better regular-season record, per the real NBA rule
  (`pickHigherSeed`).
- **Two server actions**, gated and re-validated server-side (never just
  hidden in the UI): `startPlayoffsAction` requires the regular season to
  be fully played and refuses to run twice for the same season;
  `simulateRoundAction` resolves every remaining series in the current
  round to completion, then either creates the next round's series or -
  at the NBA Finals - crowns a champion.
- Playoff/play-in games never update `LeagueTeam.wins`/`losses` - those
  stay a pure regular-season record, matching the real distinction between
  regular-season and playoff records. Series records live on
  `PlayoffSeries` itself and are what the bracket UI reads.
- `simulateGamesAction` (regular season) now filters its "unplayed games"
  query by `type: REGULAR_SEASON`. Play-in/playoff games are always
  created already-played, so this never mattered in practice, but it
  guards against ever mixing the two once both exist in the same season.

## Player development & multi-season progression

Turns a single-season sandbox into an actual multi-year franchise:
`advanceSeasonAction` (`src/lib/actions/offseason.ts`) ages every active
player, applies development/decline, resolves retirements, expires
contracts, computes that season's awards, resets standings, generates the
next season's schedule, and rolls `League.currentSeason` forward - gated
on a crowned playoff champion, so the playoffs (above) aren't a dead end,
they're what unlocks the next season.

- **Development/decline** (`developPlayerRating.ts`): players at or under
  26 with room below their `potentialRating` grow 1-4 points/season;
  players 30+ decline, accelerating the further past 30 they are; players
  in between drift by ±1. A hand-tuned curve (not fitted data), shaped
  consistently with the valuation model's `ageValueMultiplier` (peak
  late-20s) but expressed as a rating delta since this actually mutates
  `LeaguePlayer.overallRating`, not just a market-value multiplier.
- **Retirement** (`retirement.ts`): zero risk below 33, ~8%/year after
  that (higher for already-low-rated players), forced at 41. Deliberately
  conservative: **there's no draft system yet** (`docs/IMPLEMENTATION_PLAN.md`
  Phase 4), so retirement only removes players from the pool with nothing
  yet replacing them - a slow, realistic rate keeps a league playable for
  many seasons before this becomes a real constraint, but it's a known,
  time-bounded limitation until Phase 4 ships.
- **Awards** (`seasonAwards.ts`): MVP, Rookie of the Year, and Most
  Improved Player, computed only from data actually tracked honestly -
  rating, team win percentage, rookie status (0 experience), and a real
  season-over-season rating delta. Deliberately excludes DPOY/Sixth
  Man/All-Defense - those would need individual defensive box-score stats
  or a bench/starter depth chart, neither of which exist (the game engine
  is strength-based, not possession-by-possession), so faking them would
  mean presenting a guess as a real result - the same principle already
  applied to contract data. MVP uses an additive (not multiplicative)
  team-record adjustment so a mediocre player on a great team can never
  outscore a real star on a bad one; team success only tips genuinely
  close talent gaps.
- **Contract expiration**: `Contract.leaguePlayerId` is unique (one
  contract per player, ever), so an expired contract is deleted (cascades
  its `ContractYear` rows) rather than replaced in place; the player
  becomes a free agent unless they've also retired. Until CPU-team
  decision-making exists (Phase 6), only the user's own team actively
  re-signs its own expiring players, so AI teams' rosters can thin out
  over many advanced seasons - expected for now, not a bug.
- **Cap growth**: `getSeasonCapRules` (`src/lib/cap/constants.ts`) now
  projects the cap forward at a flat 5%/year for any season past the
  hand-entered 2023-2025 table, instead of flatlining at 2025's numbers -
  a documented approximation (real growth has ranged ~3-10%/year
  historically), not a claim about actual future CBA terms.
- **Standings reset**: `LeagueTeam.wins`/`losses` are cumulative counters
  with no season column, so they're explicitly reset to 0 when advancing -
  matching how real standings always show the current season, not a
  career total (which isn't tracked/displayed anywhere in this app).
- The `/leagues/[id]/offseason` page shows the just-completed season's
  awards and a retirements list (name, age, final rating) - not just a
  bare "advance" button - and highlights the user's own players among the
  award winners.

## AI GM assistant

The assistant is not a chat window that free-associates about basketball.
It's Claude (via `@anthropic-ai/sdk`) wired up with tool-use against the
same domain functions the UI calls directly — team cap sheet, player
valuation, trade validation. When a user asks "can I afford to extend
this guy" or "grade this trade for both sides," the model calls a tool,
gets back real numbers computed from that league's actual state, and
reasons over those numbers instead of hallucinating salary figures.

Quantitative player valuation is a separate, independently useful model
(surplus value = projected on-court production value minus cap hit,
age-curve adjusted) that both feeds the assistant and powers standalone UI
(trade grades, "best value contracts" leaderboards) without any LLM call.

## Data sourcing

- **Teams**: hardcoded as a static fixture (`prisma/data/teams.ts`) rather
  than pulled from an API — conference/division/colors are effectively
  fixed, so hitting an external service for this data would just be an
  unnecessary dependency. `logoUrl` links to each team's crest on
  Wikipedia's own image host (`upload.wikimedia.org`, resolved via
  Wikipedia's REST summary API) rather than a copy stored in this repo —
  the same way any site cites an official public asset instead of
  redistributing it. NBA.com's own logo CDN (`cdn.nba.com`) was tried
  first - the URLs are valid (confirmed via `curl`) - but every request
  reliably failed in an actual browser, including on the deployed Vercel
  site itself (not just local testing), most likely IP-range filtering of
  datacenter/server traffic that a real visitor's residential browser
  wouldn't hit. Verified all 30 Wikipedia URLs actually render in a real
  browser (both locally and confirmed the failure/fix on the live site)
  before switching, rather than assuming a URL that returns 200 to `curl`
  will also render as an `<img>`.
- **Players**: bios (name, position, height/weight, draft info, current
  team) come from the balldontlie API. Known limitation: a small number of
  common-name players can get bio data matched to the wrong real person -
  e.g. two players (external IDs `2336`, `46405409`) had their bios
  matched to a 1976-drafted namesake instead of the actual 2023-24 player
  the imported stat line belongs to, which surfaced as an absurd
  "retired at 69" once Phase 3 started actually displaying computed ages.
  Fixed by nulling the incorrect draft fields for those two records rather
  than asserting a still-possibly-wrong specific identity - more honest
  than a confident guess. Separately, `Player.currentTeamId` isn't audited
  for full roster accuracy against today's real rosters (e.g. one known
  case has a player's bio pointing at the wrong team); this doesn't affect
  simulation correctness (each league clones its own mutable roster
  regardless), just the "who plays for whom" bio display for a handful of
  players - a wider accuracy audit is future work, not blocking.
- **Season stats**: real per-player 2023-24 season averages, but not from a
  live API — that season's per-game box scores are bundled from
  [NocturneBear/NBA-Data-2010-2024](https://github.com/NocturneBear/NBA-Data-2010-2024)
  (MIT licensed) and aggregated by `scripts/import-season-stats.ts` into
  `prisma/data/playerSeasonStats.json`. That source has raw box scores but
  no pre-computed advanced metrics (BPM/Win Shares/VORP — these depend on
  team pace/rating context, not just box-score totals), so the valuation
  model (see below) is deliberately built on real per-game box-score stats
  and a computed true-shooting percentage instead of requiring those.
- **Contracts**: no clean, ToS-safe free API exists for real salary data,
  and hand-typing hundreds of dollar figures from memory would mean
  presenting guesses as fact at a scale nobody could realistically verify.
  Instead, contracts are generated algorithmically: each player's salary is
  derived from the same valuation model that grades trades (`estimated
market value` plus deterministic negotiation noise, seeded by player ID
  for reproducibility), with a rookie-scale discount for young/inexperienced
  players. This is explicitly a simulated economy, not a claim about real
  payrolls — and it scales to every player automatically instead of only
  covering whichever stars got hand-entered.
- Once seeded, all of this becomes simulation input; nothing in the running
  app depends on a live third-party API, which keeps the deployed product
  from being fragile to rate limits or upstream schema changes.

## Auth & multi-tenancy

Auth.js v5 with the Prisma adapter, Credentials provider (email/password
via bcrypt), and JWT sessions. Every `League` has an `ownerId`; every read
of league-scoped data checks `session.user.id === league.ownerId` at the
data-access layer (not just hidden in the UI) and returns a 404 - not a
403 - for a non-owner, so the route doesn't even confirm the league
exists. One league per user for now (`createLeagueAction` is idempotent:
revisiting `/leagues/new` after starting one redirects straight back to
it instead of creating a second); multiple saves per user is future work.

`trustHost: true` is required in the Auth.js config for this to work
outside Vercel (which sets it automatically) - without it, Auth.js
rejects every request in a real production build with an `UntrustedHost`
error. Next.js dev mode implicitly trusts `localhost`, so this only
surfaced when the Playwright e2e suite ran against `next build && next
start` instead of `next dev` - a concrete example of why testing the
actual production build matters, not just the dev server.

One deliberate cost: adding a session-aware `NavBar` to the root layout
means every page now calls `auth()` (which reads cookies), which makes
the entire app dynamically rendered - including pages like `/teams/*`
that used to be statically generated at build time. Documented as a
known tradeoff in docs/ROADMAP.md (M6) rather than solved now.
