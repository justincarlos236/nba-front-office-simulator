import type {
  BusinessDecisionKind,
  DepartmentLevel,
  NewsImportance,
  SponsorshipDealKind,
} from "@/generated/prisma/client";
import { formatCentsCompact } from "@/lib/money";
import { departmentQualityDelta } from "@/lib/finances/departments";

// Marketing's specific identity:
// richer sponsorship offers. Scales departmentQualityDelta (roughly
// -10..+14) into a bounded multiplier on BusinessDecisionContext.
// marketingMultiplier's consumers (the 4 sponsorship cards below).
const MARKETING_SPONSORSHIP_SCALE = 0.025;
const MARKETING_MULTIPLIER_MIN = 0.7;
const MARKETING_MULTIPLIER_MAX = 1.4;

export function computeMarketingSponsorshipMultiplier(level: DepartmentLevel): number {
  const raw = 1 + departmentQualityDelta(level) * MARKETING_SPONSORSHIP_SCALE;
  return Math.max(MARKETING_MULTIPLIER_MIN, Math.min(MARKETING_MULTIPLIER_MAX, raw));
}

/**
 * System 7, "Business Events": the
 * weighted card deck rolled during regular-season simulation (see
 * src/lib/actions/leagueEvents.ts) that makes the Front Office Inbox feel
 * alive rather than a menu the user has to remember to visit. Pure,
 * Prisma-free content generation - same "pure decision logic, thin DB-fetch
 * shell" shape as src/lib/gm/actionCenter.ts.
 *
 * Every card is a genuine trade-off: at least two options, no option ever
 * free, no option strictly dominant (see docs/FINANCES_PILLAR_DESIGN.md,
 * System 7's design review criterion). A card's generated content is frozen
 * into the BusinessDecision row's `options` JSON at creation time, so a
 * later edit to this catalog never rewrites a decision a save has already
 * seen or resolved.
 */

/**
 * the payload an option needs to
 * carry when choosing it should sign a multi-year SponsorshipDeal instead
 * of (or alongside) an instant delta. `conditionLeaguePlayerId`/`Name` are
 * resolved at generation time from the context's `starPlayer` - never
 * re-derived at resolution time, so the deal is always tied to whichever
 * player was actually named in the offer the user saw.
 */
export interface SponsorshipDealOption {
  kind: SponsorshipDealKind;
  label: string;
  termSeasons: number;
  annualValueCents: number;
  conditionLeaguePlayerId: string | null;
  conditionPlayerName: string | null;
  franchiseValueUpsideFraction: number;
}

export interface BusinessDecisionOption {
  id: string;
  label: string;
  /** Explains the option's consequence in plain language - shown to the user before they choose. */
  description: string;
  /** Positive = cash in, negative = cash out. Instant effect only - a sponsorshipDeal's annualValueCents is recurring, applied at season boundaries instead. */
  cashDeltaCents: number;
  /** Applied to LeagueTeam.fanHappiness via applyFanHappinessDelta - can be 0. */
  fanHappinessDelta: number;
  /** Applied to League.ownerConfidence, same clamped-delta convention as computeConfidenceDelta - can be 0. */
  ownerConfidenceDelta: number;
  /** Finances as a Gameplay Pillar - present only on a sponsorship card's "sign" option. Choosing it creates a SponsorshipDeal row instead of (or alongside) the instant deltas above. */
  sponsorshipDeal?: SponsorshipDealOption;
  /** Finances as a Gameplay Pillar - present only on a negotiation card's "push back" option. Sets League.payrollDirectiveStaked/financialMandateStaked, read at the existing directive/mandate resolution point in advanceSeasonAction to apply an amplified reward/penalty instead of the standard one. */
  directiveStake?: "PAYROLL_DIRECTIVE" | "FINANCIAL_MANDATE";
}

export interface BusinessDecisionContent {
  kind: BusinessDecisionKind;
  severity: NewsImportance;
  headline: string;
  body: string;
  options: BusinessDecisionOption[];
  /** Which option applies automatically if the deadline passes unresolved - deliberately never the best one. */
  defaultOptionId: string;
  /** Days (season-day-index units) from generation until the deadline auto-resolves to defaultOptionId. */
  deadlineDays: number;
}

export interface BusinessDecisionContext {
  cashReserveCents: bigint;
  /** 0-100, from LeagueTeam.fanHappiness. */
  fanHappiness: number;
  /** 0-100, from computeFranchisePopularity - already-computed, never re-derived here. */
  franchisePopularity: number;
  /** The roster's best active player if they're STAR tier (80+) or higher - null otherwise. Phase 2's sponsorship "star clause" card names this exact player. */
  starPlayer: { leaguePlayerId: string; fullName: string } | null;
  ticketPricingPosture: "FAN_FRIENDLY" | "STANDARD" | "PREMIUM";
  /** Finances as a Gameplay Pillar - true within the early-season window sponsorship offers cluster in (a "preseason-ish" proxy; this simulator has no separate preseason phase). */
  isEarlySeasonWindow: boolean;
  /** Finances as a Gameplay Pillar - the Marketing department's multiplier on sponsorship-card dollar values (1.0 at STANDARD). Applied only within the sponsorship cards, never the crisis/opportunity ones - "richer sponsorship offers" is Marketing's identity, not a blanket cash bonus. */
  marketingMultiplier: number;
  /** Business Decision catalog expansion (2026-08-06) - LeagueTeam.currentStreak passed straight through: positive is a win streak, negative a loss streak. */
  currentStreak: number;
  /** Top 6 in conference by win% - the direct-playoff-qualifier line seedConference already uses, reused here as a "things are going well" eligibility signal rather than a precise seed. */
  isPlayoffContender: boolean;
  /** Bottom of the conference (outside the top 10 seedConference would send to the play-in) - the "things are going poorly enough that fans are noticing" signal. */
  isLotteryBound: boolean;
  /** Point differential (this team's score minus the opponent's) of the most recently completed game. Null before any game has been played this trigger - cards gated on it are simply ineligible then. */
  lastGameMargin: number | null;
}

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

// Deadline length by severity - a BREAKING crisis demands an answer fast;
// a MINOR opportunity can sit in the inbox for a while. Mirrors how
// NewsImportance already ranks urgency elsewhere in the codebase.
const DEADLINE_DAYS_BY_SEVERITY: Record<NewsImportance, number> = {
  BREAKING: 4,
  MAJOR: 8,
  STANDARD: 12,
  MINOR: 18,
};

interface CatalogEntry {
  kind: BusinessDecisionKind;
  severity: NewsImportance;
  eligible: (ctx: BusinessDecisionContext) => boolean;
  build: (
    ctx: BusinessDecisionContext,
  ) => Omit<BusinessDecisionContent, "kind" | "severity" | "deadlineDays">;
}

// A rocky stretch, not a catastrophe - the threshold at which sponsors and
// fans alike start noticing the team is struggling. Reused across a couple
// of "things are going poorly" cards rather than each inventing its own cutoff.
const FAN_HAPPINESS_STRUGGLING_THRESHOLD = 55;

// Business Decision catalog expansion (2026-08-06) - thresholds shared
// across the team-performance cards below. See docs/FINANCES_PILLAR_DESIGN.md
// Part 7.
const STREAK_CARD_THRESHOLD = 4;
const BLOWOUT_MARGIN_THRESHOLD = 25;

const CATALOG: CatalogEntry[] = [
  {
    kind: "SPONSOR_PULLOUT",
    severity: "MAJOR",
    eligible: (ctx) => ctx.fanHappiness < FAN_HAPPINESS_STRUGGLING_THRESHOLD,
    build: () => ({
      headline: "A regional sponsor is pulling out",
      body: "One of your marketing partners has grown uneasy about the team's recent form and wants out of their deal a year early.",
      options: [
        {
          id: "renegotiate",
          label: "Renegotiate to keep them",
          description:
            "Offer a discount to keep the partnership alive - a smaller loss now, and ownership appreciates the preserved relationship.",
          cashDeltaCents: -1.5 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
        },
        {
          id: "let-them-go",
          label: "Let them walk",
          description:
            "Absorb the full loss of the deal and look for a new partner once the team turns things around.",
          cashDeltaCents: -4 * M,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "let-them-go",
    }),
  },
  {
    kind: "ARENA_SYSTEMS_FAILURE",
    severity: "STANDARD",
    eligible: () => true,
    build: () => ({
      headline: "Arena systems failure",
      body: "A cooling system failure has forced emergency repairs before your next homestand.",
      options: [
        {
          id: "rush-repairs",
          label: "Rush the repairs",
          description: "Pay for expedited work so game night is unaffected.",
          cashDeltaCents: -2.5 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
        },
        {
          id: "patch-it",
          label: "Patch it minimally",
          description:
            "A cheap, temporary fix - it holds, but fans notice the discomfort on game nights until it's properly repaired.",
          cashDeltaCents: -0.5 * M,
          fanHappinessDelta: -3,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "patch-it",
    }),
  },
  {
    kind: "TICKETING_SCANDAL",
    severity: "BREAKING",
    eligible: (ctx) => ctx.ticketPricingPosture === "PREMIUM",
    build: () => ({
      headline: "Ticketing scandal breaks",
      body: "A local reporter has exposed hidden fees buried in your premium ticket pricing. Fans are furious, and ownership wants to know how you plan to respond - now.",
      options: [
        {
          id: "refund-fans",
          label: "Refund affected fans",
          description:
            "Make it right publicly - costs real money, but fans notice the accountability.",
          cashDeltaCents: -3 * M,
          fanHappinessDelta: 4,
          ownerConfidenceDelta: -1,
        },
        {
          id: "deny-wrongdoing",
          label: "Deny wrongdoing",
          description:
            "Stand by the pricing and save the money - ownership likes the discipline, but fans don't forget.",
          cashDeltaCents: 0,
          fanHappinessDelta: -6,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "deny-wrongdoing",
    }),
  },
  {
    kind: "LEAGUE_REVENUE_DOWNTURN",
    severity: "STANDARD",
    eligible: () => true,
    build: () => ({
      headline: "League-wide revenue downturn",
      body: "A stalled media-rights renegotiation means shared league revenue is projected to dip this year. Ownership wants to know how the front office plans to respond.",
      options: [
        {
          id: "tighten-belt",
          label: "Tighten discretionary spending",
          description:
            "Trim non-essential spend to offset the dip - ownership approves, but the leaner operation is felt around the building.",
          cashDeltaCents: 1.5 * M,
          fanHappinessDelta: -1,
          ownerConfidenceDelta: 1,
        },
        {
          id: "absorb-hit",
          label: "Maintain spending, absorb the hit",
          description: "Keep operating as normal and eat the shortfall.",
          cashDeltaCents: -2.5 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "absorb-hit",
    }),
  },
  {
    kind: "INTERNATIONAL_PRESEASON_GAME",
    severity: "STANDARD",
    eligible: (ctx) => ctx.starPlayer !== null || ctx.franchisePopularity >= 60,
    build: () => ({
      headline: "International preseason invitation",
      body: "A league partner has invited your team to play an international preseason exhibition - great exposure, at the cost of a home preseason date.",
      options: [
        {
          id: "accept-trip",
          label: "Accept the trip",
          description:
            "Grow the global brand and collect the appearance fee, though local fans miss their preseason look at the team.",
          cashDeltaCents: 3.5 * M,
          fanHappinessDelta: -2,
          ownerConfidenceDelta: 1,
        },
        {
          id: "decline-trip",
          label: "Decline, stay home",
          description: "Prioritize practice time and keep the preseason game local.",
          cashDeltaCents: 0,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "decline-trip",
    }),
  },
  {
    kind: "DOCUMENTARY_CREW",
    severity: "STANDARD",
    eligible: (ctx) => ctx.starPlayer !== null || ctx.fanHappiness >= 70,
    build: () => ({
      headline: "A streaming network wants in",
      body: "A streaming network wants to embed a documentary crew with the team for the season - great exposure, but ownership worries about the distraction.",
      options: [
        {
          id: "full-access",
          label: "Grant full access",
          description:
            "Let the cameras roll everywhere - fans love the exposure, but ownership is wary of the locker-room distraction.",
          cashDeltaCents: 2.5 * M,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: -1,
        },
        {
          id: "limited-access",
          label: "Limited access only",
          description:
            "Cameras stay out of the locker room - a smaller payday, but ownership appreciates the caution.",
          cashDeltaCents: 0.8 * M,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "limited-access",
    }),
  },
  {
    kind: "JERSEY_REDESIGN",
    severity: "MINOR",
    eligible: () => true,
    build: () => ({
      headline: "A new jersey design is on the table",
      body: "Your uniform partner has proposed a bold new jersey design for next season.",
      options: [
        {
          id: "go-bold",
          label: "Go bold",
          description:
            "A striking new look drives pre-order buzz and merchandise revenue, though some traditionalists grumble.",
          cashDeltaCents: 2 * M,
          fanHappinessDelta: -1,
          ownerConfidenceDelta: 0,
        },
        {
          id: "stay-traditional",
          label: "Stay traditional",
          description: "Keep the classic look - fans who value continuity approve.",
          cashDeltaCents: 0,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "stay-traditional",
    }),
  },
  {
    kind: "MERCHANDISE_PUSH",
    severity: "MINOR",
    eligible: (ctx) => ctx.starPlayer !== null,
    build: () => ({
      headline: "A merchandise push built around your breakout star",
      body: "Marketing wants to build a full merchandise campaign around your rising star.",
      options: [
        {
          id: "full-campaign",
          label: "Invest in a full campaign",
          description: "Fans love the buzz, though it costs real money up front.",
          cashDeltaCents: -1 * M,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: 0,
        },
        {
          id: "skip-campaign",
          label: "Skip it, keep it low-key",
          description: "Save the money - ownership appreciates the restraint.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "skip-campaign",
    }),
  },

  // -------------------------------------------------------------------
  // Sponsorship & Commercial
  // Deals. Each "sign" option carries a sponsorshipDeal payload (a real,
  // multi-year commitment) rather than an instant cash delta - the
  // recurring value lands at each season boundary once the deal is
  // ACTIVE, not the moment it's signed. Every card also offers "decline,"
  // which is deliberately each card's defaultOptionId: ignoring a real
  // revenue opportunity is the understood cost of inaction, the same
  // philosophy Phase 1's crisis cards already established.
  // -------------------------------------------------------------------
  {
    kind: "SPONSORSHIP_BET_ON_YOURSELF",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isEarlySeasonWindow,
    build: (ctx) => ({
      headline: "A national apparel brand wants your jersey patch",
      body: "A national apparel partner is offering either a short, flexible deal or a longer one at a lower annual rate.",
      options: [
        {
          id: "sign-short",
          label: "1-year deal at $18M",
          description:
            "Guaranteed money now, and you're free to negotiate a richer deal next year if your popularity rises.",
          cashDeltaCents: 0,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: 0,
          sponsorshipDeal: {
            kind: "JERSEY_PATCH",
            label: "Jersey patch partner",
            termSeasons: 1,
            annualValueCents: Math.round(18 * M * ctx.marketingMultiplier),
            conditionLeaguePlayerId: null,
            conditionPlayerName: null,
            franchiseValueUpsideFraction: 0,
          },
        },
        {
          id: "sign-long",
          label: "5-year deal at $22M/yr",
          description:
            "More money locked in, for longer - ownership loves the guaranteed revenue, but it caps your upside if the team takes off.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
          sponsorshipDeal: {
            kind: "JERSEY_PATCH",
            label: "Jersey patch partner",
            termSeasons: 5,
            annualValueCents: Math.round(22 * M * ctx.marketingMultiplier),
            conditionLeaguePlayerId: null,
            conditionPlayerName: null,
            franchiseValueUpsideFraction: 0,
          },
        },
        {
          id: "decline",
          label: "Pass on the offer",
          description: "Keep the jersey clean - ownership isn't thrilled about the missed revenue.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "decline",
    }),
  },
  {
    kind: "SPONSORSHIP_STAR_CLAUSE",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isEarlySeasonWindow && ctx.starPlayer !== null,
    build: (ctx) => {
      const star = ctx.starPlayer!;
      return {
        headline: "Arena naming rights, with strings attached",
        body: `A regional bank wants naming rights on your arena - $32M a year for four years - but only as long as ${star.fullName} stays on your roster. Trade him away and the deal voids, with a real penalty.`,
        options: [
          {
            id: "sign",
            label: "Sign the deal",
            description: `$32M/yr for 4 years, contingent on keeping ${star.fullName}. Real roster flexibility, priced.`,
            cashDeltaCents: 0,
            fanHappinessDelta: 1,
            ownerConfidenceDelta: 0,
            sponsorshipDeal: {
              kind: "ARENA_NAMING_RIGHTS",
              label: `Arena naming rights (contingent on ${star.fullName})`,
              termSeasons: 4,
              annualValueCents: Math.round(32 * M * ctx.marketingMultiplier),
              conditionLeaguePlayerId: star.leaguePlayerId,
              conditionPlayerName: star.fullName,
              franchiseValueUpsideFraction: 0,
            },
          },
          {
            id: "decline",
            label: "Pass on the offer",
            description:
              "Keep full roster flexibility - ownership isn't thrilled about the missed revenue.",
            cashDeltaCents: 0,
            fanHappinessDelta: 0,
            ownerConfidenceDelta: -1,
          },
        ],
        defaultOptionId: "decline",
      };
    },
  },
  {
    kind: "SPONSORSHIP_UNPOPULAR_MONEY",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isEarlySeasonWindow,
    build: (ctx) => ({
      headline: "An unpopular brand wants to pay above market",
      body: "A brand your fans aren't fond of is offering well above market rate for an apparel partnership.",
      options: [
        {
          id: "sign",
          label: "Sign the deal - $20M/yr, 3 years",
          description:
            "Real money, but fans are vocal about not wanting this brand associated with the team.",
          cashDeltaCents: 0,
          fanHappinessDelta: -4,
          ownerConfidenceDelta: 1,
          sponsorshipDeal: {
            kind: "APPAREL_PARTNER",
            label: "Apparel partner (fan-unpopular brand)",
            termSeasons: 3,
            annualValueCents: Math.round(20 * M * ctx.marketingMultiplier),
            conditionLeaguePlayerId: null,
            conditionPlayerName: null,
            franchiseValueUpsideFraction: 0,
          },
        },
        {
          id: "decline",
          label: "Pass on the offer",
          description: "Fans are relieved - ownership isn't thrilled about the missed revenue.",
          cashDeltaCents: 0,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "decline",
    }),
  },
  {
    kind: "SPONSORSHIP_EQUITY_SWAP",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isEarlySeasonWindow,
    build: (ctx) => ({
      headline: "An investor wants equity, not just ad space",
      body: "An international partner is offering a lower annual fee in exchange for a small stake in the franchise's future value - a bet on your long-term trajectory.",
      options: [
        {
          id: "sign",
          label: "Sign the equity deal - $10M/yr, 4 years",
          description:
            "Less cash up front, but a small ongoing lift to your franchise value for as long as the deal runs.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
          sponsorshipDeal: {
            kind: "INTERNATIONAL_PARTNERSHIP",
            label: "International equity partner",
            termSeasons: 4,
            annualValueCents: Math.round(10 * M * ctx.marketingMultiplier),
            conditionLeaguePlayerId: null,
            conditionPlayerName: null,
            franchiseValueUpsideFraction: 0.03,
          },
        },
        {
          id: "decline",
          label: "Pass on the offer",
          description:
            "Keep the franchise's ownership structure simple - ownership isn't thrilled about the missed opportunity.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "decline",
    }),
  },

  // -------------------------------------------------------------------
  // Business Decision catalog expansion (2026-08-06) - team-performance-
  // driven variety, so the inbox reacts to how your season is actually
  // going rather than drawing from one flat pool regardless of context.
  // See docs/FINANCES_PILLAR_DESIGN.md Part 7.
  // -------------------------------------------------------------------

  // --- Win streak (currentStreak >= STREAK_CARD_THRESHOLD) ---
  {
    kind: "HOT_STREAK_MEDIA_FEATURE",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak >= STREAK_CARD_THRESHOLD,
    build: () => ({
      headline: "Local news wants a feature on your hot streak",
      body: "A local news outlet wants embedded access to cover the winning streak up close.",
      options: [
        {
          id: "grant-access",
          label: "Grant access",
          description:
            "Let the cameras in - fans eat it up, though ownership eyes the locker-room distraction warily.",
          cashDeltaCents: 1.5 * M,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: -1,
        },
        {
          id: "stay-focused",
          label: "Stay focused, keep them out",
          description:
            "Protect the locker room and keep the streak the only story - ownership approves the discipline.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "stay-focused",
    }),
  },
  {
    kind: "MOMENTUM_MERCHANDISE_SURGE",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak >= STREAK_CARD_THRESHOLD,
    build: () => ({
      headline: "A 'hot streak' merchandise run is ready to go",
      body: "The business office has mocked up a limited streak-themed merchandise line and wants a green light before the moment passes.",
      options: [
        {
          id: "rush-to-market",
          label: "Rush it to market",
          description:
            "Capitalize on the streak right now - real money fast, though the rushed production run has thinner margins ownership notices.",
          cashDeltaCents: 2 * M,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: -1,
        },
        {
          id: "do-it-right",
          label: "Take the time to do it right",
          description:
            "A smaller, better-made run that ships later - less exciting timing, but ownership likes the cleaner margins.",
          cashDeltaCents: 0.5 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "do-it-right",
    }),
  },
  {
    kind: "BANDWAGON_SPONSOR_INTEREST",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak >= STREAK_CARD_THRESHOLD,
    build: (ctx) => ({
      headline: "A new sponsor wants in on the momentum",
      body: "A sponsor who's been on the sidelines wants a short-term deal, betting the streak keeps the spotlight on the team.",
      options: [
        {
          id: "sign",
          label: "Sign the streak-rate deal - 2 years",
          description:
            "Lock in real money now, at a rate inflated by the moment - ownership likes the bet on a hot hand.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
          sponsorshipDeal: {
            kind: "APPAREL_PARTNER",
            label: "Momentum sponsor",
            termSeasons: 2,
            annualValueCents: Math.round(9 * M * ctx.marketingMultiplier),
            conditionLeaguePlayerId: null,
            conditionPlayerName: null,
            franchiseValueUpsideFraction: 0,
          },
        },
        {
          id: "wait",
          label: "Wait for a streak-independent offer",
          description:
            "Pass for now - if the momentum holds, a stronger offer not priced off a hot streak may follow.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "wait",
    }),
  },

  // --- Loss streak (currentStreak <= -STREAK_CARD_THRESHOLD) ---
  {
    kind: "SEASON_TICKET_HOLDER_BACKLASH",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak <= -STREAK_CARD_THRESHOLD,
    build: () => ({
      headline: "Season-ticket holders are asking for concessions",
      body: "A bloc of season-ticket holders, frustrated by the skid, is asking the front office for a goodwill gesture.",
      options: [
        {
          id: "offer-gesture",
          label: "Offer a goodwill gesture",
          description:
            "A credit toward next season smooths things over with fans, though ownership questions the cost of appeasement.",
          cashDeltaCents: -1.5 * M,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: -1,
        },
        {
          id: "hold-firm",
          label: "Hold firm on pricing",
          description:
            "No concessions - ownership approves the discipline, but the frustration doesn't go away quietly.",
          cashDeltaCents: 0,
          fanHappinessDelta: -4,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "hold-firm",
    }),
  },
  {
    kind: "BOOSTER_CLUB_PATIENCE_TEST",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak <= -STREAK_CARD_THRESHOLD,
    build: () => ({
      headline: "A prominent booster club questions the direction",
      body: "A well-known local supporters' group has gone public questioning where the franchise is headed during the skid.",
      options: [
        {
          id: "engage-publicly",
          label: "Engage them publicly",
          description:
            "Address it head-on and steady the fanbase - it works, but ownership isn't thrilled you looked rattled enough to respond.",
          cashDeltaCents: 0,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: -1,
        },
        {
          id: "stay-quiet",
          label: "Stay quiet, let it pass",
          description: "No response - free, but the frustration keeps building unanswered.",
          cashDeltaCents: 0,
          fanHappinessDelta: -3,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "stay-quiet",
    }),
  },
  {
    kind: "LOCAL_MEDIA_CRITICISM_CYCLE",
    severity: "STANDARD",
    eligible: (ctx) => ctx.currentStreak <= -STREAK_CARD_THRESHOLD,
    build: () => ({
      headline: "Beat reporters have turned openly critical",
      body: "The local beat has shifted from patient to pointed during the skid, and a network wants your response on camera.",
      options: [
        {
          id: "sit-down-interview",
          label: "Grant a sit-down interview",
          description:
            "Address the criticism directly - costs a real media-relations spend, and fans respond to the accountability.",
          cashDeltaCents: -1 * M,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: 0,
        },
        {
          id: "decline-comment",
          label: "Decline comment",
          description:
            "Free, but the critical cycle continues unanswered and fans notice the silence.",
          cashDeltaCents: 0,
          fanHappinessDelta: -2,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "decline-comment",
    }),
  },

  // --- Playoff contention ---
  {
    kind: "PLAYOFF_PUSH_TICKET_DEMAND",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isPlayoffContender,
    build: () => ({
      headline: "Ticket demand is spiking with a playoff race on",
      body: "With the team in the thick of a playoff race, the business office wants to raise prices for the stretch run.",
      options: [
        {
          id: "raise-prices",
          label: "Raise prices for the stretch run",
          description:
            "Capture the demand while it's hot - real money, though fans grumble about the timing of the gouge.",
          cashDeltaCents: 2.5 * M,
          fanHappinessDelta: -2,
          ownerConfidenceDelta: 1,
        },
        {
          id: "hold-pricing",
          label: "Hold pricing steady",
          description:
            "Leave money on the table, but fans notice you didn't take advantage of the moment.",
          cashDeltaCents: 0,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "hold-pricing",
    }),
  },
  {
    kind: "NATIONAL_TV_SLOT_REQUEST",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isPlayoffContender,
    build: () => ({
      headline: "A national broadcaster wants to flex one of your games",
      body: "A national broadcaster wants to move one of your home games into a marquee primetime slot.",
      options: [
        {
          id: "accept-flex",
          label: "Accept the flex",
          description:
            "Real money and national exposure - but the schedule shuffle irritates some season-ticket holders.",
          cashDeltaCents: 3 * M,
          fanHappinessDelta: -1,
          ownerConfidenceDelta: 1,
        },
        {
          id: "decline-flex",
          label: "Decline, keep the schedule as-is",
          description: "No disruption for ticket holders - and no payday either.",
          cashDeltaCents: 0,
          fanHappinessDelta: 1,
          ownerConfidenceDelta: -1,
        },
      ],
      defaultOptionId: "decline-flex",
    }),
  },
  {
    kind: "PLAYOFF_WATCH_PARTY_PROPOSAL",
    severity: "MINOR",
    eligible: (ctx) => ctx.isPlayoffContender,
    build: () => ({
      headline: "The business office wants to run playoff watch parties",
      body: "For any road playoff games, the business office wants to run paid watch parties at the arena.",
      options: [
        {
          id: "greenlight",
          label: "Greenlight it",
          description:
            "A modest investment in staging and promotion - fans love having somewhere to gather, and it turns a profit, though ownership would rather see that spend saved.",
          cashDeltaCents: 1 * M,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: -1,
        },
        {
          id: "pass",
          label: "Pass on it",
          description:
            "Ownership appreciates the restraint - but fans notice the missed chance to gather for a playoff run.",
          cashDeltaCents: 0,
          fanHappinessDelta: -1,
          ownerConfidenceDelta: 1,
        },
      ],
      defaultOptionId: "pass",
    }),
  },

  // --- Lottery-bound ---
  {
    kind: "TANK_WATCH_FAN_FRUSTRATION",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isLotteryBound,
    build: () => ({
      headline: "Fans and media are speculating about tanking",
      body: "With the team near the bottom of the standings, fans and local media are openly asking whether the front office is playing to lose.",
      options: [
        {
          id: "commit-to-competing",
          label: "Publicly commit to competing every night",
          description:
            "Say the right things - ownership isn't fully convinced given the record, but fans appreciate hearing it.",
          cashDeltaCents: 0,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: -1,
        },
        {
          id: "stay-silent",
          label: "Stay silent, let it ride",
          description: "No statement - free, but the speculation keeps eating at fan patience.",
          cashDeltaCents: 0,
          fanHappinessDelta: -2,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "stay-silent",
    }),
  },
  {
    kind: "REBUILD_PATIENCE_APPEAL",
    severity: "STANDARD",
    eligible: (ctx) => ctx.isLotteryBound,
    build: () => ({
      headline: "Ownership wants help selling the fanbase on patience",
      body: "Ownership asks the front office to run a public messaging campaign asking fans to trust the rebuild.",
      options: [
        {
          id: "run-campaign",
          label: "Run the campaign",
          description:
            "A real marketing spend buys real patience - fan happiness holds up much better through the rest of a tough season.",
          cashDeltaCents: -1.5 * M,
          fanHappinessDelta: 3,
          ownerConfidenceDelta: 1,
        },
        {
          id: "decline-campaign",
          label: "Decline to spend on messaging",
          description:
            "Save the money - but there's nothing softening the frustration of a hard season.",
          cashDeltaCents: 0,
          fanHappinessDelta: -1,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "decline-campaign",
    }),
  },

  // --- Blowout result (lastGameMargin) ---
  {
    kind: "SIGNATURE_WIN_HIGHLIGHT_DEAL",
    severity: "MINOR",
    eligible: (ctx) =>
      ctx.lastGameMargin !== null && ctx.lastGameMargin >= BLOWOUT_MARGIN_THRESHOLD,
    build: () => ({
      headline: "A highlight network wants rights to your blowout win",
      body: "A highlight-reel network wants to license footage from last night's lopsided win.",
      options: [
        {
          id: "sell-rights",
          label: "Sell the rights",
          description: "Take the payday - the network's reach is bigger than your own channels.",
          cashDeltaCents: 1 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
        },
        {
          id: "keep-in-house",
          label: "Keep it in-house",
          description:
            "Package it on your own team channels instead - less money, but fans like that the moment stays yours.",
          cashDeltaCents: 0,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "keep-in-house",
    }),
  },
  {
    kind: "EMBARRASSING_LOSS_DAMAGE_CONTROL",
    severity: "STANDARD",
    eligible: (ctx) =>
      ctx.lastGameMargin !== null && ctx.lastGameMargin <= -BLOWOUT_MARGIN_THRESHOLD,
    build: () => ({
      headline: "Ownership wants a response to the viral bad loss",
      body: "Last night's lopsided loss went viral for the wrong reasons, and ownership wants to know how you're addressing it.",
      options: [
        {
          id: "address-head-on",
          label: "Address it head-on",
          description:
            "A short press response taking it seriously - ownership respects the accountability, at a small cost.",
          cashDeltaCents: -0.5 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 1,
        },
        {
          id: "let-it-blow-over",
          label: "Let it blow over",
          description: "Say nothing and move on - free, but fans are left stewing on it.",
          cashDeltaCents: 0,
          fanHappinessDelta: -2,
          ownerConfidenceDelta: 0,
        },
      ],
      defaultOptionId: "let-it-blow-over",
    }),
  },
];

/** How many PENDING decisions a team's inbox can hold at once before new business events stop rolling - the decision-fatigue guardrail from the design doc. */
export const MAX_PENDING_BUSINESS_DECISIONS = 3;

/**
 * Picks one eligible card uniformly at random and builds its content.
 * Returns null if nothing in the catalog is currently eligible (shouldn't
 * normally happen - several cards have no gating - but callers must not
 * assume a card always comes back).
 */
export function rollForBusinessDecision(
  ctx: BusinessDecisionContext,
  rng: () => number = Math.random,
): BusinessDecisionContent | null {
  const eligible = CATALOG.filter((c) => c.eligible(ctx));
  if (eligible.length === 0) return null;
  const chosen = eligible[Math.floor(rng() * eligible.length)];
  const content = chosen.build(ctx);
  return {
    kind: chosen.kind,
    severity: chosen.severity,
    deadlineDays: DEADLINE_DAYS_BY_SEVERITY[chosen.severity],
    ...content,
  };
}

// ---------------------------------------------------------------------------
// "Ownership as a Character."
// Hand-built, NOT part of CATALOG/rollForBusinessDecision - offseason.ts
// calls these directly, exactly when it's about to issue a payroll
// directive or financial mandate (see advanceSeasonAction), turning what
// used to be a silent, one-way announcement into a real negotiation: accept
// the standard terms, or push back and stake a bigger swing on delivering
// more. A generous deadline (most of a season) since this is a considered
// negotiation, not an in-season crisis needing an answer in days.
// ---------------------------------------------------------------------------

const NEGOTIATION_DEADLINE_DAYS = 60;

export function buildPayrollDirectiveNegotiation(args: {
  payrollReductionTargetCents: number;
  deadlineSeason: number;
}): BusinessDecisionContent {
  const targetLabel = formatCentsCompact(args.payrollReductionTargetCents);
  return {
    kind: "OWNERSHIP_PAYROLL_NEGOTIATION",
    severity: "MAJOR",
    headline: "Ownership wants payroll under control",
    body: `Ownership expects total payroll under ${targetLabel} by the ${args.deadlineSeason}-${(args.deadlineSeason + 1).toString().slice(-2)} season. You can accept those terms, or push back and stake something bigger on the outcome.`,
    options: [
      {
        id: "accept",
        label: "Accept the terms",
        description:
          "The standard directive stands as issued - a normal reward if you comply, a normal hit if you don't.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
      },
      {
        id: "push-back",
        label: "Push back and stake your job on it",
        description:
          "Ownership respects the confidence - but the reward for hitting the target is much bigger now, and so is the cost of missing it.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 1,
        directiveStake: "PAYROLL_DIRECTIVE",
      },
    ],
    defaultOptionId: "accept",
    deadlineDays: NEGOTIATION_DEADLINE_DAYS,
  };
}

export function buildFinancialMandateNegotiation(args: {
  deadlineSeason: number;
}): BusinessDecisionContent {
  return {
    kind: "OWNERSHIP_FINANCIAL_NEGOTIATION",
    severity: "MAJOR",
    headline: "Ownership demands a return to profitability",
    body: `Sustained losses have ownership's attention. They expect the franchise back in the black by the ${args.deadlineSeason}-${(args.deadlineSeason + 1).toString().slice(-2)} season. Accept those terms, or push back and stake something bigger on the outcome.`,
    options: [
      {
        id: "accept",
        label: "Accept the terms",
        description:
          "The standard mandate stands as issued - a normal reward if you deliver, a normal hit if you don't.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
      },
      {
        id: "push-back",
        label: "Push back and stake your job on it",
        description:
          "Ownership respects the confidence - but the reward for turning things around is much bigger now, and so is the cost of missing it.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 1,
        directiveStake: "FINANCIAL_MANDATE",
      },
    ],
    defaultOptionId: "accept",
    deadlineDays: NEGOTIATION_DEADLINE_DAYS,
  };
}
