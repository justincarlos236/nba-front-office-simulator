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
`Player.currentTeamId` is deliberately **season-accurate to 2023-24**, not
each player's real-world-current team - it's exactly what
`createLeagueAction` uses to decide which team a new league starts a
player on, so it has to agree with the season `PlayerSeasonStat` line it's
seeded alongside (e.g. Luka Dončić's `currentTeamId` points to Dallas,
matching his 2023-24 stat line, even though he's really on the Lakers as
of today) - see "Data sourcing" below for the bug this was fixed from.

**A real gotcha this caused**: `Player` is also where fictional
draft-generated prospects live (`draftProspectsToTeams`,
`src/lib/actions/draft.ts`, creates a real `Player` row with no
`externalId` for every generated rookie) - but unlike the real 497-player
import, these rows are never scoped to the league that drafted them and
are never cleaned up when a league is deleted. `createLeagueAction`
originally queried `prisma.player.findMany()` with no filter at all, so
every league's bootstrap silently inherited every _other_ league's entire
draft history as extra, broken (flat 50-rated) free agents - worse for
leagues created later in this database's history, since the pollution
only ever grew. Fixed by scoping that query to `externalId: { not: null }`
(the real players only); fictional prospects still enter a league
normally, just through that league's own draft, never another league's
leftovers. See `docs/IMPLEMENTATION_PLAN.md`'s status log for the cleanup
of already-polluted leagues.

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

## Team dashboard

`/leagues/[id]` is the page a user lands on right after picking a team,
and returns to constantly - it needed to be a real "starting point," not
just a roster table with a row of nav links. A "Franchise overview" card
row sits between the header and the cap-sheet stats, giving an at-a-glance
snapshot of every other section on the site without having to click into
each one first:

- **Conference rank** - computed from `league.teams` (already fetched for
  the header) sorted by win pct within the user's own conference, not a
  separate query.
- **Playoff picture** - a compact status string (regular season in
  progress / haven't started / alive in round N / eliminated / won it
  all), derived the same way the playoffs page's own per-user status line
  is, just condensed to one line.
- **{season} draft picks** - `DraftPick` rows currently owned by this team
  (`currentOwnerId`, which reflects trades - not `originalTeamId`) for the
  current season, split into "pending" vs. total. This directly closes a
  gap flagged since Phase 4: draft pick inventory existed in the data
  model but was never surfaced anywhere on the team's own dashboard.
- **Recent activity** - the single most recent `LeagueTransaction` for
  this league, reusing the exact same table Phase 5's news feed reads
  from.
- **All-time record** - a count of `PlayoffSeries` round-4 wins for this
  team across every season in the league's history, not just the current
  one.

**A real ambiguity this surfaced**: card labels and headlines are plain
text sitting on the same page as the nav links and roster table above/
below them. Card labels that echoed nav link text almost verbatim
("Standings," "Playoffs," "Latest news") broke existing e2e tests that
click nav links by their visible text, since Playwright's `getByText` is
substring- and case-insensitive by default ("Latest news" matches a
`getByText("News")` query). Fixed by giving cards clearly distinct labels
("Conference rank," "Playoff picture," "Recent activity," "All-time
record") rather than paraphrasing the nav. The recent-activity headline
itself is dynamic content (a trade/signing description can name any
player), so it can still legitimately collide with a player's name shown
elsewhere on the same page (e.g. the roster table) - that class of
collision isn't avoidable by renaming anything, so the affected test
scopes its assertion to the roster table specifically instead.

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

- The bi-annual exception. A simplified Re-Signing Rights mechanic (a
  casual stand-in for real Bird/Early-Bird/Non-Bird rights) exists now -
  see "Free agency" below.
- Trade exceptions (created when a team takes back less than it sends out)
  aren't banked/spendable yet, even though the `TradeException` model exists.

Trading draft picks now works (Phase 11a) - see "Draft pick trading" under
"Draft system" below for the future-pick inventory and the Stepien-rule
wiring that unblocked it.

## Simplified financial presentation layer

The real CBA engine above is the intentional "hard engineering" showpiece
of this project - it's staying. But the user-facing brief for it is
"realistic consequences without complicated rules": a casual fan should
never need to know what an apron or a mid-level exception variant is to
play well. Rather than weakening the real engine, a presentation layer
sits on top of it that translates the same underlying numbers into
plain language, without touching how legality is actually decided:

- **`src/lib/cap/capStatusLabel.ts`** - collapses the 5 real `ApronLevel`
  values into 3 user-facing states (`Under the Cap` / `Over the Cap` /
  `Luxury Tax`, taxpayer/first-apron/second-apron all folding into
  "Luxury Tax"), each with a one-line plain-English description of what
  a team can and can't do. Replaces the team dashboard's old raw
  `apronLevel.replaceAll("_", " ")` display (e.g. "BETWEEN CAP AND TAX").
- **`src/lib/valuation/playerValueTier.ts`** - buckets `overallRating`
  (the same 60-99 NBA-2K-style scale used everywhere - see "Player rating
  scale" below) into five casual tiers (Superstar/Star/Starter/Rotation
  Player/Minimum-Level Player), calibrated against real NBA 2K ratings
  rather than an arbitrary spread. Shown wherever players are listed: the
  roster table, the free-agent board, and the trade builder.
- **`src/lib/trade/describeTradeFeasibility.ts`** - turns `validateTrade`'s
  real violations into "Trade Financial Check: Valid/Invalid" plus a
  plain-English detail line ("You're taking on too much additional
  salary. [Team] needs to send out approximately $8.0M more..."). It
  re-derives the same shortfall using the validator's own exported
  `maxIncomingSalaryCents`/`isUnderCapSpace` helpers rather than parsing
  the validator's raw violation text, so there's exactly one place the
  salary-matching math lives - this only decides _how to phrase_ an
  already-computed answer, never re-decides legality itself.
- **`src/lib/freeagency/describeSigningFeasibility.ts`** - collapses both
  MLE variants (`NON_TAXPAYER_MLE`/`TAXPAYER_MLE`) into one user-facing
  "Signing Exception" concept, and `VETERAN_MINIMUM` into "Minimum
  Contract" - a user never needs to know which flavor of exception their
  team happens to be eligible for, only that they have one.
- **`src/lib/cap/multiYearProjection.ts`** - projects a team's _already
  committed_ payroll forward across the next 4 seasons from its current
  roster's contracts. Deliberately not a prediction of future moves (no
  assumed re-signings or new signings) - just what decisions already made
  have locked in, which is exactly what "long-term contracts affect
  future flexibility" means in practice. A team's committed payroll
  naturally tapers off in the projection as shorter deals expire, making
  the "cliff" visible without any extra modeling.
- **`src/lib/cap/financialFlexibilityGrade.ts`** - an A-F grade folding
  together the current Financial Status, the 4-season projection above,
  and a per-contract check for "albatross" deals (3+ years remaining,
  still commanding 15%+ of the cap) into one letter, the same "read one
  summary instead of reasoning through several seasons of cap sheets
  yourself" philosophy as the rest of this layer. A heuristic scoring
  model (start at 100, subtract weighted penalties, clamp and bucket into
  letters) in the same spirit as the player valuation model - tuned for
  sensible relative ordering, not a claim of precise real-world grading.
- **`/guide/finances`** - a standalone reference page (not nested under
  `/leagues/[id]`, since the content is the same for every league) walking
  through Financial Status, Player Value Tiers, the Trade Financial
  Check, Re-Signing Rights, the Signing Exception, the Financial
  Flexibility Grade, and Owner Confidence & Job Security in plain
  language, each in its own anchored section. Linked contextually from
  exactly where a user would actually wonder "why," rather than buried in
  a nav menu: the team dashboard's financial-status line, Future Financial
  Flexibility card, and GM Job Security card, the trade builder's
  feasibility result (deep-links to `#trades`), the sign-offer form
  (deep-links to `#re-signing-rights` or `#signing-exception` depending on
  which one is actually relevant to that offer), and the offseason page's
  Ownership section (deep-links to `#owner-confidence`). The trade
  builder/sign-offer links open in a new tab deliberately - both are
  client-side forms with in-progress selections that navigating away
  would otherwise discard.

**Still a real CBA concept, not yet simplified in the UI**: Re-Signing
Rights is one flat "your own player" concept, not the real three-tiered
Bird/Early-Bird/Non-Bird distinction (different tiers unlock different
things in the real CBA - full Bird after 3 years, Early Bird after 2 at
a lower ceiling, Non-Bird after 1). Not modeled since the brief only
needs "can I afford to keep my own star," not precise CBA mechanics.

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

**Re-Signing Rights** (`src/lib/freeagency/reSigningRights.ts`) - a casual
stand-in for real Bird/Early-Bird/Non-Bird rights, tracked via
`LeaguePlayer.reSigningTeamId`: whichever team a player is currently (or
was most recently) under contract with. It's kept in sync with
`leagueTeamId` on every signing, draft assignment, and trade (transfers to
the acquiring team, matching how real Bird rights travel with a traded
player) - but deliberately **not** cleared when a contract expires, so it
still points at the player's last team while they're a free agent. A team
holding a player's Re-Signing Rights can offer them up to
`computeReSigningMaxOfferCents` (a rating-based "fair market value"
ceiling, the same rating-to-cap-fraction curve contract generation uses)
regardless of cap space or apron status - real max-contract tiers and
extension rules aren't modeled, since the brief only needs "can I afford
to keep my own star," not precise CBA mechanics.

**Signing Exception usage is now tracked cumulatively** across a season,
closing what was previously a documented gap: `getSigningExceptionUsage`
(`src/lib/actions/signingException.ts`) derives how much of a team's
mid-level exception is already committed by summing `Contract` rows
signed this season with `signedUsing` set to a mid-level value - no
separate running-total field to keep in sync, since `Contract.signedUsing`
is already the single source of truth for how a signing was made.
`validateSigning` checks new offers against the _remaining_ room, not the
full per-season ceiling, so a team can no longer sign multiple players
each using the exception's full amount.

## GM accountability

`src/lib/gm/` layers a season-to-season accountability system on top of
the financial concepts above - the design brief's "realistic
consequences without complicated rules" applied to _how the user is
judged_, not just what they can afford:

- **`payrollTier.ts`** - collapses the 5 real `ApronLevel` values into 4
  named payroll tiers (Modest/Moderate/Significant Luxury Tax/Extreme),
  a coarser cut than `capStatusLabel`'s 3 states since expectation-setting
  needs to tell "paying some tax" apart from "hard-capped at the second
  apron."
- **`expectationLevel.ts`** - sets a preseason expectation (one of six
  levels, Develop Young Players through Championship Contention) from
  payroll tier + roster strength: payroll sets the baseline, then an
  elite roster raises the bar a level and a weak roster (bad contracts on
  an expensive team) lowers it a level. Ordered on a 0-5 scale that lines
  up 1-for-1 with `seasonEvaluation.ts`'s 0-6 actual-outcome scale.
- **`seasonEvaluation.ts`** - `computeActualOutcome` derives how far a
  team actually got (0-6: missed the playoffs, up through won the
  championship) from that season's `PlayoffSeries` rows plus whether the
  team appears in a play-in `Game` (play-in eliminees never get a
  `PlayoffSeries` row, since round 1 is the first round series are
  created for - see `startPlayoffsAction`). `evaluateSeason` compares the
  outcome index against the expectation's own index into a 4-tier verdict
  (Exceeded/Met/Fell Short/Drastically Fell Short); `computeConfidenceDelta`
  scales the resulting Owner Confidence change by payroll tier, since
  spending heavily amplifies both the reward for justifying it and the
  penalty for wasting it.
- **`jobSecurity.ts`** - buckets the 0-100 `League.ownerConfidence` score
  into 6 named levels (Very Secure through Critical) with a one-line
  description - "Confidence: 42" means nothing on its own, "Under
  Pressure" does. Critical is this phase's firing _trigger_: a clearly
  surfaced "your job is at risk" state. What actually happens once a GM
  is fired (a recap screen, a job market, choosing a new team) is Phase
  11's job, not this one's - see `docs/FEATURE_ROADMAP.md`/
  `docs/IMPLEMENTATION_PLAN.md` for that split.
- **`ownershipMessages.ts`** - plain-English string builders (season
  evaluation, new expectation, payroll directive, directive compliance),
  same pattern as `src/lib/transactions/describeTransaction.ts`. Reuses
  the existing `LeagueTransaction` news feed as the delivery mechanism (a
  new `OWNERSHIP_MESSAGE` type) instead of a separate messaging system.

**One `SeasonExpectation` row per league+season** is the mechanism that
keeps evaluation honest across a season where the roster changes via
trades/signings: it's locked in once, at the moment the season begins
(`createLeagueAction` for season 1, the end of `advanceSeasonAction` for
every season after using the post-rollover roster), and only ever
updated afterward with what actually happened. Evaluation always compares
against what was expected _at the time_, never a standard re-derived from
a roster that's since changed. This also means `advanceSeasonAction`
never needs a special "no expectation exists yet" bootstrap branch - by
construction, a prior row always exists by the time a season is advanced.

The outgoing season's payroll (used to pick the confidence-delta
multiplier) has to be captured _before_ `advanceSeasonAction`'s existing
expired-contract cleanup runs, since that cleanup deletes the very
`ContractYear` rows a payroll snapshot for the just-completed season would
depend on - captured early in the function alongside the prior
`SeasonExpectation` fetch, well before any mutation happens.

A payroll-reduction directive is deliberately only issued when ownership
is _already_ unhappy (confidence below a threshold) and the team is
_still_ spending heavily - otherwise every offseason for an expensive but
successful team would nag the user for no reason it could ever resolve.

## Trade AI foundations: team identity & needs

The trade-AI evaluation engine (11c, below) needs two inputs about the
_other_ side of a deal, built in 11b as small, pure, on-demand-computed
modules under `src/lib/gm/` - deliberately not persisted state, unlike
`SeasonExpectation`/`DraftPick`, so there's no backfill risk for existing
leagues (see the Phase 11a/10d incident logged in
`docs/IMPLEMENTATION_PLAN.md` - anything that instead _persists_ new state
has to be explicitly backfilled onto every existing league, not just
wired into `createLeagueAction`).

- **`teamIdentity.ts`** (`computeTeamIdentity`) - buckets a team into
  Contender/Playoff Team/Play-In Team/Rebuilding/Tanking from a
  `competitivenessPercentile` (how the team ranks against the other 29,
  0 = worst, 1 = best) plus average roster age to split Rebuilding from
  Tanking at the bottom (a bad-but-young team is still developing, not
  necessarily playing for next year's lottery on purpose). The percentile
  itself is deliberately an opaque input the pure function doesn't derive
  itself - `src/lib/actions/competitiveness.ts`'s
  `computeCompetitivenessPercentiles` (shared by the team dashboard and
  `executeTradeAction`/`trades/new` alike) uses actual win percentage once
  20+ games have been played this season, or falls back to
  `computeLeagueTeamStrengths` (the same team-strength function actual
  game simulation already uses) before that, since win% means little
  early in a season. Percentile thresholds are calibrated against the
  real playoff structure (top ~20% Contender-ish, top ~40% direct
  qualifiers, top ~67% including the play-in field).
- **`teamNeeds.ts`** (`computeTeamNeeds`) - positional gaps (judged by a
  position's _best_ rostered player, not its average - a great starter
  with a weak backup isn't "thin" there in the way that matters for trade
  value) plus a bench-depth check, reusing `playerValueTier.ts`'s own
  STARTER/ROTATION rating cutoffs rather than inventing new thresholds.
  Deliberately narrower than the design brief's original six needs -
  "Shooting" has no detectable signal anywhere in this data model (no
  3PT/shot-profile stat exists on `LeaguePlayer` or generated draft
  prospects, only `overallRating`/`potentialRating`/`position`/age), so
  faking a "shooting need" would be noise rather than a documented
  simplification like everything else in this layer.
- Surfaced on the team dashboard's "Team identity" card, and (as of 11c)
  on the Trade Builder page for both sides of a proposed deal.

## Trade AI: value engine, GM personality & the acceptance decision

The core of the whole trade-AI overhaul (Phase 11c): a CPU team now
actually evaluates whether a proposed trade is good for it, instead of any
financially-legal trade auto-succeeding.

- **`src/lib/gm/playerTradeValue.ts`** (`computePlayerTradeValue`) - a
  single cents-denominated trade-value figure per player, so players and
  picks can be summed and compared directly. Combines current production
  (age-adjusted `overallRating`, via the same `ageValueMultiplier` curve
  the free-agency market-value model uses), untapped potential (the gap
  between `potentialRating` and current rating - proven production still
  weighs more, since upside carries real bust risk), contract quality
  (bargain vs. overpay, the same idea as the unused `evaluatePlayer`'s
  `surplusValueCents` but driven off `overallRating` instead of real
  box-score stats, which don't exist past the original season snapshot),
  and an injury discount (current status plus career games missed -
  `LeaguePlayer.careerGamesMissedToInjury`, a new counter incremented
  alongside the existing `INJURY` transaction log in
  `src/lib/actions/leagueEvents.ts`).
- **`src/lib/gm/draftPickTradeValue.ts`** (`computeDraftPickTradeValue`) -
  the same cents unit for a pick. A current-season pick with a known
  `overallPickNumber` is valued directly; a future pick projects an
  expected slot from its _original_ team's current competitiveness
  (worse team → earlier/better projected pick - a simplified linear
  stand-in for the real lottery, not a claim about the actual future
  order), then reuses `generateDraftClass.ts`'s exact rating-by-pick curve
  (exported for this purpose, rather than a second hand-tuned scale that
  could drift out of sync) to estimate what that slot's prospect would be
  worth via the same `scoreToCapFraction`/`ageValueMultiplier` machinery
  players use. A compounding per-year discount and a steep 2nd-round
  multiplier apply on top - real 2nd-rounders are worth much less than
  their talent curve alone implies (non-guaranteed contracts, easy roster
  churn).
- **`src/lib/gm/gmPersonality.ts`** - a 7-value `GmPersonality` enum
  (`AGGRESSIVE`/`CONSERVATIVE`/`WIN_NOW`/`PROSPECT_LOVER`/`PICK_HOARDER`/
  `SALARY_CONSCIOUS`/`BALANCED`), persisted on `LeagueTeam.gmPersonality`
  and assigned once per team at league bootstrap via the same
  `createSeededRandom` pattern used elsewhere (deterministic per
  league+team, so a save's personalities never change). Each personality
  is a table of five **bounded 0.7-1.3 multipliers** (pick value, incoming
  youth value, incoming veteran value, bad-contract sensitivity, and the
  overall acceptance-bar threshold) - deliberately narrow, so personality
  can only nudge a team's evaluation within a realistic band around "fair,"
  never flip a lopsided trade into an accept. `BALANCED` isn't a fallback
  default; every team gets a personality with equal probability.
- **`src/lib/trade/evaluateTradeOffer.ts`** - the core decision function.
  Computes every incoming/outgoing asset's objective value, layers on
  personality multipliers plus identity-based bonuses (Contenders/Playoff
  Teams value incoming proven veterans more; Rebuilding/Tanking teams
  value incoming youth and picks more) and a need-fit bonus (an incoming
  player who fills a recognized need from `computeTeamNeeds` is worth
  more to _this_ team specifically), then checks a hard **untouchable-
  player gate** before anything else: a young (≤25) superstar-tier player
  anywhere, or a Contender/Playoff Team's own top 2 rated players, can't
  be moved unless the incoming value clears a 1.75x objective overpay -
  no personality or identity weighting overrides this gate. The resulting
  incoming/outgoing value ratio (after all weighting) is compared against
  a fixed accept/counter threshold, itself shifted by the personality's
  bounded acceptance multiplier, into an Accept/Reject/Counter decision.
  Returns reason _codes_ (not prose) - the plain-English rejection-message
  bank that turns these into believable sentences is Phase 11d's job,
  keeping this module's output structured data, the same separation of
  objective computation from presentation the rest of this layer uses.
- **The fairness safeguard**: personality/identity weighting is real but
  narrow by construction - every multiplier in this whole system is
  bounded 0.7-1.3, and the gap between "genuinely lopsided" and "close to
  fair" trade ratios is wide enough that no combination of personality
  and identity bonuses can turn a robbery into an accept. Verified by a
  test that throws one blatantly lopsided trade at all 7 personalities
  and asserts every single one rejects it.
- **Wiring**: `executeTradeAction` calls `evaluateTradeOffer` immediately
  after `validateTrade` passes (a CPU team never considers a trade its
  own side can't legally make) and throws a descriptive error on anything
  other than `ACCEPT` - reusing `TradeBuilder.tsx`'s existing error
  display, no new UI state needed. `TradeBuilder.tsx` also runs the same
  function client-side for an instant "would they take this?" preview,
  identical in spirit to how `validateTrade`'s own live preview works,
  and shows both sides' identity/needs/personality on the page itself (a
  scope addition made while testing 11b, once it was clear the trade
  builder was the only place that context is actually useful).

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

## Around-the-league activity: injuries, CPU trades & CPU signings

Without this, the only news in a league would ever be things the user
personally did - the other 29 teams would sit frozen all season. `src/lib/actions/leagueEvents.ts`'s
`applyLeagueEvents` (called by `simulateGamesAction` right after a batch's
games/standings are persisted, and by `scripts/e2e-fast-forward-season.ts`)
rolls three kinds of activity, all frequency-scaled by the number of games
_just simulated_ rather than real time or click count - simulating 1 game
produces essentially nothing, simulating 50 produces several events, the
same way a real season's news ebbs and flows with games played:

- **Injuries** (`rollForTeamInjury` in `src/lib/simulation/leagueEvents.ts`):
  a small per-team-per-game chance (2%) of a random healthy rostered player
  going down, with a duration (1-30 games) and flavor injury name drawn from
  three severity tiers. This has a **real mechanical effect**, not just
  flavor text: `computeLeagueTeamStrengths` excludes injured players
  entirely, so an injured rotation player genuinely weakens that team's
  simulated games until they recover - including the user's own team, the
  same as real GM games. Recovery is tracked via
  `LeaguePlayer.injuryReturnsAtGamesPlayed`, compared against that team's
  own `wins + losses` (not a calendar date) each time a batch involving
  that team's games completes. `advanceSeasonAction` unconditionally resets
  every player to healthy at the season turnover (alongside the wins/losses
  reset) - without that, an injury rolled late in the season with a long
  recovery window could reference a games-played threshold past the ~58
  games a season actually has, leaving the player stuck "out" forever.
- **CPU-CPU trades** (`rollForCpuTrade`): picks two random _non-user_ teams
  and one tradeable player from each (biased toward the lower-rated ~70% of
  each roster - real trades skew heavily toward role players/depth, not
  stars), then validates the swap through the exact same `validateTrade`
  the user's own trades go through - CPU moves are never a cap-rules
  shortcut. Deliberately **never involves the user's own team** - trading
  the user's players without their consent would break the "you're the GM"
  premise that the whole app is built around; injuries are bad luck that
  can hit anyone, but transactions on the user's roster should only ever
  happen when the user initiates them.
- **CPU signings** (`rollForCpuSigning`): a random non-user team signs a
  random available free agent to a 1-year veteran-minimum deal - the one
  signing mechanism that's always cap-legal regardless of a team's apron
  situation (see Free Agency above), so unlike trades this never needs a
  legality retry loop.

All three write into the same `LeagueTransaction` log the user's own
actions do (see "Transactions, news feed & league history" below), so the
feed reads as one continuous wire rather than two different systems for
"things I did" vs. "things that happened." CPU draft picks are still
deliberately excluded from this log for the same noise reason described
there.

**Known simplification**: a batch call computes team strength once, up
front, and simulates every game in that batch against that snapshot - an
injury rolled mid-batch doesn't affect that same batch's remaining games,
only the next `simulateGamesAction` call. This follows directly from the
existing "strength computed once per batch" architecture (see Season
Simulation above) rather than recomputing strength per game, which would
undo the reason batches exist in the first place.

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
- **Bracket UI** (`src/components/playoffs/PlayoffBracket.tsx`): a real
  visual bracket - East on the left, West on the right, both fanning
  inward to a centered Finals box - built with plain CSS Grid rather than
  a charting library. Each round's row-start/span is derived purely from
  `2 ** roundIndex` (round 2's box always covers exactly the 2 round-1
  rows that feed it, round 3 covers all 4, etc.), so the connector lines
  and box positions stay pixel-aligned automatically without any manual
  height math, and it degrades gracefully to explicit "TBD" placeholder
  boxes for rounds not reached yet - the bracket's shape is stable from
  the moment the playoffs start, it just fills in round by round. Uses
  team abbreviations (not full names) and small fixed-width boxes
  specifically so the whole bracket fits on one screen with no horizontal
  scrolling on a normal desktop viewport (`overflow-x-auto` remains as a
  fallback for genuinely narrow ones).
  - **A CSS Grid item spans its assigned rows by default, but doesn't
    center its content within them** - the first version of this
    component got the row math right but never centered each box inside
    its spanned area, so boxes rendered flush to the _top_ of their range
    instead of centered between the pair feeding them, and the connector
    lines (which _were_ correctly centered) looked disconnected from the
    boxes they were supposed to join. Fixed by wrapping every box in a
    `flex h-full items-center` container - this is the actual fix, not a
    cosmetic one, and is the kind of bug that's easy to miss because the
    grid positions themselves are correct; only the rendered content
    inside each cell was misplaced.
  - Each round-to-round connector is a small elbow, not a single line: a
    vertical spine runs between the two feeding boxes' own vertical
    centers (25%/75% of the connector's height, since a parent's cell
    always spans exactly its 2 children), with stubs into each child and
    a third stub into the parent - so it's visually unambiguous which two
    series feed which next matchup. The Conference Finals -> NBA Finals
    link is simpler (a single centered line), since it's always a direct
    1-to-1 join rather than a 2-into-1 merge.

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

## Draft system

Runs between the just-finished season's playoffs and the next season -
`advanceSeasonAction` now refuses to advance until the draft for the
current season is fully resolved, so it isn't a dead end bolted onto the
side of the sim; it feeds real rookies onto real rosters that then go
through development/retirement/free agency like anyone else.

- **Lottery** (`draftLottery.ts`): the real post-2019-reform NBA odds
  table (top 3 records tied at 14.0%, tapering to 0.5% at seed 14) - real,
  published data, not an approximation of the _odds themselves_. The
  actual lottery draws picks 1-3 via weighted ping-pong-ball combinations
  without replacement; this approximates the same probabilities with a
  simpler weighted draw without replacement for the top 4 picks, a
  documented simplification of the combinatoric mechanism only.
- **Full draft order** (`draftOrder.ts`): picks 1-14 from the lottery
  among non-playoff teams; picks 15-30 go to the 16 playoff teams in
  reverse regular-season record (the real rule - playoff _performance_
  doesn't affect draft position); round 2 (picks 31-60) is a straight
  reverse-record sweep of all 30 teams with no lottery at all.
- **Prospects** (`generateDraftClass.ts`, `prospectNames.ts`): 60
  fictional prospects per class - no real future draft class data exists,
  so these are explicitly not real people, same principle as contract
  generation. Ratings trend better for earlier picks on average (~68
  overall / ~92 potential at pick 1, tapering to ~45 / ~65 at pick 60)
  but with real random variance layered on top, so pick order isn't a
  perfect predictor - some late picks outperform, some high picks bust,
  the same as a real draft. The pool of 60 is generated independently of
  the 60 picks; which prospect actually goes to which pick is decided by
  best-available-by-rating (CPU teams) or the user's own choice, not a
  fixed 1:1 slot mapping - so a league's "consensus top prospect" can
  genuinely fall further than pick 1 if a CPU team (or the user) drafts
  someone else first.
- **CPU picks**: best-player-available by rating. Real GM logic (team
  needs, timeline, positional fit) is Phase 6 territory (AI-driven CPU
  teams) - this is a documented, honest simplification until that exists.
- **Interactive draft day** (`/leagues/[id]/draft`, `DraftExperience.tsx`):
  the user makes their own team's picks from a live board, side by side
  with a running draft board; CPU picks in between are fast-forwarded in
  one click ("Simulate to your next pick") rather than requiring 58
  individual clicks - but the board fills in _pick by pick with a brief
  delay between each_, not instantly, so it visually reads as a sped-up
  draft happening rather than a single jump-cut to the end state. This
  meant moving the board to fully client-managed state: the server
  actions (`startDraftAction`/`advanceDraftAction`/`makeDraftPickAction`)
  return the complete ordered list of what they just resolved, and the
  client drives its own local `picks` state from those results - it
  doesn't wait on the automatic post-action page re-render the way
  earlier phases' simpler action/button components did, since that would
  make every pick appear at once again.
- A **Scouting Board** section lists every prospect in the class
  (drafted or not), filterable by position, each expandable into a full
  report: five derived sub-attributes (scoring/playmaking/defense/
  rebounding/athleticism, `scoutingProfile.ts`) as bars, plus computed
  strengths/weaknesses. These are flavor only - deterministic and seeded
  by prospect id, but the simulation itself still only ever uses
  `overallRating`/`potentialRating`; no hidden mechanic depends on them.
  The same expandable report is available inline while picking, so the
  user can scout a prospect before drafting them, not just afterward.
- **Rookie contracts**: reuse the exact same `generateContract` engine
  every other contract in the sim uses (not a hand-typed rookie-scale
  table) - a prospect's `overallRating` stands in for the usual
  stats-derived `ageAdjustedScore` input, since generated prospects have
  no real box-score history to compute one from. `yearsOfExperience: 0`
  gets them the same rookie-scale discount real rookies get.
- **Reference `Player` rows**: a drafted rookie still gets a real
  `Player` row (not just a `LeaguePlayer`), with `draftYear` set to their
  actual rookie season - this keeps them working seamlessly with the
  existing age-estimation infrastructure (`estimateAge`/`estimateExperience`)
  for every future season's development pass, without any special-casing.
  One accepted quirk: because that infrastructure assumes everyone was 22
  when drafted (see `src/lib/players/age.ts`), a rookie's _displayed_
  generated age (19-22, shown once on the draft board) doesn't
  necessarily match the age they're treated as in all future development
  math - the same simplification every real player in the sim already
  has, just newly visible at the moment they're drafted.

### Draft pick trading

Building the trade-AI overhaul (Phase 11) surfaced that draft picks
weren't tradeable at all: `DraftPick` rows for a season only came into
existence the moment that season's own draft actually started
(`startDraftAction`, 60 rows: 2 rounds x 30 teams), so there was no
inventory of "next year's 1st" or "picks 3 years out" for anything to
trade. Phase 11a fixed this:

- **Future pick inventory** (`src/lib/draft/futurePicks.ts`,
  `buildFuturePickRows`): every team owns a rolling window of its own
  round-1 and round-2 picks for `[currentSeason, currentSeason +
FUTURE_PICK_WINDOW_YEARS]` (5 seasons ahead), with `overallPickNumber:
null` until that season's draft actually happens. Generated once at
  league bootstrap for the full initial window, then extended by exactly
  one new far-edge season every `advanceSeasonAction` call - the same
  "rolling window" shape as the 4-year cap projection in the simplified
  financial layer.
- **Placeholders are updated in place, never recreated**: `startDraftAction`
  used to `createMany` 60 fresh `DraftPick` rows keyed by
  `originalTeamId`. Now that those rows already exist as placeholders
  (possibly already re-owned by a different team via a pre-draft trade),
  it looks each one up by `{round, originalTeamId}` and updates only
  `overallPickNumber` - critical, since recreating the row with
  `currentOwnerId: originalTeamId` would silently revert any trade that
  happened before that season's draft. The "has the draft started"
  signal changed accordingly, from "does any `DraftPick` row exist for
  this season" (now always true) to "does one exist with a non-null
  `overallPickNumber`" - updated everywhere that check was made:
  `startDraftAction`, `advanceDraftAction`, `makeDraftPickAction`,
  `advanceSeasonAction`'s advance-guard, and three page components
  (`offseason`, team dashboard, draft board).
- **Trading a pick**: `TradeBuilder.tsx` lists each side's currently-owned,
  not-yet-selected picks (`currentOwnerId: teamId, selectedProspectId:
null`) alongside players; `executeTradeAction` reassigns
  `DraftPick.currentOwnerId` inside the same transaction that moves
  players, and populates `validateTrade`'s `ownedFutureFirstRoundPickSeasons`
  input with real data (previously always `[]`) so the existing but
  never-exercised Stepien-rule check actually does something.
- **Foreign keys into `LeagueTeam` are `RESTRICT`, not cascade**: this
  only matters for bulk data cleanup (deleting a `User` cascades to their
  `League`s, which should cascade to `LeagueTeam`), not normal gameplay,
  but `Contract.leagueTeamId`, `DraftPick.originalTeamId`/`currentOwnerId`,
  `TradeException.leagueTeamId`, and `TradeAsset.fromLeagueTeamId`/
  `toLeagueTeamId` all default to `ON DELETE RESTRICT` from the original
  migration. A full cascade delete has to clear those four tables
  explicitly, in dependency order, before the `LeagueTeam` rows they
  point to can go - discovered while cleaning up accumulated e2e test
  data (see `docs/IMPLEMENTATION_PLAN.md`'s Phase 11a log entry).
- **Draft pick trade _value_** (projected slot for a not-yet-drafted pick,
  years-away discount, round discount) is Phase 11c's job, not 11a's -
  this phase only makes picks a real, legally-tradeable asset.

## Transactions, news feed & league history

Every trade, free-agent signing, injury, and retirement writes a
`LeagueTransaction` row (`leagueId`, `season`, `type`, `description`,
`createdAt`) inside the same `$transaction`/batch that performs the
underlying mutation, alongside the existing
`Trade`/`TradeAsset`/`Contract`/`SeasonAward` rows. This is deliberately
one denormalized log rather than two separate systems for "transaction
history" and "news feed": a chronological read of the table _is_ the
transaction ledger, and the same `description` string doubles as a news
headline, since there's no meaningful difference between the two views
beyond framing. This is also what makes the league feel alive rather than
user-centric: CPU-CPU trades, CPU signings, and injuries across all 30
teams (see "Around-the-league activity" above) write into this exact same
log, so the feed isn't just a record of the user's own moves.

- **Why pre-rendered descriptions, not reconstructed at read time**: a
  trade or signing's human-readable form (team names, player names, deal
  terms) is fixed at the moment it happens. Reconstructing it from current
  `Trade`/`Contract` state at read time would make old headlines silently
  change if e.g. a traded player is later traded again, or would require
  carrying denormalized snapshots into those tables anyway. Pure
  description-building functions (`src/lib/transactions/describeTransaction.ts`
  — `describeTrade`, `describeSigning`, `describeRetirement`) are called
  once, at write time, and unit-tested in isolation.
- **Why CPU draft picks aren't logged as transactions**: a single draft
  produces 60 picks; logging every CPU pick would flood the feed with
  near-identical noise on draft day and drown out the trades/signings that
  are the interesting events. The draft board (`DraftPick`/`DraftProspect`)
  already serves as that event's own historical record, browsable from the
  draft page itself.
- **League History** (`/leagues/[id]/history`) needed no new logging at
  all — it's a season-by-season read of data Phases 2-3 already produce
  (`PlayoffSeries` round-4 winners, `SeasonAward`, `LeaguePlayer.retiredSeason`)
  that had no browsable UI. The set of "completed" seasons is derived from
  crowned champions (a season only gets a champion, and therefore awards/
  retirements, once `advanceSeasonAction` has run for it), so champions are
  fetched first and used as the season list that awards/retirees are
  grouped into.

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

## Player rating scale

`overallRating`/`potentialRating` run 60-99, matching real NBA 2K ratings
(rostered players almost never dip below 60, true superstars cluster
90-99) rather than a theoretical 0-100 spread - the scale every other
system in this app (contract generation, team strength, player tiers,
draft class generation, development/retirement curves, GM accountability,
trade-AI valuation) reads or recalibrates against.

- **Calibrated against real anchor points**, not invented from scratch:
  `computePerformanceScore` (`src/lib/valuation/playerValue.ts`) is a
  single real-stat-derived score that both `deriveOverallRating`
  (`src/lib/league/ratingFromStats.ts`, real players at league bootstrap)
  and contract generation's `ageAdjustedScore` are built from - one
  scoring function, not two divergent rating systems. Its formula is
  unchanged from the original per-stat weights (points/rebounds/assists/
  etc., anchored around a real ~15ppg/5reb/3ast/24mpg/56%TS statline);
  only its baseline constant (`50` → `72`) and clamp (`[0,100]` →
  `[60,99]`) moved, verified against real 2K24 ratings looked up as
  anchors: Jokić 98; Giannis/LeBron/Embiid/Durant/Curry 96; Dončić/Tatum/
  Butler 95; solid real starters ~77-78; deep bench ~60-71. The exact
  statline that formula treats as its zero point now lands at exactly 72
  (a real low-70s role player in 2K); the same real players' old raw
  scores (Embiid ~88, Tatum ~72 under the old system) land at 99
  (clamped) and ~94 respectively under the new one - both a close match
  to their real ratings, from moving two constants, not rewriting the
  formula's relative judgments.
- **Every other rating-scale-dependent constant moved in lockstep**:
  `scoreToCapFraction`'s `MIDPOINT`/`STEEPNESS` (re-derived, not just
  carried over, so the ceiling/floor still hit the same fraction-of-cap
  targets against the new, narrower input range), `playerValueTier.ts`'s
  five tier boundaries, `generateDraftClass.ts`'s pick-1/pick-60 rating
  anchors, `developPlayerRating.ts`'s clamp bounds, `retirement.ts`'s
  rating-risk cutoffs (re-tied to the ROTATION/STARTER tier boundaries,
  same relationship the old cutoffs had), `expectationLevel.ts`'s
  elite/weak roster-strength thresholds and `teamNeeds.ts`'s/
  `evaluateTradeOffer.ts`'s starter/rotation thresholds (both already
  mirrored `playerValueTier.ts`, kept mirroring it), and
  `FREE_AGENT_RATING_CUTOFF` (`src/lib/actions/league.ts`, now tied to
  the ROTATION/MINIMUM boundary - same "bottom ~15%" intent). None of the
  trade-AI weight _ratios_ (0.4, 0.5, 1.25, 1.75, personality
  multipliers) needed to change - only absolute rating numbers.
- **Existing leagues were backfilled**, not left on the old scale: a
  one-time script rescaled every `LeaguePlayer.overallRating`/
  `potentialRating` in every real (non-test) league using the exact same
  linear transform (`+22`, reclamped to `[60,99]`) rather than
  recomputing from scratch - recomputing would have erased whatever
  development/aging progression a league had already made since
  bootstrap, and can't work at all for fictional draft-generated
  prospects (no real stat line to recompute from). Same backfill
  discipline established after Phase 11a/10d/11c - see
  `docs/IMPLEMENTATION_PLAN.md`.
- **Minutes-normalization fix** (found via a user bug report - a fresh
  Jazz franchise started with only 6 rostered players): `computePerformanceScore`
  originally compared _raw per-game_ counting stats against a baseline
  anchored at 24 minutes, and separately penalized low minutes via a
  standalone linear term - double-penalizing any real bench player who
  simply played fewer minutes than a starter, regardless of real
  per-minute quality. Measured against the full 497-player reference
  dataset, this crushed 41.6% of all real players to the exact rating
  floor (60) - nearly the entire league's bench, not the "bottom ~15%"
  `FREE_AGENT_RATING_CUTOFF` was designed around. Fixed by partially
  normalizing counting stats toward a per-36-minutes rate
  (`MINUTES_NORMALIZATION_BLEND = 0.7` - pure per-36 was tried first and
  overcorrected, stripping out too much of the real signal in a star
  playing heavy minutes) with a confidence-shrinkage blend toward a
  `REPLACEMENT_LEVEL_SCORE` (65, not the average 72) for players below
  `CONFIDENCE_MINUTES` (16) - small-sample garbage-time stats are noisy
  and shouldn't be trusted outright. This alone was found (by hand-testing
  real anchor players) to under-rate high-usage scoring wings (Tatum,
  Curry) relative to shot-blocking bigs (Jokić, Embiid) - an imbalance the
  old formula also had but hid, since both extremes used to simply clamp
  to the same ceiling. Category weights were re-tuned against a broader
  real-anchor set spanning archetypes (playmaking/two-way bigs, scoring
  wings/guards, real rotation players, deep bench) rather than the ~5
  top-scorer examples the original rescale checked - see
  `playerValue.test.ts`'s anchor-player test block for the verified
  set. Result: floor-pileup dropped to 13.1% (close to the original
  design intent), tier distribution spread healthily across all five
  tiers, and per-team roster sizes at the _unchanged_ `FREE_AGENT_RATING_CUTOFF`
  now range 9-16 (avg ~12.7) instead of some real teams bottoming out at
  6-8. Existing leagues were backfilled per-player-delta (not a flat
  shift, since this fix changes the _shape_ of the stats-to-rating
  mapping, not just its scale) - see `docs/IMPLEMENTATION_PLAN.md`'s
  status log for the exact backfill approach. This remains a hand-tuned
  box-score-only heuristic (see "Season stats" below) - a handful of
  real, valuable-but-low-volume/low-efficiency role players (e.g. a true
  3-and-D wing with modest per-36 counting stats) still land near the
  floor, a limitation no amount of weight-tuning on this input set can
  fully resolve without real advanced metrics.

## Player profile

Every player anywhere in the app (`PlayerChip`, `src/components/players/PlayerChip.tsx`)
is clickable and opens the same profile - a slide-out drawer, not a
separate page per surface, so the experience is identical regardless of
where a player was clicked (the dashboard roster, the free-agent board, a
team-browse page, awards/retirements, etc.).

- **A global client-state drawer, not routes or per-page modals**:
  `PlayerProfileProvider` (`src/components/players/PlayerProfileProvider.tsx`)
  is mounted once in the root layout, holds which player (if any) is open,
  and renders the drawer via `createPortal` into `document.body` as a
  sibling of whatever page is currently mounted - it never unmounts the
  page underneath. This is what lets a profile open on top of, say, an
  in-progress trade build without losing any selection state, without
  needing Next.js parallel/intercepting routes (a heavier mechanism with
  real edge cases around static generation - `/teams/[abbreviation]` is
  statically generated - that wasn't worth the risk for this). No
  URL/query-param syncing - this is a UI overlay, not a navigable route.
  `/players/[id]` remains as a plain, directly-linkable fallback for
  anyone who lands there another way (a bookmark, a shared link), built on
  the exact same loader and content-rendering component so there's only
  one implementation of "what a profile looks like."
- **One data shape, two identities**: `src/lib/players/profileData.ts`
  exports a single `PlayerProfileData` shape with two loaders -
  `loadLeaguePlayerProfile` (the rich case: rating, contract, injuries,
  awards, all scoped to one league save) and `loadReferencePlayerProfile`
  (team-browse pages with no league context - bio, real stats, and the
  same live valuation `/players/[id]` always showed, with
  `leagueContext`/`contract`/`awards` simply empty rather than a
  different component tree). Fictional draft-generated prospects are
  deliberately not routed through this at all - no real-world identity to
  show a profile for, and their existing inline scouting-report accordion
  in `DraftExperience` already serves that role for a context with no
  contract/awards/injury history to show anyway.
- **`getPlayerProfileAction`** (`src/lib/actions/players.ts`) is the one
  Server Action the client-side provider calls to fetch a profile - unlike
  most actions in this app, it never `redirect()`s on failure, since it's
  invoked from an overlay that might be open on top of in-progress work;
  callers show an inline error instead.
- **Tabs, not a single scrolling page or an accordion**: `PlayerProfileContent`
  renders Overview/Ratings/Stats/Contract/Career/Awards/Injuries as a tab
  bar (reusing `DraftExperience`'s existing pill-filter visual language) -
  a user reopening a card mid-trade-negotiation wants one specific thing
  fast, repeatedly, not a document to scroll through once.
- **A real React Compiler lint catch during this work**: the natural first
  draft of the data-fetching effect (`useState` for loading/error/data,
  reset via `setState` calls at the top of the effect body on every
  identity change) tripped `react-hooks/set-state-in-effect` - synchronous
  `setState` in an effect body causes an extra cascading render before the
  async work even starts. Fixed by keying an inner
  `PlayerProfileDrawerBody` component on the player identity instead - a
  fresh mount always starts at its initial `loading` state for free, so
  the effect only ever calls `setState` from inside the async
  `.then`/`.catch` callbacks, never synchronously in the effect body.
- **`TradeBuilder` needed a real click-conflict resolution, not just
  wiring**: its roster rows already had a click target - the row toggles
  which players/picks are on the table via a checkbox, previously wrapped
  in a `<label>` so clicking anywhere in the row (including the name)
  toggled selection. Simply swapping the name for a `PlayerChip` (a nested
  `<button>`) inside that `<label>` would have made every click both open
  the profile _and_ toggle the trade selection - two conflicting actions
  from one click. Fixed by dropping the `<label>` for a plain row `div`
  whose own `onClick` toggles selection, with `e.stopPropagation()` on
  both the checkbox and the `PlayerChip` wrapper so each intercepts its own
  click before it reaches the row: clicking the avatar/name opens the
  profile only, clicking anywhere else on the row (or the checkbox itself)
  toggles selection only. Verified visually that opening a profile
  mid-trade-build leaves every current selection untouched underneath.
- **Draft-board avatar polish, not a profile**: `DraftExperience`'s
  picker, live draft board, and scouting board now show a `PlayerAvatar`
  next to every prospect's name for visual consistency with the rest of
  the app - but always with `photoUrl={null}` (initials-only), since
  `DraftProspect` is a fictional, league-generated record with no
  real-world identity or photo. These prospects deliberately still don't
  open the profile drawer (see above) - the avatar is cosmetic, not a
  second, smaller feature.

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
  than a confident guess. `Player.currentTeamId` (and the `teamAbbreviation`
  it's derived from in `players.json`) is deliberately kept **season-accurate
  to 2023-24**, not balldontlie's live "current team" - `scripts/import-players.ts`
  prefers the season-stats fixture's own `team` field over `bio.team`. This
  was originally the other way around (preferring balldontlie's current
  team) and was found to be a real, simulation-affecting bug, not just a
  cosmetic one: `currentTeamId` is exactly what `createLeagueAction`/`seed.ts`
  use to decide which team a new league starts a player on, so a handful of
  players traded in real life since 2023-24 (e.g. Luka Dončić to the Lakers
  in Feb 2025) were showing up on their _current_ real team instead of the
  team their actual 2023-24 stat line belongs to - scrambling several
  teams' opening-day rosters against the season the whole simulator is
  built on (surfaced by a user starting a new Jazz franchise with only 6
  rostered players, several of whom weren't real 2023-24 Jazz players at
  all). Fixed by preferring the stats fixture's team; see
  `prisma/data/players.test.ts`'s Dončić/Jokić cases for the exact
  regression coverage.
- **Player headshots** (`Player.photoUrl`): programmatic, not hand-curated
  - the user explicitly rejected a `teams.ts`-style manually-assigned URL
    list for 497 players as unmaintainable. `src/lib/data-sources/espnPlayerPhoto.ts`
    resolves each real player's name against ESPN's public, unauthenticated
    search API (`site.web.api.espn.com/apis/common/v3/search`) to an ESPN
    athlete id (exact normalized-name match preferred, falling back to the
    top result flagged "fuzzy" for a quick spot-check), then verifies
    `a.espncdn.com/i/headshots/nba/players/full/{id}.png` actually resolves
    (a real `200`, not a 404) before trusting it - same "verify in a real
    browser, not just curl" discipline as the team-logo Wikipedia switch.
    `scripts/resolve-player-photos.ts` runs this once (checkpointed to
    `.data-import/`, same resumable pattern as `import-players.ts`) and
    writes the resolved URL back into `players.json`, which flows into the
    DB through the exact same `seedPlayers()` upsert as every other bio
    field - resolved 468/497 real players (94%) on the first pass, only 2
    fuzzy matches (both known name-alias cases already handled elsewhere:
    Vezenkov, Hyland). Fictional draft-generated prospects never get a real
    photo (no real-world identity to look up) - `PlayerAvatar`
    (`src/components/players/PlayerAvatar.tsx`) always falls back to a
    polished initials-on-gradient placeholder for them, and gracefully for
    any real player whose photo fails to load (an `onError` handler, not
    just a missing `photoUrl`) - a real, permanent visual treatment, never a
    broken `<img>`.
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
exists.

**Multiple franchises per user**: a user can run up to `MAX_LEAGUES_PER_USER`
(5, `src/lib/league/constants.ts`) independent franchises at once and
switch between them from `/leagues` (the hub). This was a small change in
practice - every league-scoped page already authorized by `league.id` in
the URL plus an ownership check, never by "the one league this user has,"
so the only real work was: (1) removing `createLeagueAction`'s old
"redirect to the existing league" behavior in favor of a soft cap check,
(2) the `/leagues` hub page itself (lists every franchise as a card with
a live status - "Playoffs underway," "Draft pending," etc. - computed the
same way each individual feature page already gates its own actions),
and (3) `createLeagueAction` now calls `revalidatePath("/leagues")`
before its redirect - without it, a real (and initially confusing) bug
surfaced: Next.js's client-side link-prefetch cache for the hub can serve
a stale "you have no franchises yet" snapshot from before the league was
created for up to its default cache window, since only the redirect
target's cache was being invalidated, not the hub's. The cap itself
(`MAX_LEAGUES_PER_USER`) is a soft guard against unbounded DB growth (each
franchise bootstraps ~500+ rows), not a real product limit.

**The `/leagues` hub as a dashboard**: the same route that lists a user's
franchises also doubles as the signed-in landing page (both the sign-in
redirect and the "My Leagues" nav link point here), so it was extended
into a proper "starting point" rather than staying a bare franchise list:
a personalized greeting, franchise cards with color-coded status badges,
a cross-league "Recent activity" feed, and an "Explore" section linking
to site-wide pages (`/teams`, the engineering write-up). The activity
feed is the one genuinely new piece of infrastructure here - every other
transaction/news view (`/leagues/[id]/transactions`) is scoped to a
single league, so this is the first place anything queries
`LeagueTransaction` across _all_ of a user's leagues at once
(`leagueId: { in: [...] }`), giving a "what changed since I was last
here" pulse spanning every save rather than requiring the user to click
into each franchise individually to notice new trades/injuries/signings.

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
