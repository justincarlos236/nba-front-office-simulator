import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

const isWindows = process.platform === "win32";

// Playoffs need a fully-played regular season; finishing one via 18
// UI-driven "simulate 50" clicks is what season-simulation.spec.ts already
// covers and would make this test prohibitively slow, so the regular
// season here is fast-forwarded directly via a `tsx` script (see
// scripts/e2e-fast-forward-season.ts) and only the new playoffs flow
// itself is driven through the browser.
test.setTimeout(3 * 60_000);

function fastForwardRegularSeason(leagueId: string) {
  // `npx` is a .cmd shim on Windows - execFileSync needs shell:true to
  // resolve it there, but that's unnecessary (and a needless shell
  // dependency) on POSIX where `npx` is a real executable on PATH.
  execFileSync("npx", ["tsx", "scripts/e2e-fast-forward-season.ts", leagueId], {
    stdio: "inherit",
    shell: isWindows,
  });
}

test("start the playoffs and simulate to a champion", async ({ page }) => {
  const email = `playoffs-e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "Playoffs E2E",
    team: "Boston Celtics",
  });

  const leagueId = new URL(page.url()).pathname.split("/")[2];
  fastForwardRegularSeason(leagueId);

  // A full ~58-game/team season gives the league-events system (see
  // src/lib/actions/leagueEvents.ts) hundreds of independent per-game rolls
  // for injuries alone, so asserting "at least one shows up" is a safe,
  // non-flaky check - not a claim about the exact count or mix.
  await page.goto(`/leagues/${leagueId}/transactions`);
  await expect(page.getByRole("heading", { name: "Transactions & News" })).toBeVisible();
  await expect(
    page.getByText(/suffers|has been cleared to return|signed|traded/).first(),
  ).toBeVisible();

  await page.goto(`/leagues/${leagueId}/playoffs`);
  await expect(page.getByRole("heading", { name: /Playoffs/ })).toBeVisible();

  await page.getByText("Start playoffs (simulate play-in)").click();
  await expect(page.getByText(/Round 1 matchups are set/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Play-In Tournament" })).toBeVisible();
  // "Round 1" appears once per conference column in the bracket - just
  // confirm it rendered at all, not which side.
  await expect(page.getByRole("heading", { name: "Round 1" }).first()).toBeVisible();

  // Advance the bracket, playing the user's own series game-by-game via the
  // live flow whenever it's pending (see playLiveSeriesGameAction/
  // simulateRoundAction in playoffs.ts - the user's own series is
  // deliberately excluded from bulk resolution), and bulk-resolving every
  // other series via "Simulate next round"/"Simulate other series" -
  // until a champion is crowned. A generous iteration cap (not "1 per
  // round") because each "Play Game" cycle now consumes one iteration too
  // (a best-of-7 series can take up to 7), and at the Finals the user's
  // own series is the *only* one in the round, so a bulk click there is a
  // no-op message that still needs a follow-up cycle to actually play the
  // pending game. Worst realistic case: up to 7 games/round across all 4
  // rounds plus a handful of bulk-resolve clicks - 40 leaves comfortable
  // headroom.
  for (let i = 0; i < 40; i++) {
    if (
      await page
        .getByText(/NBA Champions/)
        .isVisible()
        .catch(() => false)
    )
      break;

    if (
      await page
        .getByRole("link", { name: /Play Game \d/ })
        .isVisible()
        .catch(() => false)
    ) {
      // "Play Game N" and "Back to playoffs" are plain <a> tags (a hard
      // reload, not a client-side Link) - see PlayoffControls.tsx/
      // PostgameSummary.tsx for why - so explicitly wait for each
      // navigation to actually land before interacting with the new
      // page, rather than relying on locator auto-wait alone.
      await page.getByRole("link", { name: /Play Game \d/ }).click();
      await page.waitForURL(/\/playoffs\/live\//, { timeout: 15_000 });
      await page.getByRole("button", { name: "Tip off" }).click();
      await page.getByRole("button", { name: "Sim to End" }).click();
      await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("link", { name: "Back to playoffs" }).click();
      await page.waitForURL(/\/playoffs$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: /Playoffs/ })).toBeVisible();
      continue;
    }

    // Defensive: the champion can get crowned by another tab/refresh
    // between the check above and here (e.g. the round-4 bulk-resolve
    // itself crowns it), so confirm the button is still actually there
    // before clicking rather than assuming it - otherwise this click hangs
    // forever waiting for text that will never (re)appear.
    const simButton = page.getByText(/Simulate next round|Simulate other series/);
    if (!(await simButton.isVisible().catch(() => false))) {
      await page.waitForTimeout(300);
      continue;
    }
    await simButton.click();
    await expect(
      page.getByText(/Round \d complete|championship series is decided|No other series left/),
    ).toBeVisible({ timeout: 30_000 });
  }

  await expect(page.getByText(/NBA Champions/)).toBeVisible({ timeout: 30_000 });

  await page.goto(`/leagues/${leagueId}/standings`);
  await expect(page.getByText("Recent Results")).toBeVisible();
});
