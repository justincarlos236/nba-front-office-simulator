import { test, expect } from "@playwright/test";
import { signUpAndTakeJob, takeJob } from "./helpers";

// Bootstrapping a league writes ~500 rows - this test bootstraps two.
test.setTimeout(90_000);

test("run two franchises at once and switch between them from the hub", async ({ page }) => {
  const email = `multi-league-e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "Multi League E2E",
    team: "Boston Celtics",
  });
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  const firstLeagueUrl = page.url();

  // Start a second franchise with a different team.
  await page.getByText("My Leagues").click();
  await expect(page.getByRole("heading", { name: /Your franchises/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();

  await page.getByText("Start a new franchise").click();
  await expect(page.getByRole("heading", { name: "The GM Job Market" })).toBeVisible();
  // The team already running elsewhere should be flagged, not blocked.
  await expect(page.getByText("You already run this team elsewhere")).toBeVisible();

  await takeJob(page, "Los Angeles Lakers");
  await expect(page.getByRole("heading", { name: "Los Angeles Lakers" })).toBeVisible();
  const secondLeagueUrl = page.url();
  expect(secondLeagueUrl).not.toBe(firstLeagueUrl);

  // The hub should now list both franchises, and clicking one switches to it.
  await page.getByText("My Leagues").click();
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Los Angeles Lakers" })).toBeVisible();

  await page
    .getByRole("link", { name: new RegExp("Boston Celtics") })
    .first()
    .click();
  await expect(page).toHaveURL(firstLeagueUrl);
  await expect(page.getByText("Cap position").first()).toBeVisible({ timeout: 20_000 });

  await page.getByText("My Leagues").click();
  await page
    .getByRole("link", { name: new RegExp("Los Angeles Lakers") })
    .first()
    .click();
  await expect(page).toHaveURL(secondLeagueUrl);
  await expect(page.getByText("Cap position").first()).toBeVisible({ timeout: 20_000 });
});
