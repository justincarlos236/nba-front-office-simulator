import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// Needs a fully-played regular season and a crowned playoff champion before
// the offseason can begin, so the regular season is fast-forwarded via a
// tsx script (see playoffs.spec.ts for why) and only the playoffs +
// offseason flow itself is driven through the browser.
test.setTimeout(3 * 60_000);

const isWindows = process.platform === "win32";

function fastForwardRegularSeason(leagueId: string) {
  execFileSync("npx", ["tsx", "scripts/e2e-fast-forward-season.ts", leagueId], {
    stdio: "inherit",
    shell: isWindows,
  });
}

test("play through the playoffs, then advance to the next season", async ({ page }) => {
  const email = `offseason-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Offseason E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });

  const leagueId = new URL(page.url()).pathname.split("/")[2];
  fastForwardRegularSeason(leagueId);

  await page.goto(`/leagues/${leagueId}/offseason`);
  await expect(page.getByRole("heading", { name: /Offseason/ })).toBeVisible();
  await expect(
    page.getByText("Crown a champion in the playoffs before advancing to the next season."),
  ).toBeVisible();

  await page.goto(`/leagues/${leagueId}/playoffs`);
  await page.getByText("Start playoffs (simulate play-in)").click();
  await expect(page.getByText(/Round 1 matchups are set/)).toBeVisible({ timeout: 30_000 });
  // Advance the bracket, playing the user's own series game-by-game via the
  // live flow whenever it's pending (see playoffs.spec.ts for the full
  // explanation), and bulk-resolving every other series via "Simulate next
  // round"/"Simulate other series" - until a champion is crowned. A
  // generous iteration cap (not "1 per round") because each "Play Game"
  // cycle now consumes one iteration too (a best-of-7 series can take up
  // to 7), and at the Finals the user's own series is the *only* one in
  // the round, so a bulk click there is a no-op message that still needs
  // a follow-up cycle to actually play the pending game. Worst realistic
  // case: up to 7 games/round across all 4 rounds plus a handful of
  // bulk-resolve clicks - 40 leaves comfortable headroom.
  for (let i = 0; i < 40; i++) {
    if (
      await page
        .getByText("League Champion", { exact: true })
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
  await expect(page.getByText("League Champion", { exact: true })).toBeVisible();

  // Advancing the season now also requires the draft to be finished (see
  // draft.spec.ts for the full draft-flow test) - run it to completion
  // here too, since this test needs to reach the "ready to advance" state.
  await page.goto(`/leagues/${leagueId}/draft`);
  await page.getByRole("link", { name: "Go to the Draft Lottery" }).click();
  await page.waitForURL(/\/draft\/lottery$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Start the Lottery" }).click();
  await expect(page.getByRole("button", { name: "Skip to Results" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Skip to Results" }).click();
  await expect(page.getByText("Lottery Complete")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Go to the Draft" }).click();
  await page.waitForURL(/\/draft$/, { timeout: 15_000 });
  for (let i = 0; i < 15; i++) {
    if (
      await page
        .getByText("Every pick is in the books.")
        .isVisible()
        .catch(() => false)
    )
      break;

    // The broadcast header's "YOU'RE ON THE CLOCK" badge - see
    // draft.spec.ts for why this is a reliable turn signal.
    const userTurn = await page
      .getByText(/on the clock/i)
      .isVisible()
      .catch(() => false);

    if (userTurn) {
      // exact: true - otherwise this substring-matches the "My Draft
      // Board" bookmark-filter toggle too (which sorts earlier in the
      // DOM), and .first() would click that instead of an actual prospect.
      const draftButtons = page.getByRole("button", { name: "Draft", exact: true });
      await expect(draftButtons.first()).toBeVisible({ timeout: 15_000 });
      await draftButtons.first().click();
      await expect(page.getByText(/You selected/)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);
    } else {
      const advanceButton = page.getByRole("button", { name: "Simulate to your next pick" });
      if (!(await advanceButton.isVisible().catch(() => false))) {
        await page.waitForTimeout(500);
        continue;
      }
      await advanceButton.click();
      const skipButton = page.getByRole("button", { name: "Skip Ahead" });
      if (await skipButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await skipButton.click();
      }
      await expect(
        page.getByText(/Resolved \d+ pick|Every pick is in the books\./).first(),
      ).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(500);
    }
  }
  await expect(page.getByText("Every pick is in the books.")).toBeVisible({ timeout: 15_000 });

  await page.goto(`/leagues/${leagueId}/offseason`);
  await expect(page.getByRole("heading", { name: /2023-24 Offseason/ })).toBeVisible();
  await expect(page.getByText(/Advance to the .* season/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Salary cap: \$[\d.]+M/)).toBeVisible();

  const advanceButton = page.getByRole("button", { name: /Advance to the 2024-25 season/ });
  await expect(advanceButton).toBeVisible();
  await advanceButton.click();
  // advanceSeasonAction is the single heaviest server action in the app
  // (player development for the whole league, retirements, awards, GM
  // accountability evaluation - see docs/ARCHITECTURE.md) - a generous
  // timeout here isn't masking a bug, it's matching the real cost.
  await expect(page.getByText(/Welcome to the 2024-25 season/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /2024-25 Offseason/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2023-24 Season Awards" })).toBeVisible();
  await expect(page.getByText("Most Valuable Player")).toBeVisible();

  // Standings should have reset for the new season, not carried over wins,
  // and a fresh schedule of unplayed games should exist.
  await page.goto(`/leagues/${leagueId}/standings`);
  await expect(page.getByRole("heading", { name: /2024-25 Standings/ })).toBeVisible();
  const remainingText = await page.getByText(/games remaining on your schedule/).textContent();
  const remaining = Number(remainingText?.match(/(\d+) games/)?.[1]);
  expect(remaining).toBeGreaterThan(0);

  // The completed 2023-24 season should now show up in League History, with
  // its champion and awards - the same underlying data the offseason page
  // showed transiently, now durably browsable.
  await page.goto(`/leagues/${leagueId}/history`);
  await expect(page.getByRole("heading", { name: "League History" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2023-24" })).toBeVisible();
  await expect(page.getByText("NBA Champions")).toBeVisible();
  await expect(page.getByText("Most Valuable Player")).toBeVisible();
});
