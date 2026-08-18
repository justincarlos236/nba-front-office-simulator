import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One price for a free agent, and a refusal the user can read.
 *
 * **Two defects, one report: "I'm unable to sign any free agents."**
 *
 *   1. The offer page quoted a salary computed one way and `signFreeAgentAction`
 *      required a salary computed another - different performance inputs, and
 *      only the action applied rival demand or scaled the ask into what the
 *      player would actually accept. Typing the figure the page suggested was
 *      refused. This is the fourth defect of that shape in this codebase: a
 *      display path reading different data from the logic path beside it.
 *   2. The refusal was thrown, and **Next.js redacts the message of any error
 *      thrown out of a server action in a production build**. On the deployed
 *      site every failure arrived as the generic fallback, so the user could
 *      not see that the player had simply held out for more.
 *
 * Neither is reachable from a unit test of the functions involved - both
 * functions were correct in isolation. What was wrong was which one a caller
 * used, and how the answer travelled. Hence source scans.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const ACTION = "src/lib/actions/freeagency.ts";
const OFFER_PAGE = "src/app/leagues/[id]/free-agents/[leaguePlayerId]/page.tsx";
const FORM = "src/components/freeagency/SignOfferForm.tsx";

describe("the quote and the requirement come from one place", () => {
  it.each([
    ["the offer page", OFFER_PAGE],
    ["the signing action", ACTION],
  ])("has %s resolve the market rather than price the player itself", (_label, file) => {
    const source = read(file);
    expect(source).toContain("resolveFreeAgentMarket");
  });

  it.each([
    ["the offer page", OFFER_PAGE],
    ["the signing action", ACTION],
  ])("keeps %s away from the pricing primitives directly", (_label, file) => {
    // `priceContractCents` and `contractQualityScore` are how the two copies
    // drifted: same function, different arguments. Reaching for them here means
    // a second opinion about what a free agent costs has been reintroduced.
    const source = read(file);
    for (const banned of ["priceContractCents", "contractQualityScore", "demandAdjustedPriceCents"])
      expect(source, `${file} should get its price from resolveFreeAgentMarket`).not.toContain(
        banned,
      );
  });

  it("quotes the salary the player will actually accept", () => {
    // Not the asking price and not the demand-adjusted ask - the figure the
    // action compares the offer against. Anything else puts the suggestion
    // back out of step with the answer.
    expect(read(OFFER_PAGE)).toContain("market.requiredSalaryCents");
  });
});

describe("a refusal survives a production build", () => {
  it("never throws an expected failure out of the signing action", () => {
    // Every user-caused refusal must be returned. A thrown message is replaced
    // by Next with a generic string plus a digest, which is what made this
    // screen read as broken rather than as a rule being applied.
    const source = read(ACTION);
    const thrown = source.match(/throw new Error\([^)]*/g) ?? [];
    expect(
      thrown,
      "Return `fail({ summary, remedy })` instead - a thrown message is redacted in production.",
    ).toEqual([]);
  });

  it("returns the failure as a value the caller checks", () => {
    expect(read(ACTION)).toContain("SignFreeAgentResult");
    expect(read(FORM)).toContain("result.ok");
  });

  it("tells the user what the player would have signed for", () => {
    // The single most useful sentence on this screen, and the one that was
    // being swallowed. Without a figure the user has nothing to act on.
    expect(read(ACTION)).toContain("requiredSalaryCents");
    expect(read(ACTION)).toMatch(/turned this down/);
  });
});
