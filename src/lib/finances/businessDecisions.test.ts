import { describe, it, expect } from "vitest";
import {
  rollForBusinessDecision,
  MAX_PENDING_BUSINESS_DECISIONS,
  buildPayrollDirectiveNegotiation,
  buildFinancialMandateNegotiation,
  type BusinessDecisionContext,
} from "./businessDecisions";

const baseCtx: BusinessDecisionContext = {
  cashReserveCents: 50_000_000n * 100n,
  fanHappiness: 65,
  franchisePopularity: 50,
  starPlayer: null,
  ticketPricingPosture: "STANDARD",
  isEarlySeasonWindow: false,
  marketingMultiplier: 1,
  currentStreak: 0,
  isPlayoffContender: false,
  isLotteryBound: false,
  lastGameMargin: null,
};

const starCtx: BusinessDecisionContext = {
  ...baseCtx,
  starPlayer: { leaguePlayerId: "lp-star-1", fullName: "Test Star" },
};

// Deterministic rng helpers - picks index 0 (first eligible card) or forces
// a specific fraction through the pool.
function rngAt(fraction: number): () => number {
  return () => fraction;
}

describe("rollForBusinessDecision", () => {
  it("always returns at least 2 options, none of them a free lunch", () => {
    for (let i = 0; i < 50; i++) {
      const content = rollForBusinessDecision(baseCtx, rngAt(i / 50));
      expect(content).not.toBeNull();
      expect(content!.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of content!.options) {
        const isFree =
          opt.cashDeltaCents === 0 && opt.fanHappinessDelta === 0 && opt.ownerConfidenceDelta === 0;
        expect(isFree).toBe(false);
      }
    }
  });

  it("every option's id is a valid defaultOptionId candidate and defaultOptionId matches a real option", () => {
    for (let i = 0; i < 20; i++) {
      const content = rollForBusinessDecision(baseCtx, rngAt(i / 20));
      const ids = content!.options.map((o) => o.id);
      expect(ids).toContain(content!.defaultOptionId);
    }
  });

  it("no option is strictly dominant on the instant-effect axes (excluding sponsorship-deal options, whose real trade-off is committed recurring revenue vs. flexibility - not captured by 3 instant numbers)", () => {
    for (let i = 0; i < 50; i++) {
      const content = rollForBusinessDecision(baseCtx, rngAt(i / 50));
      const opts = content!.options.filter((o) => !o.sponsorshipDeal);
      for (const a of opts) {
        for (const b of opts) {
          if (a.id === b.id) continue;
          const dominates =
            a.cashDeltaCents >= b.cashDeltaCents &&
            a.fanHappinessDelta >= b.fanHappinessDelta &&
            a.ownerConfidenceDelta >= b.ownerConfidenceDelta &&
            (a.cashDeltaCents > b.cashDeltaCents ||
              a.fanHappinessDelta > b.fanHappinessDelta ||
              a.ownerConfidenceDelta > b.ownerConfidenceDelta);
          expect(dominates).toBe(false);
        }
      }
    }
  });

  it("TICKETING_SCANDAL only appears when ticket pricing is PREMIUM", () => {
    const premiumCtx = { ...baseCtx, ticketPricingPosture: "PREMIUM" as const };
    let sawScandalAtStandard = false;
    let sawScandalAtPremium = false;
    for (let i = 0; i < 200; i++) {
      const standard = rollForBusinessDecision(baseCtx, rngAt(i / 200));
      if (standard?.kind === "TICKETING_SCANDAL") sawScandalAtStandard = true;
      const premium = rollForBusinessDecision(premiumCtx, rngAt(i / 200));
      if (premium?.kind === "TICKETING_SCANDAL") sawScandalAtPremium = true;
    }
    expect(sawScandalAtStandard).toBe(false);
    expect(sawScandalAtPremium).toBe(true);
  });

  it("TICKETING_SCANDAL is BREAKING severity - the card that halts simulation", () => {
    const premiumCtx = { ...baseCtx, ticketPricingPosture: "PREMIUM" as const };
    const results = Array.from({ length: 200 }, (_, i) =>
      rollForBusinessDecision(premiumCtx, rngAt(i / 200)),
    ).filter((c) => c?.kind === "TICKETING_SCANDAL");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r!.severity).toBe("BREAKING");
  });

  it("MERCHANDISE_PUSH only appears with a star player on the roster", () => {
    let sawWithoutStar = false;
    let sawWithStar = false;
    for (let i = 0; i < 200; i++) {
      if (rollForBusinessDecision(baseCtx, rngAt(i / 200))?.kind === "MERCHANDISE_PUSH") {
        sawWithoutStar = true;
      }
      if (rollForBusinessDecision(starCtx, rngAt(i / 200))?.kind === "MERCHANDISE_PUSH") {
        sawWithStar = true;
      }
    }
    expect(sawWithoutStar).toBe(false);
    expect(sawWithStar).toBe(true);
  });

  it("SPONSOR_PULLOUT only appears while fan happiness is low", () => {
    const strugglingCtx = { ...baseCtx, fanHappiness: 30 };
    const thrivingCtx = { ...baseCtx, fanHappiness: 90 };
    let sawStruggling = false;
    let sawThriving = false;
    for (let i = 0; i < 200; i++) {
      if (rollForBusinessDecision(strugglingCtx, rngAt(i / 200))?.kind === "SPONSOR_PULLOUT") {
        sawStruggling = true;
      }
      if (rollForBusinessDecision(thrivingCtx, rngAt(i / 200))?.kind === "SPONSOR_PULLOUT") {
        sawThriving = true;
      }
    }
    expect(sawStruggling).toBe(true);
    expect(sawThriving).toBe(false);
  });

  it("deadlineDays scales with severity - BREAKING is the shortest fuse", () => {
    const premiumCtx = { ...baseCtx, ticketPricingPosture: "PREMIUM" as const };
    const breaking = Array.from({ length: 100 }, (_, i) =>
      rollForBusinessDecision(premiumCtx, rngAt(i / 100)),
    ).find((c) => c?.severity === "BREAKING");
    const minor = Array.from({ length: 100 }, (_, i) =>
      rollForBusinessDecision(baseCtx, rngAt(i / 100)),
    ).find((c) => c?.severity === "MINOR");
    expect(breaking).toBeDefined();
    expect(minor).toBeDefined();
    expect(breaking!.deadlineDays).toBeLessThan(minor!.deadlineDays);
  });

  it("exposes a sane cap on pending decisions", () => {
    expect(MAX_PENDING_BUSINESS_DECISIONS).toBeGreaterThan(0);
    expect(MAX_PENDING_BUSINESS_DECISIONS).toBeLessThanOrEqual(5);
  });
});

describe("Phase 2 - sponsorship cards", () => {
  const earlyCtx: BusinessDecisionContext = { ...baseCtx, isEarlySeasonWindow: true };
  const earlyStarCtx: BusinessDecisionContext = { ...starCtx, isEarlySeasonWindow: true };
  const SPONSORSHIP_KINDS = [
    "SPONSORSHIP_BET_ON_YOURSELF",
    "SPONSORSHIP_STAR_CLAUSE",
    "SPONSORSHIP_UNPOPULAR_MONEY",
    "SPONSORSHIP_EQUITY_SWAP",
  ];

  it("no sponsorship card ever appears outside the early-season window", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(starCtx, rngAt(i / 300));
      expect(SPONSORSHIP_KINDS).not.toContain(content?.kind);
    }
  });

  it("SPONSORSHIP_STAR_CLAUSE only appears with a star player, and only in the early window", () => {
    let sawWithStarEarly = false;
    let sawWithoutStarEarly = false;
    for (let i = 0; i < 300; i++) {
      if (
        rollForBusinessDecision(earlyStarCtx, rngAt(i / 300))?.kind === "SPONSORSHIP_STAR_CLAUSE"
      ) {
        sawWithStarEarly = true;
      }
      if (rollForBusinessDecision(earlyCtx, rngAt(i / 300))?.kind === "SPONSORSHIP_STAR_CLAUSE") {
        sawWithoutStarEarly = true;
      }
    }
    expect(sawWithStarEarly).toBe(true);
    expect(sawWithoutStarEarly).toBe(false);
  });

  it("every sponsorship card's default option is 'decline' and creates no deal", () => {
    const seenKinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(earlyStarCtx, rngAt(i / 300));
      if (!content || !SPONSORSHIP_KINDS.includes(content.kind)) continue;
      seenKinds.add(content.kind);
      expect(content.defaultOptionId).toBe("decline");
      const defaultOption = content.options.find((o) => o.id === content.defaultOptionId);
      expect(defaultOption?.sponsorshipDeal).toBeUndefined();
    }
    expect(seenKinds.size).toBe(SPONSORSHIP_KINDS.length);
  });

  it("every non-decline sponsorship option carries a real deal payload with a positive term and value", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(earlyStarCtx, rngAt(i / 300));
      if (!content || !SPONSORSHIP_KINDS.includes(content.kind)) continue;
      for (const opt of content.options) {
        if (opt.id === "decline") continue;
        expect(opt.sponsorshipDeal).toBeDefined();
        expect(opt.sponsorshipDeal!.termSeasons).toBeGreaterThan(0);
        expect(opt.sponsorshipDeal!.annualValueCents).toBeGreaterThan(0);
      }
    }
  });

  it("SPONSORSHIP_STAR_CLAUSE's sign option names the exact star player from context", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(earlyStarCtx, rngAt(i / 300));
      if (content?.kind !== "SPONSORSHIP_STAR_CLAUSE") continue;
      const sign = content.options.find((o) => o.id === "sign");
      expect(sign?.sponsorshipDeal?.conditionLeaguePlayerId).toBe(
        starCtx.starPlayer!.leaguePlayerId,
      );
      expect(sign?.sponsorshipDeal?.conditionPlayerName).toBe(starCtx.starPlayer!.fullName);
    }
  });

  it("SPONSORSHIP_UNPOPULAR_MONEY's sign option costs fan happiness in exchange for above-market pay", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(earlyCtx, rngAt(i / 300));
      if (content?.kind !== "SPONSORSHIP_UNPOPULAR_MONEY") continue;
      const sign = content.options.find((o) => o.id === "sign");
      expect(sign?.fanHappinessDelta).toBeLessThan(0);
      expect(sign?.sponsorshipDeal?.annualValueCents).toBeGreaterThan(0);
    }
  });

  it("SPONSORSHIP_EQUITY_SWAP's sign option carries a franchise-value upside fraction", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(earlyCtx, rngAt(i / 300));
      if (content?.kind !== "SPONSORSHIP_EQUITY_SWAP") continue;
      const sign = content.options.find((o) => o.id === "sign");
      expect(sign?.sponsorshipDeal?.franchiseValueUpsideFraction).toBeGreaterThan(0);
    }
  });
});

describe("Phase 3 - ownership negotiation cards", () => {
  it("buildPayrollDirectiveNegotiation defaults to 'accept' and only 'push-back' stakes anything", () => {
    const content = buildPayrollDirectiveNegotiation({
      payrollReductionTargetCents: 120_000_000 * 100,
      deadlineSeason: 2027,
    });
    expect(content.defaultOptionId).toBe("accept");
    const accept = content.options.find((o) => o.id === "accept");
    const pushBack = content.options.find((o) => o.id === "push-back");
    expect(accept?.directiveStake).toBeUndefined();
    expect(pushBack?.directiveStake).toBe("PAYROLL_DIRECTIVE");
  });

  it("buildPayrollDirectiveNegotiation's body names the real dollar target and season", () => {
    const content = buildPayrollDirectiveNegotiation({
      payrollReductionTargetCents: 120_000_000 * 100,
      deadlineSeason: 2027,
    });
    expect(content.body).toContain("2027");
    expect(content.body).toMatch(/\$120/);
  });

  it("buildFinancialMandateNegotiation defaults to 'accept' and only 'push-back' stakes anything", () => {
    const content = buildFinancialMandateNegotiation({ deadlineSeason: 2028 });
    expect(content.defaultOptionId).toBe("accept");
    const accept = content.options.find((o) => o.id === "accept");
    const pushBack = content.options.find((o) => o.id === "push-back");
    expect(accept?.directiveStake).toBeUndefined();
    expect(pushBack?.directiveStake).toBe("FINANCIAL_MANDATE");
  });

  it("neither negotiation card's options ever creates a sponsorshipDeal", () => {
    const a = buildPayrollDirectiveNegotiation({
      payrollReductionTargetCents: 10 * 100_000_000,
      deadlineSeason: 2027,
    });
    const b = buildFinancialMandateNegotiation({ deadlineSeason: 2027 });
    for (const opt of [...a.options, ...b.options]) {
      expect(opt.sponsorshipDeal).toBeUndefined();
    }
  });
});

describe("Phase 4 - Marketing multiplier on sponsorship values", () => {
  const earlyCtx: BusinessDecisionContext = { ...baseCtx, isEarlySeasonWindow: true };

  it("a higher Marketing multiplier raises every sponsorship card's annualValueCents", () => {
    const boosted = { ...earlyCtx, marketingMultiplier: 1.5 };
    for (let i = 0; i < 300; i++) {
      const neutral = rollForBusinessDecision(earlyCtx, rngAt(i / 300));
      const withMarketing = rollForBusinessDecision(boosted, rngAt(i / 300));
      if (!neutral || !withMarketing) continue;
      for (const opt of neutral.options) {
        if (!opt.sponsorshipDeal) continue;
        const boostedOpt = withMarketing.options.find((o) => o.id === opt.id);
        expect(boostedOpt?.sponsorshipDeal?.annualValueCents).toBeGreaterThan(
          opt.sponsorshipDeal.annualValueCents,
        );
      }
    }
  });
});

describe("Business Decision catalog expansion (2026-08-06) - team-performance cards", () => {
  const WIN_STREAK_KINDS = [
    "HOT_STREAK_MEDIA_FEATURE",
    "MOMENTUM_MERCHANDISE_SURGE",
    "BANDWAGON_SPONSOR_INTEREST",
  ];
  const LOSS_STREAK_KINDS = [
    "SEASON_TICKET_HOLDER_BACKLASH",
    "BOOSTER_CLUB_PATIENCE_TEST",
    "LOCAL_MEDIA_CRITICISM_CYCLE",
  ];
  const CONTENDER_KINDS = [
    "PLAYOFF_PUSH_TICKET_DEMAND",
    "NATIONAL_TV_SLOT_REQUEST",
    "PLAYOFF_WATCH_PARTY_PROPOSAL",
  ];
  const LOTTERY_KINDS = ["TANK_WATCH_FAN_FRUSTRATION", "REBUILD_PATIENCE_APPEAL"];
  const ALL_NEW_KINDS = [
    ...WIN_STREAK_KINDS,
    ...LOSS_STREAK_KINDS,
    ...CONTENDER_KINDS,
    ...LOTTERY_KINDS,
    "SIGNATURE_WIN_HIGHLIGHT_DEAL",
    "EMBARRASSING_LOSS_DAMAGE_CONTROL",
  ];

  it("no win/loss-streak or contention card appears at a neutral baseline (streak 0, non-contender, non-lottery, no game margin)", () => {
    for (let i = 0; i < 300; i++) {
      const content = rollForBusinessDecision(baseCtx, rngAt(i / 300));
      expect(ALL_NEW_KINDS).not.toContain(content?.kind);
    }
  });

  it("win-streak cards only appear once currentStreak reaches the threshold", () => {
    const hotCtx = { ...baseCtx, currentStreak: 5 };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(hotCtx, rngAt(i / 400));
      if (content && WIN_STREAK_KINDS.includes(content.kind)) seen.add(content.kind);
    }
    expect(seen.size).toBe(WIN_STREAK_KINDS.length);
  });

  it("win-streak cards never appear on a loss streak", () => {
    const coldCtx = { ...baseCtx, currentStreak: -5 };
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(coldCtx, rngAt(i / 400));
      expect(WIN_STREAK_KINDS).not.toContain(content?.kind);
    }
  });

  it("loss-streak cards only appear once currentStreak drops to the negative threshold", () => {
    const coldCtx = { ...baseCtx, currentStreak: -5 };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(coldCtx, rngAt(i / 400));
      if (content && LOSS_STREAK_KINDS.includes(content.kind)) seen.add(content.kind);
    }
    expect(seen.size).toBe(LOSS_STREAK_KINDS.length);
  });

  it("loss-streak cards never appear on a win streak", () => {
    const hotCtx = { ...baseCtx, currentStreak: 5 };
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(hotCtx, rngAt(i / 400));
      expect(LOSS_STREAK_KINDS).not.toContain(content?.kind);
    }
  });

  it("playoff-contender cards only appear when isPlayoffContender is true", () => {
    const contenderCtx = { ...baseCtx, isPlayoffContender: true };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(contenderCtx, rngAt(i / 400));
      if (content && CONTENDER_KINDS.includes(content.kind)) seen.add(content.kind);
      const notContender = rollForBusinessDecision(baseCtx, rngAt(i / 400));
      expect(CONTENDER_KINDS).not.toContain(notContender?.kind);
    }
    expect(seen.size).toBe(CONTENDER_KINDS.length);
  });

  it("lottery-bound cards only appear when isLotteryBound is true", () => {
    const lotteryCtx = { ...baseCtx, isLotteryBound: true };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(lotteryCtx, rngAt(i / 400));
      if (content && LOTTERY_KINDS.includes(content.kind)) seen.add(content.kind);
      const notLottery = rollForBusinessDecision(baseCtx, rngAt(i / 400));
      expect(LOTTERY_KINDS).not.toContain(notLottery?.kind);
    }
    expect(seen.size).toBe(LOTTERY_KINDS.length);
  });

  it("SIGNATURE_WIN_HIGHLIGHT_DEAL only appears after a blowout win, never a blowout loss", () => {
    const bigWinCtx = { ...baseCtx, lastGameMargin: 30 };
    const bigLossCtx = { ...baseCtx, lastGameMargin: -30 };
    let sawOnWin = false;
    for (let i = 0; i < 400; i++) {
      if (
        rollForBusinessDecision(bigWinCtx, rngAt(i / 400))?.kind === "SIGNATURE_WIN_HIGHLIGHT_DEAL"
      ) {
        sawOnWin = true;
      }
      expect(rollForBusinessDecision(bigLossCtx, rngAt(i / 400))?.kind).not.toBe(
        "SIGNATURE_WIN_HIGHLIGHT_DEAL",
      );
    }
    expect(sawOnWin).toBe(true);
  });

  it("EMBARRASSING_LOSS_DAMAGE_CONTROL only appears after a blowout loss, never a blowout win", () => {
    const bigWinCtx = { ...baseCtx, lastGameMargin: 30 };
    const bigLossCtx = { ...baseCtx, lastGameMargin: -30 };
    let sawOnLoss = false;
    for (let i = 0; i < 400; i++) {
      if (
        rollForBusinessDecision(bigLossCtx, rngAt(i / 400))?.kind ===
        "EMBARRASSING_LOSS_DAMAGE_CONTROL"
      ) {
        sawOnLoss = true;
      }
      expect(rollForBusinessDecision(bigWinCtx, rngAt(i / 400))?.kind).not.toBe(
        "EMBARRASSING_LOSS_DAMAGE_CONTROL",
      );
    }
    expect(sawOnLoss).toBe(true);
  });

  it("neither blowout card appears when lastGameMargin is null or within the threshold", () => {
    const noMarginCtx = { ...baseCtx, lastGameMargin: null };
    const closeCtx = { ...baseCtx, lastGameMargin: 10 };
    for (let i = 0; i < 300; i++) {
      const a = rollForBusinessDecision(noMarginCtx, rngAt(i / 300));
      const b = rollForBusinessDecision(closeCtx, rngAt(i / 300));
      expect(["SIGNATURE_WIN_HIGHLIGHT_DEAL", "EMBARRASSING_LOSS_DAMAGE_CONTROL"]).not.toContain(
        a?.kind,
      );
      expect(["SIGNATURE_WIN_HIGHLIGHT_DEAL", "EMBARRASSING_LOSS_DAMAGE_CONTROL"]).not.toContain(
        b?.kind,
      );
    }
  });

  it("every one of the 13 new cards is reachable and follows the no-free/no-dominant-option rule", () => {
    const everythingCtx: BusinessDecisionContext = {
      ...baseCtx,
      currentStreak: 5,
      isPlayoffContender: true,
      isLotteryBound: false,
      lastGameMargin: 30,
    };
    const seen = new Map<string, ReturnType<typeof rollForBusinessDecision>>();
    for (let i = 0; i < 2000 && seen.size < ALL_NEW_KINDS.length; i++) {
      const content = rollForBusinessDecision(everythingCtx, rngAt(i / 2000));
      if (content && ALL_NEW_KINDS.includes(content.kind) && !seen.has(content.kind)) {
        seen.set(content.kind, content);
      }
    }
    // A team can't simultaneously be on a win streak + lottery-bound, or on
    // a win streak + a loss streak, or coming off a blowout win + a blowout
    // loss - so the loss-streak, lottery, and blowout-loss cards need their
    // own, separately-contradictory contexts to become reachable.
    const otherContexts = [
      { ...baseCtx, isLotteryBound: true },
      { ...baseCtx, currentStreak: -5 },
      { ...baseCtx, lastGameMargin: -30 },
    ];
    for (const ctx of otherContexts) {
      for (let i = 0; i < 2000 && seen.size < ALL_NEW_KINDS.length; i++) {
        const content = rollForBusinessDecision(ctx, rngAt(i / 2000));
        if (content && ALL_NEW_KINDS.includes(content.kind) && !seen.has(content.kind)) {
          seen.set(content.kind, content);
        }
      }
    }

    expect(seen.size).toBe(ALL_NEW_KINDS.length);

    for (const content of seen.values()) {
      expect(content!.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of content!.options) {
        const isFree =
          opt.cashDeltaCents === 0 && opt.fanHappinessDelta === 0 && opt.ownerConfidenceDelta === 0;
        expect(isFree).toBe(false);
      }
      const ids = content!.options.map((o) => o.id);
      expect(ids).toContain(content!.defaultOptionId);

      const opts = content!.options.filter((o) => !o.sponsorshipDeal);
      for (const a of opts) {
        for (const b of opts) {
          if (a.id === b.id) continue;
          const dominates =
            a.cashDeltaCents >= b.cashDeltaCents &&
            a.fanHappinessDelta >= b.fanHappinessDelta &&
            a.ownerConfidenceDelta >= b.ownerConfidenceDelta &&
            (a.cashDeltaCents > b.cashDeltaCents ||
              a.fanHappinessDelta > b.fanHappinessDelta ||
              a.ownerConfidenceDelta > b.ownerConfidenceDelta);
          expect(dominates).toBe(false);
        }
      }
    }
  });

  it("none of the 13 new cards is BREAKING severity", () => {
    const everythingCtx: BusinessDecisionContext = {
      ...baseCtx,
      currentStreak: 5,
      isPlayoffContender: true,
      lastGameMargin: 30,
    };
    const lotteryCtx = { ...baseCtx, isLotteryBound: true };
    for (let i = 0; i < 400; i++) {
      const a = rollForBusinessDecision(everythingCtx, rngAt(i / 400));
      const b = rollForBusinessDecision(lotteryCtx, rngAt(i / 400));
      for (const content of [a, b]) {
        if (content && ALL_NEW_KINDS.includes(content.kind)) {
          expect(content.severity).not.toBe("BREAKING");
        }
      }
    }
  });

  it("BANDWAGON_SPONSOR_INTEREST is the only new card carrying a sponsorshipDeal payload", () => {
    const hotCtx = { ...baseCtx, currentStreak: 5 };
    for (let i = 0; i < 400; i++) {
      const content = rollForBusinessDecision(hotCtx, rngAt(i / 400));
      if (!content || !ALL_NEW_KINDS.includes(content.kind)) continue;
      const hasDeal = content.options.some((o) => o.sponsorshipDeal);
      expect(hasDeal).toBe(content.kind === "BANDWAGON_SPONSOR_INTEREST");
    }
  });
});
