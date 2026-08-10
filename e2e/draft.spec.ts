import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

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

  await signUpAndTakeJob(page, {
    email,
    name: "Draft E2E",
    team: "Boston Celtics",
  });

  const leagueId = new URL(page.url()).pathname.split("/")[2];
  fastForwardRegularSeason(leagueId);

  await page.goto(`/leagues/${leagueId}/draft`);
  await expect(page.getByText("Crown a champion in the playoffs before the draft.")).toBeVisible();

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
        .getByText(/NBA Champions/)
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }

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
  await expect(page.getByText(/NBA Champions/)).toBeVisible({ timeout: 30_000 });

  await page.goto(`/leagues/${leagueId}/draft`);
  await page.getByRole("link", { name: "Go to the Draft Lottery" }).click();
  await page.waitForURL(/\/draft\/lottery$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Start the Lottery" }).click();
  // Skip the animated reveal - the e2e test only needs the lottery to have
  // actually run and persisted a draft order, not to watch the suspense.
  await expect(page.getByRole("button", { name: "Skip to Results" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Skip to Results" }).click();
  await expect(page.getByText("Lottery Complete")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Go to the Draft", exact: true }).click();
  await page.waitForURL(/\/draft$/, { timeout: 15_000 });
  // The side panel opens on "My Board", which is empty in a fresh save, so
  // no prospect carries a Draft button there. The Prospects tab is the full
  // class and is where a pick actually gets made.
  await page.getByRole("button", { name: "Prospects", exact: true }).click();

  // Advance through CPU picks and make the user's own picks until all 60
  // picks are resolved. Each branch waits a beat after its action - the
  // client message updates immediately on the server action's response,
  // but the page's server-computed phase prop lands a moment later via
  // Next's post-action revalidation, so checking phase immediately after
  // a click can race a stale render.
  for (let i = 0; i < 15; i++) {
    if (
      await page
        .getByText("Every pick is in the books.")
        .isVisible()
        .catch(() => false)
    )
      break;

    // The broadcast header's "YOU'RE ON THE CLOCK" badge - only rendered
    // between reveals (never while a pick-reveal animation is active), so
    // this is a reliable turn signal to branch on.
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
      // The pick is irreversible, so it sits behind a confirmation.
      await page.getByRole("button", { name: "Make the pick" }).click();
      await expect(page.getByText(/You selected/)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);
    } else {
      const advanceButton = page.getByRole("button", { name: "Simulate to your next pick" });
      if (!(await advanceButton.isVisible().catch(() => false))) {
        await page.waitForTimeout(500);
        continue;
      }
      await advanceButton.click();
      // A batch reveal follows (PickRevealStage) - an animated broadcast with
      // auto-play, pause and speed controls. "Skip Ahead" fast-forwards it,
      // but the stage takes a moment to mount and a single click can land
      // before it exists, so keep skipping until the batch's own result
      // message lands. A single-pick batch has no controls at all, in which
      // case the loop simply falls through on the first check.
      const batchDone = page.getByText(/Resolved \d+ pick|Every pick is in the books\./).first();
      for (let s = 0; s < 12; s += 1) {
        if (await batchDone.isVisible().catch(() => false)) break;
        const skipButton = page.getByRole("button", { name: "Skip Ahead" });
        if (await skipButton.isEnabled({ timeout: 1_000 }).catch(() => false)) {
          await skipButton.click().catch(() => {});
        }
        await page.waitForTimeout(1_000);
      }
      await expect(batchDone).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500);
    }
  }

  await expect(page.getByText("Every pick is in the books.")).toBeVisible({ timeout: 15_000 });

  // "Pick N" also appears in the Prospect Board's "Drafted by ... (Pick N)"
  // annotations, so scope the count to the Draft Board panel specifically.
  // exact: true on the heading - "Draft Board" is also a substring of the
  // Prospect Board's "My Draft Board" bookmark-filter toggle. Two levels
  // up - the heading's immediate parent is just its own header row (next
  // to the "My Picks" toggle); the picks list is a sibling of that row.
  const draftBoardText = await page
    .getByRole("heading", { name: "Draft Board", exact: true })
    .locator("../..")
    .textContent();
  const pickCount = (draftBoardText?.match(/Pick \d+/g) ?? []).length;
  expect(pickCount).toBe(60);

  // The Prospect Board (default tab) should list all 60 prospects, every
  // one now showing as drafted.
  const scoutingDraftedCount = ((await page.textContent("body"))?.match(/Drafted by/g) ?? [])
    .length;
  expect(scoutingDraftedCount).toBe(60);

  // The season shouldn't be advanceable until the draft finished - now
  // that it has, the offseason page should offer the advance button.
  await page.goto(`/leagues/${leagueId}/offseason`);
  await expect(page.getByText(/Advance to the .* season/)).toBeVisible({ timeout: 15_000 });
});
