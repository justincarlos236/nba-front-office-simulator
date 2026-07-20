import { test, expect } from "@playwright/test";

// Bootstrapping a league writes ~500 rows - this test bootstraps two.
test.setTimeout(90_000);

test("run two franchises at once and switch between them from the hub", async ({ page }) => {
  const email = `multi-league-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Multi League E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  // First franchise: Boston Celtics. Wait for "Committed salary" (only on
  // the dashboard, never the team picker) - the team name also appears as
  // a heading on the picker's own tiles, so asserting on that alone can
  // pass before navigation actually completes.
  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  const firstLeagueUrl = page.url();

  // Start a second franchise with a different team.
  await page.getByText("My Leagues").click();
  await expect(page.getByRole("heading", { name: /Your franchises/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();

  await page.getByText("Start a new franchise").click();
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible();
  // The team already running elsewhere should be flagged, not blocked.
  await expect(page.getByText("You already run this team elsewhere")).toBeVisible();

  await page.getByText("Los Angeles Lakers").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Los Angeles Lakers" })).toBeVisible();
  const secondLeagueUrl = page.url();
  expect(secondLeagueUrl).not.toBe(firstLeagueUrl);

  // The hub should now list both franchises, and clicking one switches to it.
  await page.getByText("My Leagues").click();
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Los Angeles Lakers" })).toBeVisible();

  await page.getByRole("heading", { name: "Boston Celtics" }).click();
  await expect(page).toHaveURL(firstLeagueUrl);
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 20_000 });

  await page.getByText("My Leagues").click();
  await page.getByRole("heading", { name: "Los Angeles Lakers" }).click();
  await expect(page).toHaveURL(secondLeagueUrl);
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 20_000 });
});
