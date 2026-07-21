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
  for (let i = 0; i < 4; i++) {
    if (
      await page
        .getByText("League Champion", { exact: true })
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.getByText("Simulate next round").click();
    await expect(page.getByText(/Round \d complete|championship series is decided/)).toBeVisible({
      timeout: 30_000,
    });
  }
  await expect(page.getByText("League Champion", { exact: true })).toBeVisible();

  // Advancing the season now also requires the draft to be finished (see
  // draft.spec.ts for the full draft-flow test) - run it to completion
  // here too, since this test needs to reach the "ready to advance" state.
  await page.goto(`/leagues/${leagueId}/draft`);
  await page.getByText("Start the draft").click();
  await expect(page.getByText("The lottery is in and the draft class is set.")).toBeVisible({
    timeout: 30_000,
  });
  for (let i = 0; i < 15; i++) {
    if (
      await page
        .getByText("The draft is complete")
        .isVisible()
        .catch(() => false)
    )
      break;

    const userTurn = await page
      .getByText(/You're on the clock/)
      .isVisible()
      .catch(() => false);

    if (userTurn) {
      const draftButtons = page.getByRole("button", { name: "Draft" });
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
      await expect(page.getByText(/Resolved \d+ pick|The draft is complete/).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(500);
    }
  }
  await expect(page.getByText("The draft is complete")).toBeVisible({ timeout: 15_000 });

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
  const remainingText = await page.getByText(/games remaining league-wide/).textContent();
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
