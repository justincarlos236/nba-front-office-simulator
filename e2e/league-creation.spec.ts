import { test, expect } from "@playwright/test";

// Bootstrapping a league writes ~500 rows (30 teams, 497 players, contracts,
// contract years) across several batched queries - genuinely slower than a
// typical page load, so this test needs a longer timeout and must wait on
// real content rather than racing a URL change.
test.setTimeout(60_000);

test("sign up, start a franchise, and the cap sheet reflects real generated data", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "E2E GM");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');

  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  const leagueUrl = page.url();

  // Visiting the dashboard while signed out must not leak roster/cap data.
  await page.getByText("Sign out").click();
  await expect(page.getByText("Sign in")).toBeVisible();
  await page.goto(leagueUrl);
  await expect(page.getByText("Committed salary")).not.toBeVisible();

  // Signing back in should land straight on the existing league, not the
  // team picker (one league per user).
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toBe(leagueUrl);
});
