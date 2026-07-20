import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

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

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Playoffs E2E");
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

  await page.goto(`/leagues/${leagueId}/playoffs`);
  await expect(page.getByRole("heading", { name: /Playoffs/ })).toBeVisible();

  await page.getByText("Start playoffs (simulate play-in)").click();
  await expect(page.getByText(/Round 1 matchups are set/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Play-In Tournament" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();

  // Advance the bracket one round at a time: Round 1 -> Conf Semis -> Conf
  // Finals -> NBA Finals, until a champion is crowned.
  for (let i = 0; i < 4; i++) {
    if (
      await page
        .getByText("League Champion")
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

  await page.goto(`/leagues/${leagueId}/standings`);
  await expect(page.getByText("Recent Results")).toBeVisible();
});
