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
- **Schedule** (`generateSchedule.ts`): a real-NBA-weighted 82-game season
  (1,230 games league-wide) - 4 division rivals x4 games (16) + 10
  same-conference non-division opponents split 6x4/4x3 (36) + 15
  other-conference opponents x2 (30) = 82. The 6-of-10/4-of-10 split is
  exact and symmetric by construction, not approximated: the
  "non-division same-conference" relationship between any two divisions
  (5 teams each) is a complete bipartite graph K(5,5), which decomposes
  into exactly 5 perfect matchings; selecting 3 of the 5 as "4-game" and
  the other 2 as "3-game" makes every team's degree work out to
  `3+3=6` four-game opponents and `2+2=4` three-game opponents (solving
  `a+b=6, a+c=6, b+c=6` across a conference's 3 division-pair
  relationships gives `a=b=c=3`) - no general regular-graph search needed.
- **Season calendar** (`dayIndex`): each `Game` gets a sequential
  day-of-season index (not a real `DateTime`), assigned by a
  capacity-and-eligibility-constrained day-by-day loop - not a random
  greedy chain. A first-draft "shuffle games, then
  `day = max(lastDayOfEitherTeam) + 1 + jitter`" approach was considered
  and rejected: it has no season-length target, no control over
  back-to-back frequency, and no mechanism keeping all 30 teams finishing
  near the same day. Since the calendar is meant to be a foundation for
  future date-sensitive systems (All-Star break, trade deadline, fatigue,
  injury recovery timing), it needs real temporal structure instead:
  a team may not play 3 days in a row (caps back-to-backs at one, like
  modern real NBA scheduling), and each day fills up to a target game
  count (derived from total games / a ~175-day target season length),
  prioritizing pairs where a team is furthest behind on its remaining
  games - this actively keeps all 30 teams finishing close together
  rather than drifting apart. Empirically: a full season lands around
  150-160 days, teams finish within a few days of each other, and
  back-to-backs land in a realistic (if slightly high) per-team range.
  `gameNumber` is derived by sorting the finished schedule by `dayIndex`
  and renumbering sequentially, so existing simulation code (which
  resolves games in `gameNumber` order) automatically processes them in
  true chronological order with no changes needed there.
  `Game.dayIndex` is nullable - existing mid-season leagues (generated by
  the old algorithm) keep their schedule as-is rather than a destructive
  regeneration; only new leagues and new seasons (via `advanceSeasonAction`)
  get a day-indexed schedule. The schedule calendar page (below) shows
  "calendar available starting next season" for games with no `dayIndex`
  instead of fabricating dates for old data.
- **Monthly schedule calendar** (`/leagues/[id]/schedule`,
  `src/lib/calendar/seasonCalendar.ts`): `dayIndex` is a sequential
  integer, not a real date - `dayIndexToDate(season, dayIndex)` is a new,
  small, purely presentational mapping (anchors `dayIndex === 1` to
  October 24 of `season` and adds days from there) that turns it into a
  real `Date` for display only. It never writes to `dayIndex`, `Game`, or
  any simulation/ordering path - moving the anchor date only changes what
  a game _displays_ as, never simulation order or `gameNumber`. Every
  existing league gets this automatically for its current season with no
  migration, since it only reads data every league already has. Replaced
  the previous vertical "Day N" list (`SeasonCalendar.tsx`, removed) with
  a real Sun-Sat monthly grid (`buildMonthGrid`) showing the opponent's
  logo faded in the background of each game cell, a vs/@ indicator, and -
  once simulated - a W/L overlay with the final score; rest days render
  as plain empty cells instead of "N days rest" text. Playoff/play-in
  games stay out of scope here, matching the feature's original scope -
  they have their own dedicated bracket page.
- **Animated simulation reveal** (`ScheduleExperience.tsx`): the schedule
  page has its own "Sim Next Game"/"Sim Next 10 Games" controls (the
  Standings page's `SimulateControls` are untouched and still work
  identically - both remain valid ways to advance the season) that reveal
  results on the calendar one game at a time instead of jumping straight
  to the final state. `simulateGamesAction` already resolved every game's
  final score internally before this - it just discarded that detail; it
  now also returns `myCompletedGames` (the user's own team's newly-
  resolved games, in day order, capturing detail already computed inline
  in the existing per-game loop - no new simulation logic). The client
  reveals them with a short delay between each (the same `REVEAL_DELAY_MS`
  pacing the draft's pick-by-pick animation already established in
  `DraftExperience.tsx`), advancing the visible "today" marker and, when a
  reveal crosses a month boundary, the displayed month itself
  (`MonthlyScheduleCalendar`'s `monthIndex` is a controlled prop for
  exactly this reason - `ScheduleExperience` drives it during a reveal,
  manual Prev/Next still works identically otherwise).
- **Simulating games is team-centric** (`simulateGamesAction`): the user
  picks "Sim Next Game" or "Sim Next 10 Games" - the action advances
  until _their own_ team has completed that many more games, resolving
  every other team's games in that window automatically. Internally this
  wraps the exact same per-chunk simulate/persist/injury-event logic the
  old league-wide batch API used (still bounded to 50 raw `Game` rows per
  inner chunk, for the same serverless-timeout reason below) in a loop
  that keeps pulling chunks - in chronological `gameNumber` order, now
  that it's derived from `dayIndex` - until the user's own team's
  resolved-game count within that call reaches the target, or the season
  runs out of games. No new simulation/injury/strength logic was added;
  only the stopping condition changed.
- Each inner chunk is still bounded (never "the whole season" in one
  request) - simulating all ~1,230 league-wide games in a single
  serverless invocation risks a function timeout.
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

## Player box scores

`simulateGame.ts` decides who wins and the final score - it stays
authoritative. `src/lib/simulation/boxScore.ts` (Phase 14a) answers a
different question: given that already-fixed result, what did each
player's individual stat line plausibly look like? This is the
foundation everything else asked for (league leaders, real award races,
milestones, a living news feed) needs, since previously there was no
player-level game data at all - only a static, frozen real-2023-24 stat
line per real player, never updated as a league's seasons progress, and
nonexistent for fictional draft-generated prospects.

- **Still lightweight, not possession-by-possession** - same philosophy
  as `simulateGame.ts` itself. No shot clock, no play-by-play; a
  statistical generator that produces a believable box score, not a game
  engine.
- **Minutes allocation** (`allocateMinutes`): a starting five (best
  rated player per position, backfilled positionlessly if a roster lacks
  one), ranked bench behind them capped at a 12-man rotation (anyone
  past that is a scratch), per-rank minute weights tapering from starters
  through a 6th-man bump down to deep bench, with real game-to-game
  variance and a real chance of a deep-bench DNP-CD. A blowout (margin
  already known - this runs right after `simulateGame`) shifts real
  minutes from starters to bench on both teams, same as a real NBA
  garbage-time substitution pattern.
- **Two ways to derive a player's per-36 rate priors**: a real player
  (has a seeded real `PlayerSeasonStat` row) has their real per-36 line
  scaled by how far their _current_ league-save `overallRating` has
  drifted from what `deriveOverallRating` would compute fresh from that
  same frozen real line right now - that function is already exactly how
  their rating was first derived, so "rating at creation" never needs to
  be stored, just recomputed on demand. This is what makes a player's
  simulated production actually move as they develop or decline within a
  league, instead of staying frozen to their real 2023-24 numbers
  forever. A fictional player (rating + position only, no real baseline)
  uses a small hand-authored per-position archetype table anchored at the
  same rating-72 "average starter" point `playerValue.ts` already uses -
  same spirit as that model's own hand-tuned-against-real-anchors
  weights, not a fitted model.
- **Variance is asymmetric on purpose**: one shared "hot/cold" factor per
  player per game applies mostly to shot volume, only lightly to shooting
  efficiency - a big scoring night reads as "took more shots," not "same
  shots, an implausibly better percentage." Makes are generated as
  independent per-attempt draws at the player's own (varied) rate, so
  every made/attempted line is always internally consistent.
- **Reconciliation to the team's already-decided score**: every player's
  raw points are generated independently first; attempts (not points
  directly) are then proportionally rescaled down toward the team target
  so the makes/attempted identity stays legal, and makes are re-rolled on
  the rescaled attempts - landing the summed total very close to the real
  target on its own. Attempts are floored (not rounded) during that
  rescale specifically so the residual almost always comes out
  non-negative, since a positive residual is trivially resolved by adding
  free throws (always available, no upper bound) - the rare case where
  variance still overshoots falls back to removing a made free throw, or
  downgrading a made three to a made two. Rebounds/assists are left
  independently generated (real NBA team totals for these already vary
  widely game to game) with only a soft guardrail pulling an implausible
  team total back into a believable band.
- **A star's realized box score is a share of a fixed team total, not an
  independent readout of their own prior** - worth calling out explicitly
  since it's easy to expect otherwise. Team scores are decided externally
  by `simulateGame` before box scores exist; reconciliation distributes
  that fixed total across whoever played, so a player's exact final line
  depends on their generated share relative to their teammates', not
  purely their own input rate in isolation.
- **Explicit boundaries for this phase** (documented, not oversights):
  no fatigue/back-to-back modeling - `Game.gameNumber` is a single
  shuffled index across the whole season with no calendar/day concept, so
  there's no real signal today for "did this team just play last night";
  approximating one onto a schedule never designed for it would be
  guesswork. Box scores don't yet feed back into `overallRating`/player
  development - a real future capability, but wiring it touches the
  already-tuned rating/development engine and deserves its own dedicated
  pass. Play-in and playoff games (`src/lib/actions/playoffs.ts`) don't
  generate box scores yet either - only `simulateGamesAction`'s regular-
  season pipeline does, for now.
- **Where it plugs in**: `computeLeagueTeamStrengths`
  (`src/lib/actions/leagueTeamStrength.ts`) was extended to fetch full
  roster detail (position, rating, real stat baseline) in the same query
  it already used for team-strength numbers, rather than adding a second
  round trip. `simulateGamesAction` generates a box score right after
  each game's `simulateGame` call, using that same pre-batch roster
  snapshot `applyLeagueEvents` already treats as locked for the whole
  batch - an injury rolled mid-batch must not affect a box score any more
  than it already doesn't affect that batch's win probabilities. All of a
  batch's rows are written in one `prisma.playerGameStat.createMany`
  alongside the existing `Game`/`LeagueTeam` updates.
- **Where it's visible today**: the player profile drawer's Stats tab
  (Phase 13b) now shows a live, real "This league" season average and
  recent-game log sourced from `PlayerGameStat`, sitting above the
  existing frozen real-world 2023-24 baseline for comparison - the first
  visible surface built on this data, with league leaders, milestones,
  and real award races to follow.

## Rotation Management

A fresh, extensive user request (see `docs/FEATURE_REQUESTS.md`'s Rotation
Management entry for the full original ask, and its Status section for
what shipped). Explicitly invoked the architecture-overlap-review protocol
before any implementation, and the user made one binding follow-up
decision after that review: win probability must reflect the rotation, but
`computeTeamStrength` must stay byte-identical for its other consumers.
Satisfies Roadmap items #28 (Depth Chart Management), #29 (Rotation
Management), and #33 (Player Roles, as a derived byproduct).

- **The automatic rotation engine already existed - the work was making it
  overridable, not duplicating it.** `buildRotation`/`allocateMinutes`
  (`src/lib/simulation/boxScore.ts`) already ranked a healthy roster and
  split 240 team-minutes by a fixed per-rank curve
  (`RANK_MINUTE_WEIGHTS`), with natural triangular variance, garbage-time
  adjustment, and Head Coach `benchTrustDelta`/`threePaMultiplier`
  modulation layered on top. `buildRotation` moved to
  `src/lib/rotation/autoRotation.ts` (renamed `buildAutoRotation`, byte-
  for-byte unchanged) to avoid a circular import, and a new
  `src/lib/rotation/resolveRotation.ts` sits in front of it: if nobody on
  the roster has a custom `rotationSlot`, it returns exactly what
  `buildAutoRotation` always returned - verified by a dedicated
  equivalence test, since every CPU team relies on this holding forever.
  Otherwise, explicitly-slotted players take their exact depth position,
  the unslotted remainder auto-ranks into whatever numeric slots are still
  open (the "fill gaps, don't disturb what's set" behavior a newly-traded-
  for or newly-healthy player needs), and `allocateMinutes` uses a
  player's `targetMinutesPerGame` as the new base weight feeding the
  _same_ variance/garbage-time/coach pipeline instead of always falling
  back to the rank curve - this is what makes an assigned "34 minutes"
  vary naturally rather than being rigid.
- **A real bug, caught by writing the test the plan promised.** The plan's
  backward-compatibility invariant demanded a unit test proving
  `allocateMinutes` was unchanged when uncustomized - writing the test for
  the _customized_ case first surfaced that a user's absolute
  `targetMinutesPerGame` (e.g. 34) was being used directly as a weight
  alongside `RANK_MINUTE_WEIGHTS`'s own small relative values (~0.08-1.42),
  letting one custom player's raw minute count dominate the whole team's
  240-minute normalization and starve everyone else. Fixed with an
  explicit `WEIGHT_PER_MINUTE` conversion constant derived from
  `RANK_MINUTE_WEIGHTS`'s own sum, so a custom target joins the same
  normalization pool on the same scale as the rank-based fallback.
- **Two nullable fields directly on `LeaguePlayer`, not a new model.**
  `rotationSlot: Int?` and `targetMinutesPerGame: Int?` mirror the
  `injuryStatus`/`injuryReturnsAtGamesPlayed` precedent (a small, optional,
  genuinely per-player-per-team attribute) rather than the Staff/AllStar
  precedent (a new model, used specifically where the _shape_ - many-per-
  season achievement records - didn't fit `LeaguePlayer`). `null` on both
  is exactly the prior automatic behavior, so no backfill was needed:
  every existing save and every CPU team (which never gets custom values)
  continues unchanged forever. Every roster-transfer call site (both
  sides of a user trade, a user free-agent signing, CPU-CPU trades and
  signings, a contract expiring or a player retiring at the season
  boundary) resets both fields to `null` when a player's team changes, so
  a stale depth-chart number from an old team never collides with a new
  team's numbering.
- **Injury-aware redistribution is free, by construction.**
  `computeLeagueTeamStrengths` already queried only `injuryStatus:
"HEALTHY"` players before this feature existed, so an injured player
  never reached `buildRotation`/`allocateMinutes` at all. Nothing new
  needed to change: a persisted rotation is keyed by `leaguePlayerId`, the
  engine simply never sees whoever isn't currently healthy, and the
  existing weight-normalization math re-spreads their minutes across
  everyone else automatically. Their own stored slot/target is never
  touched by an injury, so it resumes exactly where it was on return -
  and any _other_ players' slots the user deliberately changed in the
  meantime are left alone too, since nothing auto-rewrites them either.
- **The roster-talent vs. active-game-strength split.** Per the user's
  explicit instruction, `computeTeamStrength`
  (`src/lib/simulation/teamStrength.ts`) was not modified - it keeps
  answering "how good is this roster on paper" for every consumer that
  evaluates talent rather than a specific game (`league.ts`'s and
  `offseason.ts`'s `SeasonExpectation` seeding, All-Star Weekend's
  exhibition-squad strength in `allstar/allStarGame.ts`). A new
  `computeRotationAdjustedStrength`
  (`src/lib/rotation/rotationStrength.ts`) answers a different question -
  "how strong is this team tonight, given who's actually playing and for
  how long" - and is used only inside `computeLeagueTeamStrengths`, the
  one function whose output feeds both `simulateGame`'s real win
  probability and `generateBoxScore`'s opponent-strength adjustment (a
  benched star correctly makes that team's box scores read as an easier
  defensive matchup that night too, from the same one swap). For an
  uncustomized roster it delegates straight to `computeTeamStrength` on
  the full roster - not an approximation of it, the literal same call -
  since that function's own top-9-then-flat-bench-weight curve isn't
  numerically identical to `resolveRotation`'s 12-capped, rank-weighted
  curve; only once a user actually customizes a rotation does the newer,
  rotation-aware curve take over, and a player left outside the resolved
  rotation entirely correctly contributes nothing to that night's
  strength.
- **Player development takes real playing time as a modest nudge, not a
  new curve.** `developPlayerRating`
  (`src/lib/development/developPlayerRating.ts`), previously pure age/
  potential/dev-coach-quality, gained an optional `minutesPerGame`
  parameter with the exact same neutral-anchor pattern as the existing
  dev-coach bonus (a "regular rotation player" baseline of 24 MPG, a
  small capped bonus/penalty scaled off distance from it, folded into
  both the young-growth roll and the aging-decline roll). Omitted
  (`undefined`) is a zero-effect no-op, so every existing test kept
  passing unmodified. `offseason.ts` already aggregated real per-player
  season minutes for DPOY/Sixth Man snapshots - that same value is now
  also passed into `developPlayerRating`'s call, no new query.
- **Deliberately out of scope, and why (at the time).** Player-level morale/
  satisfaction reacting to rotation decisions was not built - no such
  system exists anywhere today (only team-level `LeagueTeam.fanHappiness`),
  and the user explicitly said not to invent a parallel one; this was a
  candidate to revisit only if/when a real player-morale system exists.
  **Update:** that system now exists (Player Morale & Personality System,
  `src/lib/morale/`) - `src/lib/actions/rotation.ts` fires a player-level
  morale delta (`computeRoleChangeMoraleDelta`) at the exact same starter/
  bench boundary crossing where the fan-happiness delta above already
  fires, alongside it rather than replacing it.
  Fatigue mechanics were likewise not built (no such system exists, only
  a hypothetical forward-looking doc comment). Playoffs don't generate
  `PlayerGameStat` rows today (win-roll only), so rotation has no
  playoff-game box-score surface - matching existing behavior, not a
  regression. CPU teams keep using `buildAutoRotation` forever, unchanged.
  No new "coach rotation philosophy" field was added - `CoachStyle` and
  `quality` already cover pace and bench trust, and a third coaching dial
  wasn't requested.
- **News, fan engagement, and the UI.** A new `ROTATION_CHANGE`
  `TransactionType` fires only for a genuine starter/bench boundary
  crossing (`rank < 5` flipping before vs. after a save) - detected inside
  `updateRotationAction` (`src/lib/actions/rotation.ts`) by resolving the
  rotation both before and after the edit, never for an interior bench
  reshuffle. Wired into `NewsFeed.tsx`'s category pills and into
  `transactionSentiment.ts`/`fanReactions.ts` the same way every other
  transaction type already is - reading the fixed promotion/demotion
  phrase from `describeRotationChange` to pick a direction, the same
  deterministic-template exception this codebase already established for
  injury-recovery stories. The `/leagues/[id]/rotation` page
  (`src/components/rotation/RotationBoard.tsx`) is a `@dnd-kit`-based
  drag-and-drop depth chart (a new dependency - none existed before,
  chosen as the modern, accessible, actively-maintained option) with
  three sections (Starting Five/Bench Rotation/Out of Rotation), a running
  minutes total that explicitly warns (never blocks) when it doesn't sum
  to 240 - since `allocateMinutes`'s own normalization already
  proportionally rescales whatever's entered - and an "Auto-balance
  minutes" action (added after plan review specifically to address that
  UX concern) that rescales the current draft to exactly 240 client-side
  before saving, so what the user sees is what they get.

## League leaders & milestones (Phase 14b)

Season aggregation and record-keeping built directly on `PlayerGameStat` -
no separate approximation system, per the plan's stated long-term goal of
one underlying data source for every stats-driven feature.

- **`PlayerGameStat.leagueId`** was added (denormalized from `Game`,
  backfilled via a migration joining through `LeaguePlayer` for the rows
  Phase 14a had already created) once it became clear every league-scoped
  stats query - leaders, records, and eventually news - needs a direct
  filter, not a two-step subquery through `LeaguePlayer`. Same
  denormalize-for-cheap-filtering pattern as the `season`/`gameType`
  fields Phase 14a already added.
- **League leaders** (`src/lib/stats/leagueLeaders.ts`,
  `getLeagueLeaders`): one `groupBy` over `PlayerGameStat` per
  league-season computes every category's aggregate in a single query,
  then sorts/slices per category in memory rather than issuing 7 separate
  top-N queries. Per-game categories (PPG/RPG/APG/SPG/BPG) require a
  minimum games-played threshold before a player can lead a board - a
  single 50-point night in game 1 shouldn't crown a scoring champion, the
  same "small sample is noise" principle the valuation model's own
  confidence-shrinkage already applies. Shooting-percentage categories
  similarly require a minimum attempt volume, so a 2-for-2 shooter can't
  top the FG% leaderboard. Surfaced at `/leagues/[id]/leaders`, added to
  the dashboard's nav row alongside the other league tabs.
- **Milestones** (`src/lib/stats/milestones.ts`): pure, unit-tested
  detection functions decoupled from Prisma's shape - `isDoubleDouble`/
  `isTripleDouble` (double-digit count across all five box-score
  categories, not just the classic three), `scoringMilestone` (highest of
  40/50/60+ points reached), and `computeCareerHighs` (per-category max
  across a player's full known game log in this league). These are
  deliberately generic functions over a plain `StatLine` shape, not
  actions - built to be reused by the news system once it starts
  generating milestone-triggered stories, not just the profile display
  that consumes them today.
- **Where it's visible today**: the player profile drawer's Stats tab
  now shows a "Career highs (this league)" box, and each recent game in
  the log gets an inline badge when it was a triple-double or crossed a
  scoring milestone - real detection against real simulated performances,
  not flavor text.

## Real award races (Phase 14c)

`src/lib/development/seasonAwards.ts` originally excluded
Defensive Player of the Year and Sixth Man of the Year outright - its own
comment said so - because the engine had no individual defensive or
bench-usage data to back them honestly. Once Phase 14a/14b's real box
scores existed, that was no longer true, so this phase unblocks exactly
that documented limitation. MVP/ROY/MIP are untouched - already tuned,
already tested, no reason to disturb them.

- **`computeDefensivePlayerOfTheYear`**: per-36 steals/blocks/rebounds
  (the only defensive box-score stats this lightweight engine tracks -
  no opponent-shooting or on/off data, an honestly narrow slice of
  defensive value, not a claim of a complete defensive rating), gated by
  a minimum games-played threshold so an early hot streak can't be
  mistaken for a real defensive season.
- **`computeSixthManOfTheYear`**: reuses `computePerformanceScore` - the
  same tested composite the valuation model already uses - fed a
  player's real simulated season averages instead of the frozen
  real-world baseline. Eligibility requires enough games played and an
  average-minutes ceiling as a bench-role proxy, since there's no
  persisted starter/bench flag (box-score minutes are generated per game,
  not stored as a role) - an honestly-documented approximation, not a
  real starter/bench distinction.
- **Wired into `advanceSeasonAction`** (`src/lib/actions/offseason.ts`):
  one `groupBy` over `PlayerGameStat` for the season just completed
  builds both award functions' input snapshots, including a real
  true-shooting-percentage calculation (`points / (2 * (FGA + 0.44*FTA))`)
  from actual season sums - not an approximation standing in for a
  missing input.
- **Live award race, not just a season-end snapshot**
  (`src/lib/stats/awardRace.ts`, `getLiveAwardRace`): "if the season
  ended today" standings for MVP/DPOY/6MOY/ROY, computed by the exact
  same functions the real season-end awards use, fed live in-progress
  aggregates instead of final ones - one shared implementation, not a
  parallel approximation for the in-season view. Most Improved Player is
  deliberately excluded from the live race: rating only ever changes at a
  season transition in this engine, so there's no meaningful
  "improvement so far" signal to show mid-season - honestly omitted
  rather than displaying a number that would always read as zero.
  Surfaced as an "Award race" section on the league leaders page.
- **A real, unrelated e2e fragility surfaced and fixed along the way**:
  `free-agency.spec.ts` extracted a signed player's name via
  `.textContent()` on a table cell that (since Phase 13b) contains a
  `PlayerChip` - when that specific player has no real photo, the
  avatar's initials fallback and the name text concatenate in the
  extracted string (e.g. "DNDaishen Nix"). Same root cause as an
  already-fixed locator issue elsewhere; fixed the same way, by
  targeting the name's own `<span>` instead of the whole cell.

## Real, box-score-driven news (Phase 14d)

Per explicit direction: the news feed grows onto real simulated events
incrementally, extending `LeagueTransaction` rather than replacing it -
every category still corresponds to an actual thing that happened in the
simulation, never an invented one. Coaching changes, contract extensions,
waivers, and buyouts remain out of scope entirely (see Phase 14 context)
since none of those mechanics exist yet - "modular, event-driven" means
new categories activate only once their underlying mechanic is real.

- **Importance, applied everywhere, not just new categories**
  (`src/lib/transactions/newsImportance.ts`): `NewsImportance`
  (MINOR/STANDARD/MAJOR/BREAKING) reuses `getPlayerValueTier`'s existing
  rating boundaries - a superstar involved makes a story MAJOR, a star
  STANDARD, everyone else MINOR - rather than a second threshold system.
  Retrofitted onto every existing category (trades, signings,
  retirements, injuries), not just the new ones: a trade's importance is
  the highest tier among every player involved
  (`highestImportance`), an injury's is duration-based (the only real
  severity signal that roll produces), a retirement's is the retiring
  player's rating at the time. Pre-existing rows were backfilled to
  STANDARD - there's no way to reconstruct a truer value for a
  transaction that's already been written.
- **Real per-game news** (`src/lib/transactions/describeGameEvents.ts`,
  pure and unit-tested): `describeMilestoneGame` reuses Phase 14b's own
  `isTripleDouble`/`scoringMilestone` detectors - the exact same
  functions the player profile's badges already use, not a second
  implementation. `describeWinStreak` reads a new
  `LeagueTeam.currentStreak` counter (positive = win streak, negative =
  loss streak, reset to 0 each season alongside wins/losses) and fires
  only on the exact game a real threshold (5, 10, then every 5 beyond) is
  first crossed - not every game past it, so a team running from 10 to 15
  straight wins without stopping still gets both stories, not a flood of
  identical ones in between. `describeGameResult` covers upsets (a real
  win-probability underdog) and blowouts, calibrated against
  `simulateGame.ts`'s own fixed 3-22 margin range rather than a
  real-NBA-scale threshold that this lightweight engine could never
  actually produce.
- **A real, empirically-driven tuning pass, not a guess left unchecked**:
  the first version generated a `GAME_RESULT` story for every game that
  merely cleared a threshold - simulating a real multi-batch season
  showed this flooded the feed (a large fraction of a 50-game batch
  naturally clears a "notable" margin or upset-probability bar once
  actually run against real data, since this engine's margin range is
  narrow and team-strength mismatches are common league-wide). Fixed by
  ranking every batch's qualifying candidates by how extreme they were
  and keeping only the batch's most notable few
  (`topRanked` in `simulateGamesAction`, scaling with batch size) -
  the same principle real sports coverage already follows: report the
  day's headline results, not literally every game that beat a bar.
  Applied to both `GAME_RESULT` and `GAME_MILESTONE` as a defensive
  measure. This is exactly the kind of thing that can't be caught by
  reading the code alone - only found by actually running it against a
  real, sizable batch of simulated games and looking at what came out.
- **Where it plugs in**: `simulateGamesAction` tracks each game's streak
  update and box-score milestones inline in its existing per-game loop
  (reusing the same roster/team-label lookups already built for box-score
  generation), then persists everything in the same batched
  `Promise.all` as the `Game`/`LeagueTeam`/`PlayerGameStat` writes -
  no extra round trips.
- **News page**: the transactions page's existing type badges gained
  three new categories (Milestone/Streak/Game), and rows now get a
  colored left border for MAJOR/BREAKING stories plus an explicit
  "Breaking" tag for the rarest tier - MINOR/STANDARD stay visually
  identical to the plain feed this always was, so the genuinely
  significant stuff is what actually stands out.

## News page: filtering, search, and real awards (Phase 14e)

The last piece of the original ask - category/team/search filtering on
top of the real feed the earlier 14b-14d phases built.

- **`LeagueTransaction.teamIds`** (a Postgres `String[]`, not a join
  table - no need for referential integrity on these, only cheap
  `includes` filtering): every team substantively involved in a story (2
  for a trade/game, 1 for a signing/injury/award/streak). Populated at
  every write site across `trade.ts`, `freeagency.ts`, `leagueEvents.ts`,
  `offseason.ts`, and `simulation.ts` - existing rows default to an empty
  array, since there's no reliable way to reconstruct team involvement
  from a free-text description alone (same forward-only precedent as
  every other backfill-averse migration in this project). This is what
  makes a real "My Team" filter possible for the first time - before this,
  team association only existed as unstructured text inside `description`.
- **A real `AWARD` category, not a new source of truth**: season-end
  awards (MVP/ROY/MIP/DPOY/6MOY) were already computed and stored in
  `SeasonAward` since Phase 14c, but never announced as news. Now
  `advanceSeasonAction` also writes a `LeagueTransaction` per award,
  built directly from the same `awardRows` just persisted (no second
  computation) and the already-fetched `leaguePlayers` list (no second
  query) - reusing `importanceForRating` for consistency with every
  other category.
- **`NewsFeed`** (`src/components/news/NewsFeed.tsx`): a client component
  receiving the server-fetched, already-capped-at-200 list as a prop and
  filtering entirely in memory - category pills, a "My Team" toggle, and
  a live text search, all combined with AND logic, no server round-trip
  per keystroke or click. This is the same "filter a preloaded list"
  convention `DraftExperience` already established, chosen over a
  `searchParams`-driven server refetch since the underlying dataset is
  already small and bounded - there was no reason to introduce a second,
  heavier filtering pattern for what's fundamentally the same shape of
  problem.
- **Category set reflects exactly what has real backing** - Trades, Free
  Agency, Staff, Retirements, Injuries, Awards, Milestones, Streaks, Games,
  Ownership, plus All and My Team. Categories the original request asked
  for that still have no real mechanic behind them (Contracts-
  as-a-distinct-mechanic, Rumors, Draft, Standings-as-its-own-story-type,
  Records-beyond-what-Milestones-already-covers) are deliberately absent
  - consistent with the standing "no fictional events" instruction this
    entire Phase 14 arc has followed. Nothing architecturally blocks adding
    them later if their underlying mechanic ever becomes real. Coaching
    news was still absent as of this writing, but became real in Phase
    15a (see "Staff management" below) - the `STAFF` category groups both
    `STAFF_HIRE` and `STAFF_FIRE` under one filter pill rather than
    splitting them, the one category that maps to more than one
    `TransactionType`.

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
  recovery window could reference a games-played threshold past the
  season's actual game count, leaving the player stuck "out" forever.
  The move to an 82-game season only widens this safety margin (more
  games than the max ~30-game injury duration relative to before), it
  doesn't tighten it.
- **CPU-CPU trades** (`rollForCpuTrade`): picks two random _non-user_ teams,
  then (as of CPU Autonomous GM Intelligence Phase 2 - see its own section
  below) the first team's needs/identity/personality bias who it targets on
  the second team's roster and what it offers in return, and **both** teams
  must independently `ACCEPT` the same swap via `evaluateTradeOffer` before
  the exact same `validateTrade` the user's own trades go through even
  runs - CPU moves are never a cap-rules shortcut, and now never a
  valuation shortcut either. Falls back to the original uniform-random
  bottom-70%-by-rating pick if nothing eligible fits a recognized need.
  Deliberately **never involves the user's own team** - trading the user's
  players without their consent would break the "you're the GM" premise
  that the whole app is built around; injuries are bad luck that can hit
  anyone, but transactions on the user's roster should only ever happen
  when the user initiates them.
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

## CPU Autonomous GM Intelligence (Phase 1: re-signing, Phase 2: CPU-initiated trades)

Before this phase, `advanceSeasonAction` released every CPU team's
contract-expired player to free agency unconditionally, with zero attempt
by their own team to retain them - over many simulated seasons this
gradually hollowed out CPU rosters. The fix reuses the trade-AI evaluation
engine's own primitives rather than a second valuation system, per the
project's standing "don't build parallel systems" rule (see Trade AI above):

- **`evaluateReSigningDecision`** (`src/lib/gm/reSigningDecision.ts`) scores
  one asset (the expiring player) against one price (their Re-Signing
  Rights ceiling, `computeReSigningMaxOfferCents`) rather than an
  asset-for-asset swap - the one thing `evaluateTradeOffer` genuinely
  can't do unmodified (an empty "outgoing" side breaks its ratio formula).
  It reuses `computePlayerTradeValue`, `GM_PERSONALITY_WEIGHTS`,
  `computeTeamIdentity`/`computeTeamNeeds`, and the exact
  `YOUNG_AGE_THRESHOLD`/`VETERAN_AGE_THRESHOLD`/`CONTENDER_VETERAN_BONUS`/
  `REBUILDING_YOUTH_PICK_BONUS`/`NEED_FIT_BONUS_MULTIPLIER`/`playerFillsNeed`
  symbols `evaluateTradeOffer.ts` exports for this purpose (pure additive
  exports - that file's own behavior/tests are unaffected). It also finally
  activates `badContractSensitivityMultiplier`, a per-personality weight
  that existed in `gmPersonality.ts` but was never read anywhere until now.
- A player's Re-Signing ceiling is built from raw `overallRating`, while
  `computePlayerTradeValue`'s internal fair-value comparison uses
  _age-adjusted_ rating - so an aging player's ceiling looks like a real
  overpay once the age curve applies, without any separate age rule. The
  score is calibrated (`RESIGN_THRESHOLD = 0.35`, verified empirically, not
  by hand) so an ordinary peak-age player is retained by default while a
  genuinely declined one is let go by every personality; a soft ~15-man
  roster ceiling (`SOFT_ROSTER_CEILING`) raises the bar further once a team
  is already fully stocked, so retention can't unboundedly bloat a roster.
- **`advanceSeasonAction`** (`src/lib/actions/offseason.ts`) splits its
  per-player loop into two passes: the first behaves exactly as before for
  every player except a CPU team's own contract-expired one, which is
  deferred into `pendingCpuReSignings` instead of being pushed to
  `playerUpdates` immediately. A second pass (after the loop, once every
  other player's fate is known) computes each affected team's identity/needs
  from its now-certain "sure roster," processes that team's pending
  players best-value-first, and calls `evaluateReSigningDecision` with a
  running roster-size count. A retained player gets a fresh 2-year
  `BIRD_RIGHTS` contract and **keeps their existing rotation slot** (unlike
  a trade or a fresh signing, they never actually change teams, so their
  depth-chart position carries over untouched). The user's own expiring
  players are completely unaffected - still released to free agency
  unconditionally, since the user re-signs them manually via the
  free-agents page.
- Every CPU re-signing writes a real `SIGNING` `LeagueTransaction`, reusing
  `describeSigning` exactly like every other signing already does.
- No cap-legality gate is needed: Re-Signing Rights already permit any
  offer up to this exact ceiling regardless of apron status, and this
  function always offers exactly that ceiling, so legality holds by
  construction. `validateSigning` isn't called at all in this phase.

**Verified** via `src/lib/gm/reSigningDecision.test.ts` (personality/identity
splits on an aging veteran, roster-ceiling effect, need-fit bonus, young
building-block retention) and a hands-on 2-season e2e playthrough: real
stars (Embiid, Haliburton, Brunson, Wembanyama, Trae Young) were correctly
retained by their own teams at realistic contract values, and CPU rosters
grew rather than shrank across seasons. One team dipped to 9 active players
after a season in that run - still fieldable, but a sign that CPU
free-agent _targeting_ (a planned later phase) is what actually backfills
a thin roster; re-signing alone only slows the bleeding, it doesn't add
players.

### Phase 2: CPU-initiated trades

`rollForCpuTrade` (`src/lib/simulation/leagueEvents.ts`) was, before this
phase, pure uniform-random: two random teams, one random bottom-70%-by-
rating player from each, checked only for cap legality. It now reuses the
same trade-AI machinery a user-proposed trade is judged by, instead of a
second valuation path:

- **`pickTradeTarget`** biases _who_ a seeking team goes after: it prefers
  a player who fills one of the seeker's recognized needs
  (`playerFillsNeed`, exported from `evaluateTradeOffer.ts` in Phase 1),
  and among the eligible pool, biases toward veterans for a win-now-postured
  seeker (`CONTENDER`/`PLAYOFF_TEAM` identity, or a personality whose
  `veteranValueMultiplier` exceeds its `youthValueMultiplier`) or toward
  youth for a rebuilding-postured one - reusing the exact
  `YOUNG_AGE_THRESHOLD`/`VETERAN_AGE_THRESHOLD` cutoffs and
  `GM_PERSONALITY_WEIGHTS` `evaluateTradeOffer` already applies, not new
  tuning constants. Picks randomly among the top few qualifying candidates
  (`TOP_CANDIDATE_POOL_SIZE = 3`) rather than a strict best-fit, so CPU
  trades don't feel mechanically identical every time a situation recurs.
- **`pickTradeOffer`** biases _what_ the seeker offers back: a "surplus"
  player (one that does _not_ fill any of the seeker's own needs) whose
  `computePlayerTradeValue` is closest to the target's, so the candidate
  offer is plausible rather than wildly mismatched.
- Both pickers fall back to the original uniform-random bottom-70% pick if
  nothing eligible qualifies - the pre-Phase-2 "background trade noise
  never fully stops" behavior survives as a safety net.
- **Mutual acceptance, not just legality.** Before the existing
  `validateTrade` cap check runs, `evaluateTradeOffer` is called _twice_ -
  once from each team's own perspective on the identical candidate swap -
  and both must independently return `ACCEPT`. This is the concrete
  implementation of "both GMs think they won": nothing new was built to
  judge fairness, the exact function that gates a user's own trades gates
  these too, just asked from both directions instead of one.
- **`maybeExecuteCpuTrade`** (`src/lib/actions/leagueEvents.ts`) supplies
  the extra data this needs almost entirely from queries it already runs:
  `potentialRating`, `injuryStatus`, `careerGamesMissedToInjury`,
  `position`, and age (via the existing `estimateAge` helper) all come off
  Prisma rows the function's existing `include` already fetches. The one
  new query is a small league-wide win/loss `findMany` (≤30 rows) so
  `computeCompetitivenessPercentiles` ranks a team correctly against the
  _whole_ league, not just the CPU subset - consistent with every other
  caller of that function. `needs`/`identity` are computed once per CPU
  team when the roster list is built, not once per search attempt.
- No schema change, no change to how a trade is persisted (`Trade`/
  `TradeAsset` rows and the `leagueTeamId`/`Contract` swap are untouched) -
  this phase is entirely about _which_ swap gets proposed and _whether_
  it's accepted, not how an accepted one is recorded.
- **Scope held deliberately narrow**: still exactly a 1-for-1 player swap,
  still never involves draft picks (`ownedFutureFirstRoundPickSeasons`
  stays hardcoded to `[]`), still gated by the same 0.6%-per-simulated-game
  roll - only the selection logic inside that roll got smarter.

**Verified** via a reworked `src/lib/simulation/leagueEvents.test.ts` (a
team with a recognized need acquires a player who fills it rather than a
random one; a WIN_NOW/CONTENDER seeker and a REBUILDING/PROSPECT_LOVER
seeker target opposite ends of the same age-mixed candidate pool; an
objectively lopsided trade never executes across a spread of rng values)
and a hands-on fast-forwarded season: 4 CPU-CPU trades fired, each a
plausible, roughly value-matched swap (e.g. a 78-overall Zach LaVine
moving for a 73-overall player) rather than an arbitrary bench-for-bench
swap.

**Not yet built** (deferred, later phases): needs-aware CPU free-agent
targeting and non-minimum CPU offers in the general FA pool (Phase 3); a
need-fit tiebreak layered onto the draft's existing best-player-available
sort (Phase 3/4).

## Staff management (Phase 15a)

A deliberately scoped-down foundation, not the full multi-decade coaching
saga the original request described - see the architecture-overlap review
that preceded this phase for the reasoning. Three roles ship in this
phase: **Head Coach**, **Player Development Coach**, **Medical Staff**.
Scouts, Analytics Staff, and a Salary Cap Specialist are deferred - the
Cap Specialist specifically needs a design decision about its relationship
to the existing `GmPersonality` enum (`src/lib/gm/gmPersonality.ts`) before
it's built, since both would otherwise represent overlapping "front-office
philosophy" concepts.

- **No hireable GM role.** The user already _is_ the GM (see "Product
  framing" and "GM accountability" above) - `Staff` only models roles that
  work _for_ the user, never a competing executive role that could be
  hired/fired the way `jobSecurity.ts` already governs the user's own
  seat.
- **Algorithmic generation, not real-world data** (`src/lib/staff/generateStaff.ts`):
  same reasoning as this project's real-contract generation (see "Data
  sourcing" below) - no clean, ToS-safe source of real coach/executive
  bios exists, and a guessed bio would be worse than an honest fictional
  one. `generateStaffMember` draws age/quality/reputation/style from
  weighted ranges seeded per `${leagueId}-${teamId}-${role}` (same
  `createSeededRandom` convention `pickRandomGmPersonality` already
  established), reusing `generateProspectName` rather than a second name
  pool. At league bootstrap (`createLeagueAction`) every team gets one of
  each role plus a small unemployed pool per role to browse immediately.
  **Known cosmetic limitation**: names are drawn from the same finite
  pool draft prospects use, so two unrelated staff members can
  coincidentally share a full name within one league - harmless (each is
  still a distinct `Staff` row with its own id/age/quality), but visible
  if it happens to surface in the UI.
- **`Staff`/`StaffContract` are separate models from `LeaguePlayer`/`Contract`**,
  not nullable/generalized versions of them - `Contract.leaguePlayerId` is
  `@unique` with no discriminator column, and every existing cap/trade
  call site assumes a contract's player always exists. `StaffContract` is
  also deliberately simpler: one flat `annualSalaryCents`, no
  `ContractYear`-equivalent year-by-year structure, and it never counts
  against the player salary cap. A retiring or fired staff member's row
  is genuinely deleted (cascading their contract) rather than kept-but-
  inactive the way `LeaguePlayer.isActive`/`retiredSeason` preserve
  history - there's no staff-history UI in this phase to justify the
  extra state.
- **Three real mechanical hooks, not cosmetic flags**:
  - Head Coach `quality`/`style` feed `computeCoachWinBonus`/
    `computeCoachBoxScoreModifier` (`src/lib/staff/coachModifiers.ts`),
    threaded into `simulateGame.ts` as a small additive win-probability
    term (parallel to the existing `HOME_COURT_ADVANTAGE` constant, never
    touching the reused-elsewhere `computeLeagueTeamStrengths`) and into
    `boxScore.ts` as a bench-trust adjustment plus a per-style 3PA-rate
    multiplier.
  - Player Development Coach `quality` feeds a new
    `developmentCoachQuality` parameter on `developPlayerRating`,
    boosting young-player growth and dampening veteran decline.
  - Medical Staff `quality` feeds new `frequencyFactor`/`durationFactor`
    scaling in `rollForTeamInjury` (`src/lib/simulation/leagueEvents.ts`),
    reducing how often a team's players get hurt and how long they're out.
  - All three hooks share the same **neutral-anchor convention**: quality
    72 (this codebase's existing "average" anchor from `playerValue.ts`),
    `null`, or an unhired role all produce zero effect, so a league with
    no Head Coach hired behaves exactly as the simulation did before this
    phase existed.
- **Season progression lives in `advanceSeasonAction`** (`offseason.ts`),
  in its own loop seeded independently (`${leagueId}-${season}-staff`) so
  adding staff rolls never perturbs an existing league's already-
  deterministic player development. Each offseason: every staff member
  ages a year; `shouldStaffRetire`/`staffRetirementProbability`
  (`src/lib/staff/staffRetirement.ts` - same shape as
  `src/lib/development/retirement.ts`, but coaches trend older before a
  forced retirement than players); expired contracts free the staff
  member; a Head Coach's `reputation` drifts off plain team win%
  (`SeasonExpectation` is user-team-only, so this can't reuse that signal
  for the other 29 teams). **CPU teams auto-backfill** any vacancy from
  the available pool (best-quality-available heuristic, no real bidding
  war) so no CPU team sits with a permanently empty seat; the user's own
  vacancy is never auto-filled.
- **`hireStaffAction`/`fireStaffAction`** (`src/lib/actions/staff.ts`):
  re-validate everything from current DB state (same principle as
  `signFreeAgentAction`). A hire below `computeMinAcceptableStaffOfferCents`
  (`src/lib/staff/hireValidation.ts`, 60% of the algorithmically fair
  salary for that quality) is rejected outright - the user can't lowball a
  95-quality Head Coach for veteran-minimum money. Firing has no cap/cash
  penalty in this phase; a real buyout mechanic is a documented future
  refinement.
- **News**: two new `TransactionType` values, `STAFF_HIRE`/`STAFF_FIRE`,
  written by both the user-initiated actions and CPU auto-backfill hires,
  reusing the existing `teamIds`/`importanceForRating` conventions. This
  is exactly the "new categories activate only once their underlying
  mechanic is real" rule the Phase 14e news system documented above -
  coaching news was listed there as having no real mechanic; it does now.

**Deliberately not in this phase**: Scouts/Analytics/Cap Specialist,
scouting-accuracy uncertainty (`deriveScoutingProfile` stays fully
accurate), real-world coach/executive names, and CPU-vs-CPU competitive
bidding for a specific candidate (CPU teams only fill vacancies from the
pool, they don't yet compete with the user in real time for the same
hire). A Coach of the Year award followed immediately after as Phase 15b -
see below.

### Coach of the Year award (Phase 15b)

`SeasonAward.leaguePlayerId` (used by MVP/ROY/MIP/DPOY/6MOY) is a
required, non-nullable FK straight to `LeaguePlayer` - every existing
award, both the offseason and history pages' render code, and
`advanceSeasonAction`'s `awardNewsRows` news-writing all assume the winner
is a player. Rather than making that field nullable and bolting on an
optional `staffId` (turning every existing award query/render/news site
into a "check which FK is set" branch for the sake of one new category),
this phase adds a **separate `StaffAward` model** - the same precedent
Phase 15a already set for `Staff`/`StaffContract` versus
`LeaguePlayer`/`Contract`.

- **`src/lib/staff/coachOfTheYear.ts`** - `computeCoachOfTheYear`, a pure
  function mirroring `computeMVP`'s shape exactly (small snapshot array
  in, winner-or-null out). Determined purely from team win% - the only
  universal, all-30-teams performance signal available, since
  `SeasonExpectation` (used for the user's own GM accountability) is
  user-team-only. Ties break on coach `quality`.
- Wired into `advanceSeasonAction` alongside the existing award computes,
  reusing `teamWinPctById` (already built for Head Coach reputation
  drift) and `allStaff` (already fetched for the staff loop) - no new
  queries. Eligibility uses each coach's **original** `leagueTeamId` from
  the `allStaff` fetch, not the post-loop `staffUpdates` value, so a coach
  whose contract happens to expire this same offseason still gets credit
  for the season they actually coached.
- Persisted via `prisma.staffAward.create` and announced via the existing
  generic `AWARD` `LeagueTransaction` type (not a new `STAFF_`-prefixed
  type - this is thematically an award, not a roster move), reusing
  `importanceForRating`.
- Displayed alongside the player awards on both the Offseason page and
  League History, using `PlayerAvatar` with `photoUrl={null}` (the same
  convention the Staff page established for coach headshots) instead of
  `PlayerChip`, since coaches aren't `LeaguePlayer`s.

## Franchise finances

A fresh, out-of-band user request (see `docs/FEATURE_REQUESTS.md`'s Franchise
Finances & Business Operations entry). Preceded by an architecture-overlap
review the user agreed with: money's _drivers_ (attendance, popularity,
market, star power, ownership, playoffs, payroll, staff) all already existed,
so finances is built as a **consumer** of them, not a parallel simulation.
The one genuinely net-new piece is a coarse revenue model + per-season P&L +
cash reserve + franchise value. All three phases are built: A (the ledger +
consequence layer), B (the two user levers + investment sinks), and C (CPU
financial restraint + P&L-history polish).

Phase C closes the money→CPU-behavior loop: `financialSpendingResistance`
(cash-keyed, no query) feeds a new optional `financialThresholdMultiplier` on
`evaluateReSigningDecision`, so a CPU team bleeding cash gets pickier about
adding salary. Because the re-signing score is salary-normalized, a higher bar
only cuts _expensive marginal_ retentions - bargains still clear - so it nudges
without crippling (the user's explicit guardrail). CPU investment into the
development/injury systems is **deliberately left neutral**: letting big-market
CPU teams buy PREMIUM facilities would compound a hard-to-balance development
edge over many simulated seasons for little user-visible payoff, so CPU
financial participation stays at revenue/expenses/value/ticket-posture/
spending-restraint - an explicit "don't make the sim worse" scope call.

Phase D (strategic-depth pass) makes money matter at both ends of the
spectrum, still without any parallel ownership system:

- **Emergent owner tax tolerance + escalating loss pressure**
  (`src/lib/finances/ownershipFinance.ts`). A multi-season `FinancialStanding`
  (derived from `FinancialSnapshot` net-income history + cash - no new score)
  modulates the _existing_ owner-confidence machinery: strong standing softens
  a down-season confidence hit, adds a small ongoing goodwill/erosion nudge,
  and **suppresses the payroll-cut directive while the franchise is
  profitable** (`ownerBacksTaxSpending`) - so accumulated financial success
  buys runway to keep an expensive contender together, the thing a winning
  team's cash previously couldn't do. Sustained losses (DISTRESSED) issue a
  one-time "return to profitability" mandate (`League.financialMandateSeason`,
  same lifecycle as the payroll directive) whose ignored-penalty can push the
  GM toward the firing band. This solved the successful-team cash-accumulation
  problem through _ownership dynamics_, not an arbitrary sink; cap/CBA rules
  are still never touched.
- **Franchise icons** (`src/lib/finances/franchiseIcon.ts`). A derived icon
  score - star tier + tenure (`LeaguePlayer.joinedTeamSeason`) + homegrown
  (`LeaguePlayer.homegrown`) + career awards - captures how iconic a player has
  become to _this_ franchise, distinguishing a homegrown decorated legend from
  a deadline rental (never a user-assigned label). The two fields are set at
  every roster-entry point (draft = homegrown; trade/FA = fresh tenure, not
  homegrown; bootstrap/backfill = league start). Icons feed a bounded
  franchise-value premium (`iconValuePremiumFraction`, "value beyond
  production"); trading one away triggers a score-scaled franchise-value +
  fan-happiness hit and an "end of an era" story (`computeIconDepartureImpact`),
  integrating with the existing fan system.
- **UI**: a mid-season P&L projection and ownership-standing card on
  `/finances`, a dashboard financial-mandate warning, investment ROI cost
  labels on the levers, and a franchise-icon badge on the player profile.

Phase B wires the two levers into systems that already existed, each a small
neutral-anchored nudge that's a no-op at the STANDARD default: **ticket
posture** already multiplies gate revenue and now also applies a bounded
season-boundary fan-happiness delta (`TICKET_POSTURE_FAN_DELTA`); **facilities
investment** feeds `developPlayerRating` as a fourth bonus alongside dev
coach/minutes/morale; **medical investment** multiplies into
`rollForTeamInjury`'s existing frequency factor (touching how _often_, never
severity). All three read `INVESTMENT_QUALITY_DELTA`. The user drives their
own team via `BusinessStrategyControls` (a segmented-control client component)
and the server-validated `updateBusinessStrategyAction`; CPU teams get a
market-based ticket posture (`pickCpuTicketPosture`) at bootstrap, with CPU
investment left neutral until Phase C.

- **`src/lib/finances/finances.ts`** is the pure, Prisma-free money model,
  all amounts in cents-as-numbers (a full season tops out well inside JS's
  safe-integer range; the offseason pass converts to `BigInt` only at the
  Prisma boundary). Revenue is four coarse buckets - ticket/gate (arena
  baseline × the existing `computeAttendancePct` × market × ticket posture),
  media/sponsorship (market × popularity, plus a small explicit superstar
  bump), playoff gate (home playoff games × per-game gate, championship
  bonus), and a flat league-distribution floor (boosted for small markets so
  a struggling small-market team can always operate). Expenses reuse the real
  cap engine (`computeCapSheet` total + a simplified over-the-tax-line
  multiplier), staff salaries, the two investment levers, and a flat
  market-scaled operating baseline. `computeFinancialHealth` and
  `computeFranchiseValue` follow the `jobSecurity.ts` bucket-with-label and
  slow-moving-asset patterns respectively.
- **Cap/CBA rules stay authoritative.** Nothing in finances ever grants cap
  space or unlocks a roster move - this is the same deliberate
  "no revenue-buys-cap-space" line the Fan engagement section already drew.
  Money is pressure and consequence: the only mechanical hook in Phase A is a
  small optional `financialHealth` nudge to `computeConfidenceDelta`
  (`src/lib/gm/seasonEvaluation.ts`), exactly mirroring the existing
  `fanHappiness` nudge - a money-losing franchise sharpens a bad-season
  owner-confidence hit, a well-run profitable one softens it.
- **The season P&L runs league-wide** in `advanceSeasonAction`
  (`src/lib/actions/offseason.ts`), right after fan happiness is finalized,
  reusing a shared `computeTeamSeasonFinances` closure so the user-team
  computation feeding the owner nudge and the all-30-teams persistence pass
  can't diverge. Per-season payroll comes from the already-loaded in-memory
  `leaguePlayers` (correct even after the DB contract-expiry cleanup);
  results persist to a per-team `FinancialSnapshot` (mirroring
  `FanHappinessSnapshot`) and roll into `LeagueTeam.cashReserveCents` /
  `franchiseValueCents`. `cashReserveCents` can go negative (debt) but never
  hard-blocks a legal roster move.
- **News, not silent math.** The user's own business recap posts every season
  as a `FINANCIAL_REPORT` `LeagueTransaction`; any team crossing a
  billion-dollar franchise-value boundary posts a `FRANCHISE_MILESTONE` -
  sparse, notable, reusing the existing feed (`src/lib/finances/financeNews.ts`).
- **UI**: `/leagues/[id]/finances` - financial-health status, franchise value
  - league rank, cash reserve, a revenue/expense breakdown for the latest
    season, a "what drives your business" explainer (attendance/popularity/star
    power), and a franchise-value trend chart (`FinancesTrendChart`, same
    recharts client-component convention as `FanHappinessTrendChart`). A compact
    Finances card links from the team dashboard.

## Fan engagement

A fresh, out-of-band user request (not from `docs/FEATURE_ROADMAP.md` - see
`docs/FEATURE_REQUESTS.md`'s Fan Engagement entry for the full original
ask). Preceded by an architecture-overlap review the user explicitly
agreed with: built as a **consumer of existing simulation events**, not a
second event-generation system.

- **`LeagueTeam.fanHappiness`** (0-100, same neutral-start convention as
  `League.ownerConfidence`) is its own model, not a clone of owner
  accountability - fans and ownership weigh success differently (fans
  care about excitement/star power/patience-while-rebuilding, ownership
  cares about spending discipline vs. results). But it **reuses** the
  exact same evaluators wherever the underlying question is the same:
  `src/lib/fans/fanHappiness.ts`'s `computeFanHappinessDelta` takes the
  user's own team's `EvaluationVerdict` (from `evaluateSeason` -
  `SeasonExpectation` is user-team-only, so CPU teams fall back to plain
  team win%, the same split already established for Head Coach reputation
  drift), a transaction-sentiment component, star power (`getPlayerValueTier`
  on the roster's best player), and a small "exciting style of play" nudge
  from the team's Head Coach `CoachStyle`. Reusing `evaluateSeason`'s
  verdict directly is what makes a rebuilding fanbase patient with a
  modest record and a championship-expectation fanbase unforgiving of the
  same record - a low `ExpectationLevel` already reads a modest outcome as
  `MET`/`EXCEEDED` in the existing system, no separate "patience" model
  needed.
- **Fan reactions are a rendering layer over the existing
  `LeagueTransaction` log, not a second event pipeline.**
  `src/lib/fans/transactionSentiment.ts`'s `computeTransactionSentiment`
  reads a team's season transactions (the exact rows `NewsFeed` already
  surfaces) and sums a per-type sentiment weight scaled by the existing
  `NewsImportance` enum - no new event capture. The "reaction feed" itself
  (`src/lib/fans/fanReactions.ts`'s `describeFanReaction`) is generated
  **at render time** from an existing transaction row - deliberately
  conservative, tone-based templated commentary (POSITIVE/NEUTRAL/
  NEGATIVE per transaction type), not persistent individual fan personas;
  the user explicitly asked to start conservative here and expand later
  if wanted. A trade's actual direction (good or bad for this team) isn't
  structured data on a `LeagueTransaction` row, so `TRADE` registers as
  buzz/excitement rather than approval/disapproval - an honest
  simplification rather than guessing at outcome quality from a free-text
  description.
- **`Team.marketSize`** (`LARGE`/`MID`/`SMALL`) is real, sourced fixture
  data (`prisma/data/teams.ts`), the same category as city/conference/
  colors - a qualitative but defensible real-world classification, not
  fabricated. Drives `computeFranchisePopularity`/`computeAttendancePct`'s
  baselines (large markets keep a higher attendance floor even when
  unhappy - tradition/season tickets - but happiness still meaningfully
  swings the number for every market size).
- **Presentational metrics, not independently simulated.** The user was
  explicit that attendance/merchandise/season-ticket-demand/social-buzz
  should still exist for immersion even without their own independent
  gameplay effect - but derived honestly from real numbers, not
  fabricated/decorative. `FanHappinessSnapshot` stores only two real
  numbers per team per season (`fanHappiness`, `franchisePopularity`,
  `attendancePct`) - Merchandise Popularity/Season Ticket Demand/Social
  Media Buzz are UI-side labels derived from `getFranchisePopularityTier`
  (`src/lib/fans/fanHappiness.ts`), not separately tracked state. One tier
  drives all three labeled facets, since they're reflections of the same
  underlying "how hot is this team right now" number, not independently
  meaningful metrics.
- **No revenue-buys-cap-space mechanic.** Real NBA salary cap rules are
  uniform league-wide regardless of team revenue - wiring fan happiness
  into cap space would misrepresent real NBA economics. The only
  mechanical hook is a small nudge to `computeConfidenceDelta`
  (`src/lib/gm/seasonEvaluation.ts`) - a thrilled fanbase modestly softens
  the owner-confidence hit from a bad season, an empty building modestly
  sharpens it - via a new optional `fanHappiness` parameter that leaves
  the function's existing behavior unchanged when omitted.
- **Fan Hub** (`/leagues/[id]/fans`): Fan Happiness score, Franchise
  Popularity index, derived attendance/merchandise/ticket-demand tiers, a
  multi-season trend graph (`FanHappinessTrendChart`, recharts - already a
  dependency, following the same client-component/`ResponsiveContainer`/
  literal-hex-color convention `RosterScatterChart.tsx` established, since
  recharts SVG props can't resolve CSS vars), and a fan reaction feed
  built from this team's own `LeagueTransaction` rows.

### Fan Engagement Deepening (Phase 1: mid-season dynamic sentiment)

A further, more detailed request (see `docs/FEATURE_REQUESTS.md`'s Fan
Engagement Deepening entry) to make `fanHappiness` a _living_ number
instead of a once-a-season recompute. Preceded by its own architecture-
overlap review: still a consumer of existing systems, no second
event-detection or valuation engine.

- **`src/lib/fans/sentimentEvents.ts`** - one small function per curated
  event category (trades, signings, win/loss streaks, injuries/recoveries,
  staff hires/fires, notable rotation changes, awards, All-Star selections/
  snubs/results), each deriving its magnitude from a signal that already
  exists - `evaluateTradeOffer`'s own fairness score for trades,
  `PlayerValueTier` for star power, `describeWinStreak`'s existing
  STANDARD/MAJOR/BREAKING tiers for streaks, the existing
  `DAY_TO_DAY`/`OUT`/`SEASON_ENDING` classification for injuries - rather
  than a flat per-event bonus. Every delta is bounded by a small per-
  category cap, which is also the anti-exploitation mechanism: shuffling
  low-stakes assets back and forth can't manufacture a real sentiment swing
  because there's no real value/star-power behind it to weight on.
- **Applied inline, at the exact existing call site where the event
  already happens** - `executeTradeAction`, `maybeExecuteCpuTrade`,
  `signFreeAgentAction`, `maybeExecuteCpuSigning`, the per-game streak/
  injury handling inside `simulateGamesAction`/`applyLeagueEvents`,
  `hireStaffAction`/`fireStaffAction`, `updateRotationAction`, the awards
  block inside `advanceSeasonAction`, and `generateAllStarWeekend` - instead
  of being retroactively guessed at from a bulk `LeagueTransaction` scan
  once a season. Batch game-processing (streaks, injuries) accumulates
  deltas into a local `Map<teamId, delta>` and flushes once per chunk,
  exactly the pattern `winIncrements`/`streakByTeam` already use, so this
  never became a new per-event query on a hot path.
- **A user trade is judged from both sides.** `evaluateTradeOffer` is
  called a second time, from the user's own team's perspective (identity/
  needs/roster fetched alongside the existing CPU-side evaluation), purely
  to score how the user's _own_ fans read the deal - reusing the exact
  "ask both sides" pattern CPU Autonomous GM Intelligence Phase 2 already
  established for CPU-CPU trades. This score only ever feeds the fan-
  sentiment magnitude; it never gates whether the trade executes.
- **The season-end pass still exists and still matters** - it's still
  where the larger outcome-based adjustment (verdict/win%, star power,
  coach style) is applied, per the user's explicit ask to keep "an
  important larger adjustment based on how the franchise performed
  relative to expectations." What changed: its bulk
  `computeTransactionSentiment` scan is now narrowed at the query level to
  `RETIREMENT`/`GAME_MILESTONE`/`GAME_RESULT` - the categories that now
  have a dedicated inline hook are excluded there, so nothing is double-
  counted. Award deltas (only ever knowable at season end) are accumulated
  into `awardFanHappinessDeltaByTeam` and layered onto the same unified
  `fanHappinessUpdates` pass every other team's adjustment already flows
  through - deliberately _not_ written immediately when computed, since
  `league.teams` is a stale pre-fetched snapshot by that point in the
  function and an immediate write there would have been silently
  overwritten by the later unified pass reading that same stale value.
- **Verified** via `src/lib/fans/sentimentEvents.test.ts` and a hands-on
  fast-forwarded season: 19 of 30 teams had already moved off the neutral
  65 baseline _before_ the season ended, direct proof of real mid-season
  movement rather than only a season-end jump.

**Not yet built** (deferred, later phases per the agreed sequencing):
franchise context/expectations weighting so fans judge different franchise
situations by different standards (Phase 2); player fan-affinity/loyalty
so losing a beloved long-tenured player reads differently than losing an
equally-rated stranger (Phase 3, needs a new `LeaguePlayer.joinedTeamSeason`
field - tenure and "drafted by us" can't be derived from existing data
since `Contract` rows are deleted on expiry); fan segments, a Fan Hub
redesign, and distinct attendance/merchandise/tickets/buzz formulas (Phase
4); playoff qualification/elimination/championship news (net-new -
`playoffs.ts` writes no `LeagueTransaction` today), long-term franchise
memory, fan-pressure moments, and the approved payroll-directive-threshold
consequence (Phase 5).

## All-Star Weekend

A fresh, out-of-band user request (see `docs/FEATURE_REQUESTS.md`'s
All-Star Weekend entry for the full original ask). Preceded by an
architecture-overlap review the user explicitly agreed with: a genuine
mid-season interruption of regular-season simulation, a new parallel data
model rather than a retrofit of `SeasonAward`, and no fabricated
attribute for the Slam Dunk Contest.

- **Selection is driven by real simulated performance, not
  `overallRating`.** `src/lib/allstar/selection.ts`'s `selectAllStars`
  aggregates this season's actual `PlayerGameStat` averages through the
  same `computePerformanceScore` the valuation model uses, and blends in
  `overallRating` only as a small "reputation/star power" nudge (a
  defensible existing-data proxy for fan-vote bias, not a new field) -
  0.7/0.2 performance/reputation for starters, 0.85/0.1 for reserves, plus
  a team-record bonus. This is what makes an elite player having a poor
  season miss out while a breakout player having a great one gets in. A
  minimum-games-played floor (20, mirroring DPOY/6MOY's own eligibility
  floors) excludes small-sample outliers. Position grouping (`GUARD` =
  PG/SG, `FRONTCOURT` = SF/PF/C) is new, simple, additive logic - nothing
  like it existed before. Injury replacements keep the original honoree's
  own selection row (matches the real NBA - you're still "selected" even
  if replaced) and add the next-best eligible alternate at the same
  conference/position group. Snubs are computed at generation time only,
  by pure performance (not the reputation-blended score), and are never
  persisted as a selection - there's no career achievement to record for
  missing out, only a story for news to tell.
- **`AllStarSelection`/`AllStarEventParticipant`/`AllStarGame`/
  `AllStarGameStat` are new, separate models, not a `SeasonAward`/`Game`
  retrofit.** `SeasonAward` assumes exactly one winner per category per
  season; an All-Star roster is 24+ players. `Game`/`PlayerGameStat`
  require real `LeagueTeam` FKs; All-Star "sides" are ad-hoc
  captain-drafted squads that don't correspond to any `LeagueTeam`. One
  shared `AllStarEventParticipant` model (not three near-identical tables)
  covers Rising Stars, the Three-Point Contest, and the Slam Dunk Contest,
  since all three are structurally the same shape (a participant, a
  round-by-round result, a score) - a short result string (`"CHAMPION"`,
  `"ELIMINATED_ROUND_1"`, `"<captainId>_MVP"`) stands in for a full
  narrated sequence, matching "lightweight, not unnecessarily complex."
  `AllStarWeekend`'s own existence + `status` (`PENDING`/`RESOLVED`) for a
  `(leagueId, season)` pair is the _sole_ marker of whether the mid-season
  break is currently blocking simulation - no redundant scalar field on
  `League`.
- **Rising Stars, the Three-Point Contest, and the Slam Dunk Contest each
  get their own pure module under `src/lib/allstar/`.** Rising Stars
  (`risingStars.ts`) reuses `estimateExperience` (the same function
  Rookie of the Year uses) extended by one year, ranks the top 14 by
  performance, and splits them via the shared captain-draft helper
  (`draftTeams.ts` - also used by the main All-Star Game). The
  Three-Point Contest (`threePointContest.ts`) selects participants from
  real season 3PT volume _and_ efficiency blended together - explicitly
  not "the highest-rated players" - and simulates round-by-round scores
  (a fixed 25-ball rack scored off real season 3P% plus bounded variance,
  the field halving each round to a two-player final), not a
  possession-by-possession sequence. **The Slam Dunk Contest is the one
  place this feature knowingly fabricates something, and it says so
  explicitly**: no real "dunking ability" attribute exists anywhere in
  this schema, and inventing a persisted one would be exactly the kind of
  unearned fabrication this codebase otherwise avoids (see "Data
  sourcing"). Instead, `dunkContest.ts` computes a clearly synthetic,
  **non-persisted** "dunk appeal" composite (younger age + a guard/wing
  position lean + reputation + a seeded per-player "flair" roll) fresh
  every time it runs - explicit flavor, never written to the database,
  never read back as if it were real.
- **The All-Star Game (and Rising Stars game) reuse the existing
  simulation engine entirely - they are not a second basketball
  simulation.** `src/lib/allstar/allStarGame.ts`'s `simulateAllStarGame`
  calls the same `computeTeamStrength`/`simulateGame`/`generateBoxScore`
  every regular-season game already uses. The "exhibition" feel (more
  balanced minutes, no DNP-CDs, higher perimeter-heavy scoring) comes
  entirely from a synthetic `CoachModifier` object built at the call site
  - the exact same hook Head Coach effects (Phase 15a) already added to
    `boxScore.ts` - so zero new code was needed inside `boxScore.ts` itself.
    A new `getRosterPlayersById` (`src/lib/actions/leagueTeamStrength.ts`,
    sharing its row-conversion logic with the team-based
    `computeLeagueTeamStrengths`) fetches an arbitrary hand-picked list of
    players spanning many different real teams, since an All-Star roster
    isn't one team's roster. MVP reuses the identical
    `computePerformanceScore` weighting selection itself uses, applied to
    the one game's stat line instead of a season average, with a small
    winning-side bonus.
- **A genuine mid-season checkpoint, not a cosmetic pause.** The user was
  explicit that simulation must actually stop - even mid-batch, even
  before a "Sim Next 10 Games" request finishes - once the break is
  reached, and stay stopped until the user resolves it.
  `simulateGamesAction` (`src/lib/actions/simulation.ts`) checks twice:
  once at the very top (a `PENDING` `AllStarWeekend` for the current
  season already exists → return immediately, `simulated: 0`, nothing
  runs), and once after every chunk (the user's own team's `wins+losses`
  just reached 41 - half of 82 - and no weekend exists yet → generate the
  whole weekend synchronously via `generateAllStarWeekend`
  (`src/lib/actions/allStarWeekend.ts`) and break the loop immediately,
  reporting exactly how many of the requested games actually completed).
  `resolveAllStarWeekendAction` is the one action that flips the row to
  `RESOLVED` and unblocks simulation again - called from the "Continue
  Season" button on `/leagues/[id]/all-star`, which doubles as the
  efficient skip option the user asked for (every contest/game result is
  already fully decided at generation time, so there's nothing to step
  through - resolving is instant).
- **Pre-selection "buzz" news reuses the exact same selection pool, not a
  separately invented signal.** Once the user's team is in a believable
  pre-break window (30-40 games played), `applyLeagueEvents`
  (`src/lib/actions/leagueEvents.ts`) has a small per-game chance (the
  same `shouldTriggerEvent` scaling pattern CPU trades/signings already
  use) to run the shared `buildAllStarPerformancePool` +
  `selectAllStars` and name the current top starter as "building a strong
  All-Star case" - a real early read on who selection would pick if the
  break were today.
- **News, fan engagement, player profiles, and league history all consume
  the same real generated data - none of them detect events
  independently.** `generateAllStarWeekend` writes real
  `LeagueTransaction` rows (three new `TransactionType`s:
  `ALL_STAR_SELECTION`, `ALL_STAR_SNUB`, `ALL_STAR_RESULT`) for roster
  reveals, first-timers, snubs, and every contest/game result, all from
  data just computed. `NewsFeed.tsx` groups all three under one `ALL_STAR`
  filter pill, the same way `STAFF` already groups `STAFF_HIRE`/
  `STAFF_FIRE`. Fan engagement's `transactionSentiment.ts`/
  `fanReactions.ts` gained table entries for the three new types - zero
  new fan-engagement code. `profileData.ts` queries `AllStarSelection`/
  `AllStarEventParticipant`/`AllStarGame` for a player's career honors
  (All-Star selections, contest championships, Rising Stars/All-Star Game
  MVP) and renders them in the existing Awards tab. League History gets a
  per-season "All-Star Weekend" card alongside the existing champion/
  awards/retirees cards, linking to the full `/leagues/[id]/all-star`
  page for that season.
- **Nothing depends on hardcoded names or the current real NBA.** Every
  selection, contest, and game runs on whatever players/ratings/stats this
  league's own simulation has generated - a future draft-generated player
  is fully eligible using identical logic to a real seeded player, since
  the selection/contest modules only ever see the same
  `PlayerSeasonPerformanceSnapshot`-shaped data regardless of where a
  player came from.

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

### Live Playoff Game Experience

Every playoff game involving the user's own team is a real, watchable
event instead of resolving identically to a CPU-vs-CPU series - built as
an addition alongside the bulk engine above, not a replacement for it.

- **A genuinely independent quarter-level engine**
  (`simulateLiveGame.ts`), separate from `simulateGame.ts`'s single-shot
  final-score model, which regular-season games and every CPU-vs-CPU
  playoff series continue to use completely unchanged.
  `computeStrengthDiff` (extracted from `computeHomeWinProbability` in
  `simulateGame.ts`) is the one shared strength-differential signal both
  models derive from, so they can never quietly drift apart.
  `simulateQuarter`/`simulateLiveGame` simulate 4 independent regulation
  quarters (then extra periods if tied) and the winner/final score
  _emerge_ from summing them - not decided upfront and reverse-engineered
  into a plausible breakdown, the way `generateBoxScore` already works for
  every other game. Summing 4 independent strength-biased quarters
  compounds a strength edge more than a single-shot roll does, so
  `QUARTER_STRENGTH_SENSITIVITY` is empirically calibrated (a throwaway
  script swept per-quarter sensitivity values across a range of realistic
  strength differentials and compared the resulting aggregate home-win
  rate against `computeHomeWinProbability`'s prediction at that same
  differential) rather than reused at the same scale as the per-game
  model - see `simulateLiveGame.test.ts`'s calibration regression check.
- **Player stats accumulate alongside the score, without a second stat
  model**: `generateBoxScore` is called once with the real final score
  from the engine above - the one authoritative box score, written to
  `PlayerGameStat` with `gameType: PLAYOFF` (finally using support that
  had existed unused in the schema since it was designed - `playoffs.ts`
  never called `generateBoxScore` before this). `allocatePlayerStatsAcrossPeriods`
  distributes each player's already-known share of that real final total
  across periods (largest-remainder rounding, so periods always sum back
  to the exact real total) for the live reveal - the numbers you see at
  the buzzer are never invented twice.
- **Breaking round-atomicity for exactly one series** (`playoffs.ts`):
  `simulateRoundAction` still resolves every series in a round via
  `simulateSeriesToCompletion` exactly as before, _except_ the user's own
  team's series in that round, if undecided, which is deliberately left
  untouched - the round-advancement logic (creating the next round's
  series, or crowning a champion at round 4) was extracted into a shared
  `advanceRoundIfComplete` helper that re-checks every series in a round
  fresh from the DB and only advances once _all_ of them - including the
  user's own - have a winner. This makes it safe to call from either the
  bulk action or from `playLiveSeriesGameAction` below, regardless of
  which one happens to finish the round.
- **`playLiveSeriesGameAction`**: locates the user's next game in their
  pending series, reuses `computeLeagueTeamStrengths`'s `rostersByTeam`
  (already fetched elsewhere in this file for the bulk path, previously
  discarded), runs the live engine, generates the box score, persists the
  `Game`/`PlayerGameStat`/`PlayoffSeries` rows, and returns the full
  quarter-by-quarter payload in one call - the same "server resolves the
  real outcome in one call, client reveals it progressively" pattern
  already used for the draft's pick reveal and the schedule calendar's
  sim reveal, applied a third time.
- **UI** (`LiveGameExperience.tsx`/`LiveGameScoreboard.tsx`/
  `PostgameSummary.tsx`, `/leagues/[id]/playoffs/live/[seriesId]`): a
  pre-game rotation check-in (the existing `RotationBoard`, unmodified) ->
  a progressive scoreboard reveal -> a postgame summary. The reveal splits
  each period's real score into several ticks via random-but-plausible
  shares (largest-remainder rounding, generated once per period so a
  mid-game speed change never reshuffles an already-decided reveal) with
  a counting-down clock; speed controls (1x/2x/4x/Fast, Pause, Sim to
  End) only change the delay between already-decided ticks, never the
  outcome, since the entire game is fully computed before any reveal
  begins. A dismissible (never forced) suggestion appears late in a close
  game. "Sim to End" still holds on the final score for a short fixed
  floor before advancing to postgame - skipping that floor entirely
  caused the whole component to unmount near-instantly on click, racing
  the click's own completion (found via e2e testing, not manual QA).
- **A `notFound()` guard that must not depend on data the current action
  itself just changed**: the live page's Server Component originally
  404'd if `series.winnerTeamId` was already set (to reject stale/invalid
  URLs). But Next.js re-runs a Server Component in the background after a
  Server Action called from it resolves - and if _that exact action_ is
  what decided the series (e.g. a sweep), this guard would fire and yank
  the 404 UI in over the client's own already-correct live/postgame view,
  an intermittent failure that only showed up running the full e2e suite,
  never in manual testing. Fixed by not 404ing on that condition - whether
  there's still a game to play is enforced fresh, at click time, by
  `playLiveSeriesGameAction` itself, the correct single source of truth
  for that, not this page's own possibly-stale render.
- Every game in a series shares the same `seriesId`-scoped URL - both
  "Play Game N" (`PlayoffControls.tsx`) and "Play next game"
  (`PostgameSummary.tsx`) are plain `<a>` tags, not `next/link`, so a
  client-side navigation back to the _same_ URL for the next game can't
  reuse a stale router-cache snapshot from an earlier game (which would
  otherwise leave that game's home/away/rotation props stuck on an old
  game's values, since real home-court alternates 2-2-1-1-1 within a
  series).
- `PlayoffControls`'s message only claims "Round N complete - the bracket
  has advanced" when something was actually bulk-resolved
  (`seriesResults.length > 0`) - clicking "Simulate other series" when the
  user's own series is the _only_ one left in the round (always true at
  the Finals) is a complete no-op, and previously still showed that same
  false-success message.

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
  actions (`runDraftLotteryAction`/`advanceDraftAction`/`makeDraftPickAction`)
  return the complete ordered list of what they just resolved, and the
  client drives its own local `picks` state from those results - it
  doesn't wait on the automatic post-action page re-render the way
  earlier phases' simpler action/button components did, since that would
  make every pick appear at once again.
- **Draft Lottery Experience** (`/leagues/[id]/draft/lottery`,
  `DraftLotteryExperience.tsx` and `src/components/draft/lottery/`): a
  dedicated presentation layer around the lottery math above, not a
  second implementation of it. `runDraftLotteryAction` (replacing the
  old, presentation-free `startDraftAction`) still does the exact same
  seeded-RNG compute-and-persist pass (`computeDraftOrder` then
  `generateDraftClass`, same seed stream) in one server round trip, and
  additionally: writes a permanent `LotteryResult` row per lottery team
  (pre-draw projected seed + real odds, captured before the draw, plus
  the actual outcome - `DraftPick` itself only ever stores the bare
  final order, not the odds/movement story around it), creates
  `DRAFT_LOTTERY` news for what's genuinely notable (the winner, a real
  jump/fall past a real threshold, a tie-in to the class's headline
  prospect if one clears its own threshold - see
  `lotteryPresentation.ts`), and applies fan-sentiment deltas for every
  lottery team. It returns the full 14-team result once, and the client
  reveals it progressively pick-14-to-pick-1 with manual/auto/speed/skip
  controls (the same `waitTicks`/ref-mirrored-speed pattern as the live
  playoff scoreboard, including its "skip must still force-set the
  authoritative final values and hold briefly before completing" fix) -
  the reveal only paces how an already-fully-decided result is shown; it
  never influences it. Revisiting the route after the lottery has run
  reads the persisted `LotteryResult` rows directly and shows the results
  view again rather than re-running anything. Draft-pick ownership
  (traded picks), CPU teams' resulting draft position, and Action
  Center/History integration all needed zero new plumbing beyond this -
  every existing consumer already just reads `DraftPick.overallPickNumber`
  once it's persisted. Real pick protections are not modeled anywhere in
  the sim yet (`DraftPick.protectionNote` is an inert field) - a separate,
  unstarted roadmap item.
- **Draft Experience Redesign, Phase A** (CPU intelligence + data):
  - **CPU draft-AI** (`src/lib/draft/draftAi.ts`) replaces the old pure
    best-`overallRating`-available logic in `advanceDraftAction`. Reuses
    the same layered team-evaluation stack the trade AI already
    established - `TeamIdentity` (`teamIdentity.ts`), `TeamNeed[]`
    (`teamNeeds.ts`), `GmPersonality` (`gmPersonality.ts`) - rather than a
    parallel system: an overall/potential weight blend shifts toward
    current ability for win-now teams and toward upside for rebuilding/
    tanking teams (reusing `evaluateTradeOffer.ts`'s own
    `REBUILDING_YOUTH_PICK_BONUS`/`CONTENDER_VETERAN_BONUS` magnitude),
    multiplied by the existing `NEED_FIT_BONUS_MULTIPLIER` when a
    prospect fills a real positional need, plus a small seeded noise term
    (wider for `AGGRESSIVE` teams). Selection is a strict argmax - reaches
    and steals emerge from real per-team scoring differences, never a
    scripted "surprise" roll. Each team's in-memory roster/needs are
    updated after every pick within a batch, so a team picking twice in
    the same round 2 batch knows about the need it just addressed.
  - **In-draft CPU pick trades** (`src/lib/draft/draftPickTradeRoll.ts`):
    a low-probability seeded roll before each CPU-owned pick checks
    whether another CPU team would trade up using its own later,
    already-numbered picks this same draft (capped at 2 offered picks,
    same-season only - no future-pick arbitrage in v1). Judged via the
    exact same `computeDraftPickTradeValue`/`evaluateTradeOffer` the
    pre-draft trade builder uses - both sides must genuinely `ACCEPT`.
    Executed by forking `maybeExecuteCpuTrade`'s (`leagueEvents.ts`)
    direct-DB-write pattern, since that function's own comment notes CPU
    trades "never involve picks anyway" - there was no existing pick-
    trading write path to extend. Never involves the user's team.
  - **Reach/steal detection** (`src/lib/draft/draftNightNarrative.ts`):
    directly forked from the Draft Lottery's `detectNotableMovement`
    shape - ranks the class by `overallRating` for an "expected rank,"
    compares against the actual pick number, and only a real ≥15-slot
    gap (out of 60) is a story. Narration over the AI's genuine output,
    never a fabricated surprise. Logged as `DRAFT_SELECTION` news via new
    `describeDraftReach`/`describeDraftSteal` describers.
  - **Richer prospects**: `DraftProspect` gained `heightInches`,
    `weightLbs`, `collegeOrTeam` + `isInternational` + `nationality`, and
    `comparisonPlayerName` (a curated, potential-tier-matched real-player
    comp, always framed as scouting opinion - "Scouts compare his game
    to..." - never a factual claim, and never copied onto the real
    `Player` row). All generated once in `generateDraftClass.ts`
    alongside the existing rating curve (`src/lib/draft/prospectBio.ts`).
    `heightInches`/`weightLbs` **are** carried onto the created `Player`
    row at draft time (`draftProspectsToTeams`) - a real, low-risk
    correctness fix, since that field already existed for real players
    but was never populated for rookies. `scoutingConfidence` (from age)
    and a projected draft range (from the class's own rating rank) are
    computed/display-only, same precedent as the scouting sub-attributes
    below - never new columns, never a mechanic that hides a real number.
  - **Bookmarks** (`DraftProspectBookmark`, `toggleDraftProspectBookmarkAction`):
    a simple per-league (not per-user - a league is one user's save)
    join table backing a "build your own draft board before the draft"
    star/filter.
  - Both `generateDraftClass`'s output and `runDraftLotteryAction`'s
    persistence needed updating together - the class is generated once
    by the lottery action, not by `advanceDraftAction`, so the richer
    fields have to be written at that single creation point.
- **Draft Experience Redesign, Phase B** (the broadcast-style rebuild on
  top of Phase A's data - `DraftExperience.tsx` is now a thin
  orchestrator composing focused subcomponents, all in
  `src/components/draft/`, rather than one monolithic component):
  - **`DraftBroadcastHeader.tsx`** - the on-the-clock hero: team logo/
    name, round/pick number, `TeamIdentity` label and top two
    `TeamNeed`s (the same context `draftAi.ts` already computes for
    every team, via the shared `computeTeamDraftContexts` helper - see
    below), and a purely cosmetic countdown clock (resets per pick, has
    zero gameplay consequence on timeout - a single-player game force-
    picking for the user would be hostile UX, not exciting).
  - **`DraftOrderRail.tsx`** - a horizontally-scrolling strip of all 60
    picks with team logos, auto-scrolling to keep the current pick in
    view, highlighting the current/user-owned/already-decided state of
    each.
  - **`PickRevealStage.tsx`** - directly forked from the Draft Lottery's
    `LotteryReveal.tsx`: the same manual/auto/1x-4x/Fast/skip mechanism
    (ref-mirrored control state, and the "skip must still force-apply
    every remaining entry's callback and hold briefly before completing"
    discipline - a real bug caught and fixed here, since a naive port
    would have read stale React state instead of a closure-local
    counter when force-applying skipped entries). One instance handles
    an entire CPU batch from `advanceDraftAction` _or_ a single pick
    from `makeDraftPickAction` - when there's only one entry, the mode/
    speed controls are hidden entirely (nothing to pace across a single
    item) and it plays as a one-shot announcement card instead. Renders
    a "Trade Alert" banner for a pick that changed hands via an in-draft
    trade and "Reach"/"Hidden Gem" callouts for a real narrative,
    reusing the exact same `animate-lottery-*` keyframes the lottery
    already established (now shared across two features, not forked).
    An `onReveal` callback fires once per entry as it becomes current,
    so the order rail, draft board, and prospect board's "Drafted by..."
    annotations all update live pick-by-pick during the reveal, not
    just once at the end.
  - **`DraftBoard.tsx`** - the live decided-picks list, now grouped by
    round with a "My Picks" filter.
  - **`ProspectBoard.tsx`** - replaces the old inline "Scouting Board"
    section: search-by-name, a sort dropdown (Overall/Potential/Age/
    Name) alongside the existing position pills, a bookmark star, and a
    compare checkbox (capped at 4) per row. A persistent single panel
    used throughout the whole draft, not gated to a pre-draft phase -
    when it's the user's turn, undrafted rows get a "Draft" button
    directly; otherwise every prospect just shows "Drafted by TEAM
    (Pick N)" once decided.
  - **`ProspectProfile.tsx`/`ProspectProfileModal.tsx`** - the full rich
    profile (all of Phase A's new fields, plus the existing scouting
    sub-attribute bars) in a dedicated modal instead of an inline
    expand, opened by clicking any prospect's name.
  - **`ProspectCompareTray.tsx`/`ProspectCompareModal.tsx`** - a sticky
    bottom tray tracking 2-4 selected prospects, opening a side-by-side
    table of every profile field (including the 5 scouting sub-
    attributes) for direct comparison.
  - **`TeamNeedsOverview.tsx`** - a second side-panel tab surfacing every
    team's computed identity and needs at a glance - genuinely "free" to
    add, since it's the exact same data `draftAi.ts` already computes
    for its own decisions, not a new signal invented for display.
  - **`src/lib/gm/teamDraftContext.ts`** (new, shared) - `buildCpuTeamStates`
    in `draft.ts` (the AI's own context-builder) and `draft/page.tsx`
    (the display layer) both need "every team's identity + needs" -
    extracted into one `computeTeamDraftContexts` helper reused by both,
    rather than computing it twice and risking drift between what the
    AI sees and what the UI shows the user.
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

> **Superseded (2026-07-31): current NBA rosters.** The player/stat/rating
> pipeline described below (balldontlie bios + a frozen 2023-24 stat set +
> formula-only ratings) has been replaced by a current-season pipeline sourced
> entirely from **hoopR-nba-data** (MIT-licensed): `npm run import:dataset`
> (`scripts/import-hoopr-dataset.ts`) fetches current rosters/bios/photos and
> the completed season's box scores through a provider-agnostic canonical
> schema + adapters (`src/lib/data-sources/`), derives realistic starting
> ("seed") ratings (`seedRating.ts`, a purpose-built model separate from the
> in-sim valuation composite) plus a minimal consensus override layer
> (`ratingOverrides.json`), and writes a versioned, validated
> `prisma/data/nbaDataset.json`. `seed.ts` loads it into
> `Player.seedOverallRating/seedPotentialRating`; `createLeagueAction` seeds a
> new league from exactly that (top-15-per-team roster, surplus to free
> agency). Real-world data sets a save's initial state only, then the sim
> evolves it. Legally-usable free path; the honest limitation is box-score +
> TS% inputs (no BPM/VORP). See `docs/FEATURE_REQUESTS.md` -> "Current NBA
> Rosters..." for the full rationale and phases. The notes below are retained
> as historical context for the original 2023-24 approach.

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

## In-league navigation & phase model (Phase 1 of the onboarding/flow work)

A UX audit (not a prescribed solution - the user explicitly asked for
analysis first) found the team dashboard opened with a flat,
undifferentiated 12-link button row regardless of what was actually
relevant right now, every one of the 14 pages under `leagues/[id]/**`
duplicated its own ad hoc "&larr; Back to..." link (inconsistent wording;
`standings` had none at all; `schedule`'s pointed at `/standings` instead
of the dashboard), and the same "what phase is this league in" logic was
independently duplicated three times (`offseason/page.tsx`, `draft/
page.tsx`'s `gatePhase`, the `/leagues` hub's `describeStatus`) - all
three derived the identical 4-state reality, confirmed against
`advanceSeasonAction`'s own real gating preconditions. Compared a full
onboarding tutorial against a persistent, phase-aware sub-nav plus a
ranked "Action Center" of recommended next steps; chose the latter,
phased into this structural pass first (shared phase module + persistent
nav) with the Action Center as a deliberate, separate follow-up - see
`docs/FEATURE_REQUESTS.md`'s "Simulator Onboarding & Flow" entry for the
full comparison.

- **One shared phase module** (`src/lib/league/leaguePhase.ts`): a
  straight extraction of the exact logic already duplicated in
  `offseason/page.tsx` (unplayed regular-season games -> round-4
  `PlayoffSeries.winnerTeamId` -> draft pick completion), not a new rule.
  Split into a pure `deriveLeaguePhase` (unit-tested directly) and a thin
  `computeLeaguePhase` DB wrapper around it - this codebase's usual
  "pure decision logic, thin fetch shell" shape, since prisma-touching
  code here isn't unit-tested directly (covered by e2e instead, matching
  how the rest of this app's server actions are verified). The three
  original call sites now all call this instead of recomputing their own
  copy.
- **Pure nav-section logic** (`src/lib/league/subNavSections.ts`): all 12
  sections (Rotation, Schedule, Standings, Playoffs, Offseason, Draft,
  Free agents, Staff, Fans, Leaders, News, History) always exist and are
  always directly clickable - which subset is visually "primary" (a
  bordered accent pill) vs "secondary" (a smaller muted text link) shifts
  by phase (e.g. `REGULAR_SEASON` promotes Rotation/Schedule/Standings/
  Playoffs; `READY` promotes Offseason/Free agents/Staff, since "Advance
  to next season" lives on the Offseason page). Nothing is ever
  hard-hidden.
  - An earlier version hid "secondary" sections behind a collapsed
    `<details>` "More" disclosure instead. Running the full e2e suite
    immediately broke on it: several flows click a section directly
    mid-phase (Free Agents during the draft window, News right after a
    trade), and a collapsed disclosure turns "one click away" into
    "invisible until you find More first" - the same friction a real user
    would hit, not just a test artifact. Switched to always-visible,
    just de-emphasized. This also means Phase 1 shipped with no
    badges/counts anywhere (dropped along with the disclosure) - that's
    intentionally Phase 2 (Action Center) territory, not missing scope.
- **`src/app/leagues/[id]/layout.tsx`** (new - the first nested layout
  anywhere in this app, previously only the root layout existed): does
  the auth/ownership check once and renders a persistent header (team
  identity, a click back to the dashboard) followed by `LeagueSubNav`,
  wrapping every page under a league including the deep ones
  (`trades/new`, `free-agents/[id]`, `staff/hire/[id]`,
  `playoffs/live/[seriesId]`) automatically. Deliberately does _not_
  force all 14 pages to adopt a shared auth helper in this pass - each
  page keeps its own existing ownership check, keeping the diff
  reviewable; the layout's own check is independently sufficient since
  Next.js always runs it on the path to any page. The team-identity link
  and every nav link set `prefetch={false}` - they render on literally
  every page view, so eagerly prefetching all 12 sections' RSC payloads
  every single time was pure waste (surfaced by an unrelated intermediate
  debugging detour - see the Live Playoff Game Experience entry above for
  what that investigation actually found the _real_ bug to be).
- All 14 pages had their own inconsistent "&larr; Back to..." link (and a
  couple of now-redundant inline cross-links, like Standings' old "View
  full schedule" link and Playoffs' old "Standings" link) removed - each
  page's own `<h1>` and all business logic are otherwise untouched.

### Action Center (Phase 2)

A ranked list of the 2-3 most relevant recommended actions on the team
dashboard - the "tell users what to focus on next" half of the
onboarding/flow work, on top of Phase 1's "help them get anywhere."
`src/lib/gm/actionCenter.ts` follows the same shape as `leaguePhase.ts`:
a pure, unit-tested `computeActionCenterItems(input)` plus a thin async
`getActionCenterItems` wrapper in the same file.

- Every rule is grounded in state that already exists elsewhere in the
  app, confirmed by research before writing any code rather than
  invented: pending live playoff game (the same `pendingUserSeries` logic
  `playoffs/page.tsx` already computes), pending All-Star Weekend
  (`AllStarWeekend.status === "PENDING"`, the same check `schedule/
page.tsx` and `standings/page.tsx` already use), GM job security at
  HOT_SEAT/CRITICAL (`jobSecurity.ts`, already rendered on this same
  page), `computeLeaguePhase(...) === "ready"`, an unmet owner payroll
  directive (the same compliance check `offseason.ts`'s season-advance
  logic uses), a rotation needing attention, an expiring good player not
  yet re-signed, a staff vacancy, and cap space paired with a real roster
  need (`computeTeamNeeds`, already computed on this page for the "Team
  identity" card).
- Almost none of this needs new queries: the dashboard already fetches
  `leaguePlayers` with `contract`/`rotationSlot`/`targetMinutesPerGame`/
  `injuryStatus` (Prisma returns every scalar field by default under
  `include`, so these were already present in the query result, just
  unused until now), `capSheet`, and `teamNeeds`. Only four small
  additions were needed: `computeLeaguePhase`, a targeted pending-
  playoff-series lookup, an `AllStarWeekend` lookup, and a `Staff`
  role-vacancy check.
- "Rotation needs attention" reuses `resolveRotation`'s own
  `hasCustomRotation` test (inverted, for "never touched") and its
  resolved ranks cross-referenced against `injuryStatus` (for "an OUT/
  SEASON_ENDING player is still occupying a top-12 slot") - two real
  problems from one already-existing function, not new rotation logic.
  DAY_TO_DAY doesn't count; only definitely-not-playing statuses do.
- Items are shown in a fixed priority order (`computeActionCenterItems`
  returns every rule that currently applies, in that order;
  `ACTION_CENTER_DISPLAY_LIMIT` - 3 - is where "how many to show" lives,
  applied by the caller) rather than a dynamically computed urgency
  score - these are qualitatively different kinds of urgency (a live game
  waiting to be played vs. a slow-burn cap situation), not a single
  comparable scale worth force-ranking algorithmically.
- Never disappears to nothing: when no rule applies, `ActionCenter.tsx`
  shows a calm "nothing urgent - explore trades, staff, or free agency"
  message rather than an empty gap, so the widget still answers "what
  should I do" even when the honest answer is "you're covered."
- Dashboard-only for this phase (not the persistent nav, not other
  pages) - deliberately scoped the same way Phase 1 was, one clean pass
  at a time.

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
