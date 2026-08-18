import { prisma } from "@/lib/prisma";
import { computeLeaguePhase, type LeaguePhase } from "@/lib/league/leaguePhase";
import { getJobSecurityLevel } from "@/lib/gm/jobSecurity";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import { simplifyCapStatus, type SimpleCapStatus } from "@/lib/cap/capStatusLabel";
import { formatCentsCompact } from "@/lib/money";
import { computeTeamNeeds, TEAM_NEED_LABEL, type TeamNeed } from "@/lib/gm/teamNeeds";
import { resolveRotation } from "@/lib/rotation/resolveRotation";
import { getMoraleLevel } from "@/lib/morale/moraleLevel";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { StaffRole } from "@/generated/prisma/client";
import { GUIDE_TOPICS } from "@/lib/guide/registry";

/**
 * The "Action Center" - a small, fixed-priority catalog of recommended
 * next actions, each grounded in real already-computable state (never an
 * invented signal). Same "pure decision logic, thin DB-fetch shell" shape
 * as `leaguePhase.ts`.
 */
export interface ActionCenterItem {
  id: string;
  severity: "critical" | "warning" | "info";
  label: string;
  description: string;
  href: string;
  /**
   * "Why is this recommended?" (Onboarding Philosophy Phase 2 - see
   * docs/ONBOARDING_DESIGN.md Part 4B.2). The state this rule actually
   * tested, in plain English - never a new signal, just the reasoning
   * behind the one that already fired. Optional only because a handful of
   * items (e.g. a pending playoff game) are self-explanatory enough that
   * restating them would be noise.
   */
  reasoning?: string;
  /** What happens if the player ignores this. Paired with `reasoning`. */
  consequence?: string;
}

/** How many items the dashboard actually displays - kept in one place. */
export const ACTION_CENTER_DISPLAY_LIMIT = 3;

export interface ActionCenterRosterPlayer {
  fullName: string;
  overallRating: number;
  injuryStatus: string;
  contractEndSeason: number | null;
  rotation: RosterPlayerForSimulation;
  /** Player Morale & Personality System. */
  morale: number;
  tradeRequestActive: boolean;
}

export interface ActionCenterInput {
  leagueId: string;
  currentSeason: number;
  phase: LeaguePhase;
  ownerConfidence: number;
  payrollReductionTargetCents: bigint | null;
  payrollDirectiveSeason: number | null;
  totalSalaryCents: bigint;
  capSpaceCents: bigint;
  simpleCapStatus: SimpleCapStatus;
  teamNeeds: TeamNeed[];
  pendingPlayoffGame: { seriesId: string; gameNumber: number; opponentLabel: string } | null;
  /** True only when the regular season is underway but no game has been played yet this season - i.e. the very start of a save. */
  noGamesPlayedThisSeasonYet: boolean;
  allStarWeekendPending: boolean;
  pendingDraftLottery: boolean;
  yourPickIsUp: boolean;
  roster: ActionCenterRosterPlayer[];
  staffVacancies: StaffRole[];
  /** An unsolicited CPU trade offer awaiting a decision. Null when none is open. */
  pendingTradeOffer: { tradeId: string; fromTeamLabel: string } | null;
  /** Finances as a Gameplay Pillar - the Front Office Inbox. Null when nothing's pending. */
  pendingBusinessDecisions: {
    count: number;
    earliestDeadlineDays: number;
    hasBreaking: boolean;
  } | null;
}

// A rotation-caliber Minimum Contract is roughly this much - below it, "you
// have cap space" isn't really actionable advice.
const MEANINGFUL_CAP_SPACE_CENTS = 5_000_000n * 100n;

const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  HEAD_COACH: "Head Coach",
  PLAYER_DEVELOPMENT_COACH: "Player Development Coach",
  MEDICAL_STAFF: "Medical Staff",
};

function findInjuredStarter(roster: ActionCenterRosterPlayer[]): ActionCenterRosterPlayer | null {
  const ranked = resolveRotation(roster.map((r) => r.rotation));
  for (const entry of ranked) {
    const player = roster.find((r) => r.rotation.leaguePlayerId === entry.player.leaguePlayerId);
    if (player && (player.injuryStatus === "OUT" || player.injuryStatus === "SEASON_ENDING")) {
      return player;
    }
  }
  return null;
}

function findExpiringKeyPlayer(
  roster: ActionCenterRosterPlayer[],
  currentSeason: number,
): ActionCenterRosterPlayer | null {
  const expiring = roster.filter(
    (p) =>
      p.contractEndSeason === currentSeason &&
      (getPlayerValueTier(p.overallRating) === "STARTER" ||
        getPlayerValueTier(p.overallRating) === "ROTATION"),
  );
  if (expiring.length === 0) return null;
  return expiring.reduce((best, p) => (p.overallRating > best.overallRating ? p : best));
}

export function computeActionCenterItems(input: ActionCenterInput): ActionCenterItem[] {
  const items: ActionCenterItem[] = [];
  const base = `/leagues/${input.leagueId}`;

  // Onboarding Philosophy Phase 2 (docs/ONBOARDING_DESIGN.md Beat 2) - the
  // audit's sharpest finding: `simulateGamesAction` was only ever reachable
  // from Standings/Schedule, so a brand-new GM's dashboard never said how to
  // actually play. This fires exactly once per league (regular season
  // underway, zero games played yet) and self-clears the moment any game is
  // simulated - no new state, no separate "seen it" flag to track.
  if (input.phase === "regular-season" && input.noGamesPlayedThisSeasonYet) {
    items.push({
      id: "first-games-not-simulated",
      severity: "info",
      label: "Ready for your first games",
      description: "Head to Standings or Schedule and simulate a batch of games to get started.",
      href: `${base}/standings`,
      reasoning:
        "Your roster and rotation are set up - the season itself only moves forward once you simulate games.",
      consequence: "Nothing plays on its own - the calendar sits still until you do.",
    });
  }

  if (input.pendingPlayoffGame) {
    items.push({
      id: "pending-playoff-game",
      severity: "info",
      label: `Game ${input.pendingPlayoffGame.gameNumber} vs ${input.pendingPlayoffGame.opponentLabel} is ready`,
      description: "Your next playoff game is set - watch it live and see the series shift.",
      href: `${base}/playoffs/live/${input.pendingPlayoffGame.seriesId}`,
      reasoning:
        "The playoffs are single-elimination best-of-seven series - miss the cut and the season simply ends, so every game matters.",
      consequence: "The series can't move to its next game until this one is played.",
    });
  }

  if (input.pendingTradeOffer) {
    items.push({
      id: "pending-trade-offer",
      severity: "info",
      label: `${input.pendingTradeOffer.fromTeamLabel} have made you an offer`,
      description: "Another front office wants one of your players. Review the terms.",
      href: `${base}/trades/offers/${input.pendingTradeOffer.tradeId}`,
      reasoning:
        "Rival teams pursue players who fill their own roster holes, so an offer is a signal about how the league values someone on your roster.",
      consequence: "The offer stays open until you accept or decline it.",
    });
  }

  if (input.allStarWeekendPending) {
    items.push({
      id: "all-star-weekend-pending",
      severity: "info",
      label: "All-Star Weekend has arrived",
      description: "Resolve the weekend's events before the regular season can continue.",
      href: `${base}/all-star`,
      reasoning:
        "The league pauses for All-Star Weekend once its scheduled point in the calendar arrives - it's a checkpoint on the league's best performers so far, not something you manage.",
      consequence: "The regular season can't resume until the weekend is resolved.",
    });
  }

  if (input.pendingDraftLottery) {
    // the draft class is revealed
    // before the lottery runs on purpose (docs/SCOUTING_PILLAR_DESIGN.md
    // Part 3.0): scouting without knowing where you'll pick is the whole
    // point. Points at the Draft page (where scouting now lives) rather
    // than straight at the lottery, so this doesn't nudge the player past
    // the window the redesign exists to create.
    items.push({
      id: "pending-draft-lottery",
      severity: "info",
      label: "The draft class is in - scout it before the lottery",
      description: "Spend your scouting assignments now; run the lottery whenever you're ready.",
      href: `${base}/draft`,
      reasoning:
        "The class is revealed before the lottery runs, so you're scouting without knowing where you'll actually pick - that's what makes it a real bet.",
      consequence:
        "The draft itself can't start until the lottery sets the full pick order, so there's no rush - but any scouting you haven't spent yet is time you can't get back once the draft begins.",
    });
  }

  if (input.yourPickIsUp) {
    items.push({
      id: "your-pick-is-up",
      severity: "info",
      label: "You're on the clock",
      description: "The draft is waiting on your team's next pick.",
      href: `${base}/draft`,
      reasoning:
        "The draft runs pick by pick in lottery order - it's paused until you make this selection.",
      consequence: "Every other team's pick is waiting behind yours.",
    });
  }

  // a BREAKING decision is
  // critical (it's already blocking simulation, same as job security);
  // otherwise it's a warning once the earliest deadline is close, and info
  // if there's still real runway.
  if (input.pendingBusinessDecisions) {
    const { count, earliestDeadlineDays, hasBreaking } = input.pendingBusinessDecisions;
    items.push({
      id: "pending-business-decisions",
      severity: hasBreaking ? "critical" : earliestDeadlineDays <= 3 ? "warning" : "info",
      label:
        count === 1
          ? "The front office needs your call on something"
          : `${count} business decisions awaiting your response`,
      description:
        earliestDeadlineDays <= 0
          ? "The earliest deadline has arrived - respond now or the default option applies."
          : `Earliest deadline in ${earliestDeadlineDays} day${earliestDeadlineDays === 1 ? "" : "s"}.`,
      href: `${base}/finances/inbox`,
      reasoning:
        "The front office - your business staff, ownership, or the league - occasionally needs a real decision from you, not just an FYI.",
      consequence: hasBreaking
        ? "A BREAKING decision blocks simulation entirely until you respond."
        : "Missing the deadline doesn't stop the season, but a default option gets applied automatically in your place.",
    });
  }

  const jobSecurity = getJobSecurityLevel(input.ownerConfidence);
  if (jobSecurity === "HOT_SEAT" || jobSecurity === "CRITICAL") {
    items.push({
      id: "job-security-critical",
      severity: "critical",
      label:
        jobSecurity === "CRITICAL"
          ? "Your job is genuinely at risk"
          : "Ownership's patience is running out",
      description: "See the GM Job Security card below for what ownership expects right now.",
      href: "#gm-job-security",
      reasoning:
        "Ownership sets an expectation for your team every season based on payroll and roster quality, then compares what actually happened against it - falling short repeatedly costs confidence, and confidence is what your job security is based on.",
      consequence:
        "If confidence keeps dropping, you can be fired before the season you're trying to save even finishes.",
    });
  }

  if (input.phase === "ready") {
    items.push({
      id: "ready-to-advance",
      severity: "info",
      label: "Ready to advance to next season",
      description: "The draft is complete and every offseason gate is clear.",
      href: `${base}/offseason`,
      reasoning:
        "Every offseason step - re-signings, the draft, free agency - is done, so there's nothing left blocking the calendar from moving forward.",
      consequence:
        "Nothing urgent - the season won't advance until you choose to, so take your time with any remaining moves first.",
    });
  }

  if (
    input.payrollReductionTargetCents != null &&
    input.payrollDirectiveSeason != null &&
    input.totalSalaryCents > input.payrollReductionTargetCents
  ) {
    items.push({
      id: "payroll-directive-unmet",
      severity: "warning",
      label: "Ownership's payroll directive isn't met yet",
      description: `Get total payroll under ${formatCentsCompact(input.payrollReductionTargetCents)} before the ${input.payrollDirectiveSeason}-${(input.payrollDirectiveSeason + 1).toString().slice(-2)} season.`,
      href: `${base}/offseason`,
      reasoning:
        "Ownership issued this directive because your job security dropped low enough while payroll stayed high - it's a specific, escapable condition, not a permanent judgment.",
      consequence:
        "Meeting it repairs some confidence; ignoring it costs you more on top of what already triggered it.",
    });
  }

  const injuredStarter = findInjuredStarter(input.roster);
  const hasCustomRotation = input.roster.some((r) => (r.rotation.rotationSlot ?? null) !== null);
  if (injuredStarter) {
    items.push({
      id: "rotation-injured-starter",
      severity: "warning",
      label: `${injuredStarter.fullName} is out but still in your rotation`,
      description: "Adjust your depth chart so a healthy player picks up those minutes.",
      href: `${base}/rotation`,
      reasoning:
        "The simulation steers minutes toward your set rotation - an OUT or season-ending player still holding a slot means those minutes aren't going to anyone healthy.",
      consequence:
        "You're effectively playing shorthanded until the depth chart is fixed, even though a healthy replacement is available on your bench.",
    });
  } else if (!hasCustomRotation) {
    items.push({
      id: "rotation-never-set",
      severity: "info",
      label: "You haven't set your rotation yet",
      description: "Set your starting five, bench order, and target minutes.",
      href: `${base}/rotation`,
      reasoning:
        "With no rotation set, the simulation falls back to its own default ordering rather than your judgment on who should play and how much.",
      consequence:
        "Games will still simulate fine, but you're leaving playing-time decisions - and the wins that come with getting them right - on the table.",
    });
  }

  // Player Morale & Personality System - a standing trade request is
  // always the most urgent morale situation; only surface the trending-
  // toward-it warning when nobody has actually escalated yet, so the two
  // never both compete for the display slot at once.
  const demandingTrade = input.roster.find((p) => p.tradeRequestActive);
  const trendingDisgruntled = input.roster.find(
    (p) => !p.tradeRequestActive && getMoraleLevel(p.morale) === "DISGRUNTLED",
  );
  if (demandingTrade) {
    items.push({
      id: "player-demanding-trade",
      severity: "critical",
      label: `${demandingTrade.fullName} has requested a trade`,
      description: "Address the situation or explore moving him before it affects the locker room.",
      href: `${base}/trades/new`,
      reasoning:
        "Morale is driven by real events - playing time, winning, being traded - and a player who stays Disgruntled long enough formally escalates to demanding a trade.",
      consequence:
        "An unresolved demand keeps affecting the locker room the longer it sits - it doesn't resolve itself.",
    });
  } else if (trendingDisgruntled) {
    items.push({
      id: "player-trending-unhappy",
      severity: "warning",
      label: `${trendingDisgruntled.fullName} is growing seriously unhappy`,
      description: "See what's driving his morale, and what to expect if it isn't addressed.",
      href: GUIDE_TOPICS.morale.href,
      reasoning:
        "Morale is driven by real events - playing time relative to what he expects, winning, and roster moves - and his has settled at the lowest level, one step from a formal trade demand.",
      consequence: "If nothing changes, he's likely to formally demand a trade next.",
    });
  }

  const expiringKeyPlayer = findExpiringKeyPlayer(input.roster, input.currentSeason);
  if (expiringKeyPlayer) {
    items.push({
      id: "expiring-key-player",
      severity: "info",
      label: `${expiringKeyPlayer.fullName}'s contract expires after this season`,
      description: "Plan ahead - your Re-Signing Rights give you an edge once free agency opens.",
      href: GUIDE_TOPICS["re-signing-rights"].href,
      reasoning:
        "His contract runs out at the end of this season - once it expires, he becomes a free agent, though you'll keep an edge over outside teams trying to sign him.",
      consequence:
        "Wait too long without a plan and an outside team can still make a competing offer once free agency opens.",
    });
  }

  if (input.staffVacancies.length > 0) {
    const [role] = input.staffVacancies;
    items.push({
      id: "staff-vacancy",
      severity: role === "HEAD_COACH" ? "warning" : "info",
      label: `You have no ${STAFF_ROLE_LABEL[role]} hired`,
      description:
        "Hire one - every staff role has a real effect on the court, not just cosmetics.",
      href: `${base}/staff`,
      reasoning:
        "Every staff role does something mechanical - a Head Coach affects win probability, a Player Development Coach affects how your players age, and Medical Staff affects injury frequency and recovery time.",
      consequence:
        role === "HEAD_COACH"
          ? "Without a Head Coach, you're missing out on a real win-probability boost every game."
          : "This vacancy has a real, ongoing cost - it just compounds more quietly than a missing Head Coach.",
    });
  }

  if (
    input.simpleCapStatus === "UNDER_CAP" &&
    input.capSpaceCents >= MEANINGFUL_CAP_SPACE_CENTS &&
    input.teamNeeds.length > 0
  ) {
    items.push({
      id: "cap-space-and-need",
      severity: "info",
      label: `${formatCentsCompact(input.capSpaceCents)} in cap space, and a need at ${TEAM_NEED_LABEL[input.teamNeeds[0]]}`,
      description: "Free agency or a trade could close that gap while you have the room.",
      href: `${base}/free-agents`,
      reasoning:
        "Cap space is only useful while you're Under the Cap - once other moves push you Over the Cap or into the Luxury Tax, signing outside free agents gets a lot more restricted.",
      consequence:
        "Cap space you don't use doesn't carry over any special value into next season - it's a now-or-later opportunity, not a saved resource.",
    });
  }

  return items;
}

export async function getActionCenterItems(
  leagueId: string,
  league: {
    currentSeason: number;
    userControlledTeamId: string | null;
    ownerConfidence: number;
    payrollReductionTargetCents: bigint | null;
    payrollDirectiveSeason: number | null;
  },
  precomputed: {
    totalSalaryCents: bigint;
    capSpaceCents: bigint;
    simpleCapStatus: SimpleCapStatus;
    teamNeeds: TeamNeed[];
    roster: ActionCenterRosterPlayer[];
  },
): Promise<ActionCenterItem[]> {
  const userTeamId = league.userControlledTeamId;
  if (!userTeamId) return [];
  const season = league.currentSeason;

  const [
    phase,
    pendingSeries,
    allStarWeekend,
    staff,
    startedDraftPicks,
    nextPendingPick,
    pendingDecisions,
    lastPlayedGame,
    pendingTradeOfferRow,
  ] = await Promise.all([
    computeLeaguePhase(leagueId, season),
    prisma.playoffSeries.findFirst({
      where: {
        leagueId,
        season,
        winnerTeamId: null,
        OR: [{ higherSeedTeamId: userTeamId }, { lowerSeedTeamId: userTeamId }],
      },
      include: {
        higherSeedTeam: { include: { team: true } },
        lowerSeedTeam: { include: { team: true } },
      },
    }),
    prisma.allStarWeekend.findUnique({ where: { leagueId_season: { leagueId, season } } }),
    prisma.staff.findMany({
      where: { leagueId, leagueTeamId: userTeamId },
      select: { role: true },
    }),
    prisma.draftPick.count({ where: { leagueId, season, overallPickNumber: { not: null } } }),
    prisma.draftPick.findFirst({
      where: { leagueId, season, overallPickNumber: { not: null }, selectedProspectId: null },
      orderBy: { overallPickNumber: "asc" },
      select: { currentOwnerId: true },
    }),
    // the Front Office Inbox.
    prisma.businessDecision.findMany({
      where: { leagueId, leagueTeamId: userTeamId, status: "PENDING" },
      orderBy: { deadlineDayIndex: "asc" },
      select: { deadlineDayIndex: true, severity: true },
    }),
    prisma.game.findFirst({
      where: {
        leagueId,
        season,
        type: "REGULAR_SEASON",
        playedAt: { not: null },
        OR: [{ homeLeagueTeamId: userTeamId }, { awayLeagueTeamId: userTeamId }],
      },
      orderBy: { dayIndex: "desc" },
      select: { dayIndex: true },
    }),
    // An unsolicited CPU offer. Only one is ever open at a time - see
    // `maybeProposeCpuTradeToUser` for why a queue would rot.
    prisma.trade.findFirst({
      where: { leagueId, status: "PROPOSED" },
      orderBy: { createdAt: "desc" },
      // `Trade.proposedById` is a scalar with no relation on the model, so the
      // proposing club's name is resolved from `league.teams` below rather
      // than joined here.
      select: { id: true, proposedById: true },
    }),
  ]);

  const pendingBusinessDecisions =
    pendingDecisions.length > 0
      ? {
          count: pendingDecisions.length,
          earliestDeadlineDays: Math.max(
            0,
            pendingDecisions[0].deadlineDayIndex - (lastPlayedGame?.dayIndex ?? 0),
          ),
          hasBreaking: pendingDecisions.some((d) => d.severity === "BREAKING"),
        }
      : null;

  const pendingPlayoffGame = pendingSeries
    ? (() => {
        const isHigherSeed = pendingSeries.higherSeedTeamId === userTeamId;
        const opponent = isHigherSeed ? pendingSeries.lowerSeedTeam : pendingSeries.higherSeedTeam;
        const gameNumber = pendingSeries.higherSeedWins + pendingSeries.lowerSeedWins + 1;
        return {
          seriesId: pendingSeries.id,
          gameNumber,
          opponentLabel: `${opponent.team.city} ${opponent.team.name}`,
        };
      })()
    : null;

  // Resolved from a direct lookup because `Trade.proposedById` carries no
  // relation on the model.
  const proposingTeamLabel = pendingTradeOfferRow
    ? await prisma.leagueTeam
        .findUnique({
          where: { id: pendingTradeOfferRow.proposedById },
          select: { team: { select: { city: true, name: true } } },
        })
        .then((lt) => (lt ? `${lt.team.city} ${lt.team.name}` : null))
    : null;

  const filledRoles = new Set(staff.map((s) => s.role));
  const staffVacancies = (
    ["HEAD_COACH", "PLAYER_DEVELOPMENT_COACH", "MEDICAL_STAFF"] as StaffRole[]
  ).filter((role) => !filledRoles.has(role));

  return computeActionCenterItems({
    leagueId,
    currentSeason: season,
    phase,
    ownerConfidence: league.ownerConfidence,
    payrollReductionTargetCents: league.payrollReductionTargetCents,
    payrollDirectiveSeason: league.payrollDirectiveSeason,
    totalSalaryCents: precomputed.totalSalaryCents,
    capSpaceCents: precomputed.capSpaceCents,
    simpleCapStatus: precomputed.simpleCapStatus,
    teamNeeds: precomputed.teamNeeds,
    pendingPlayoffGame,
    pendingTradeOffer: pendingTradeOfferRow
      ? {
          tradeId: pendingTradeOfferRow.id,
          fromTeamLabel: proposingTeamLabel ?? "A rival club",
        }
      : null,
    noGamesPlayedThisSeasonYet: lastPlayedGame == null,
    allStarWeekendPending: allStarWeekend?.status === "PENDING",
    pendingBusinessDecisions,
    // `pre-draft` is now the phase
    // whose entire definition is "champion crowned, lottery not run yet"
    // (see leaguePhase.ts), so this condition simplifies to just checking
    // the phase. Previously gated on `phase === "draft-incomplete" &&
    // startedDraftPicks === 0`, a combination `deriveLeaguePhase` can no
    // longer produce - draft-incomplete now implies the lottery already ran.
    pendingDraftLottery: phase === "pre-draft",
    yourPickIsUp:
      phase === "draft-incomplete" &&
      startedDraftPicks > 0 &&
      nextPendingPick?.currentOwnerId === userTeamId,
    roster: precomputed.roster,
    staffVacancies,
  });
}
