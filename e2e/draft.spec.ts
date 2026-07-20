import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// Needs a fully-played regular season and a crowned playoff champion
// before the draft can start, so the regular season is fast-forwarded
// via a tsx script (see playoffs.spec.ts for why) and only the draft
// flow itself is driven through the browser.
test.setTimeout(3 * 60_000);

const isWindows = process.platform === "win32";

function fastForwardRegularSeason(leagueId: string) {
  execFileSync("npx", ["tsx", "scripts/e2e-fast-forward-season.ts", leagueId], {
    stdio: "inherit",
    shell: isWindows,
  });
}

test("run the lottery and draft all 60 picks, including the user's own", async ({ page }) => {
  const email = `draft-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Draft E2E");
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

  await page.goto(`/leagues/${leagueId}/draft`);
  await expect(page.getByText("Crown a champion in the playoffs before the draft.")).toBeVisible();

  await page.goto(`/leagues/${leagueId}/playoffs`);
  await page.getByText("Start playoffs (simulate play-in)").click();
  await expect(page.getByText(/Round 1 matchups are set/)).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 4; i++) {
    if (
      await page
        .getByText("League Champion", { exact: true })
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    await page.getByText("Simulate next round").click();
    await expect(page.getByText(/Round \d complete|championship series is decided/)).toBeVisible({
      timeout: 30_000,
    });
  }
  await expect(page.getByText("League Champion", { exact: true })).toBeVisible();

  await page.goto(`/leagues/${leagueId}/draft`);
  await page.getByText("Start the draft").click();
  await expect(page.getByText("The lottery is in and the draft class is set.")).toBeVisible({
    timeout: 30_000,
  });

  // Advance through CPU picks and make the user's own picks until all 60
  // picks are resolved. Each branch waits a beat after its action - the
  // client message updates immediately on the server action's response,
  // but the page's server-computed phase prop lands a moment later via
  // Next's post-action revalidation, so checking phase immediately after
  // a click can race a stale render.
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
      // On the batch that finishes the draft, both "Resolved N picks." (the
      // client action message) and "The draft is complete..." (the new
      // server-computed phase) can be on the page at once - use .first()
      // rather than a strict-mode-sensitive combined text match.
      await expect(page.getByText(/Resolved \d+ pick|The draft is complete/).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(500);
    }
  }

  await expect(page.getByText("The draft is complete")).toBeVisible({ timeout: 15_000 });

  // "Pick N" also appears in the Scouting Board's "Drafted by ... (Pick N)"
  // annotations, so scope the count to the Draft Board panel specifically.
  const draftBoardText = await page.getByText("Draft Board").locator("..").textContent();
  const pickCount = (draftBoardText?.match(/Pick \d+/g) ?? []).length;
  expect(pickCount).toBe(60);

  // The Scouting Board should list all 60 prospects, every one now
  // showing as drafted.
  await expect(page.getByText("Scouting Board")).toBeVisible();
  const scoutingDraftedCount = ((await page.textContent("body"))?.match(/Drafted by/g) ?? [])
    .length;
  expect(scoutingDraftedCount).toBe(60);

  // The season shouldn't be advanceable until the draft finished - now
  // that it has, the offseason page should offer the advance button.
  await page.goto(`/leagues/${leagueId}/offseason`);
  await expect(page.getByText(/Advance to the .* season/)).toBeVisible({ timeout: 15_000 });
});
