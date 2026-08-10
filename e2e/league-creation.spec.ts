import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

// Bootstrapping a league writes ~500 rows (30 teams, 497 players, contracts,
// contract years) across several batched queries - genuinely slower than a
// typical page load, so this test needs a longer timeout and must wait on
// real content rather than racing a URL change.
test.setTimeout(60_000);

test("sign up, start a franchise, and the cap sheet reflects real generated data", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "E2E GM",
    team: "Boston Celtics",
  });
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();
  const leagueUrl = page.url();

  // Visiting the dashboard while signed out must not leak roster/cap data.
  // The page redirects to sign-in rather than rendering anything, so asserting
  // the redirect is the stronger check - it lands us on the form below.
  await page.getByText("Sign out").click();
  await expect(page.getByText("Sign in")).toBeVisible();
  await page.goto(leagueUrl);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Cap position").first()).not.toBeVisible();

  // Signing back in should land on the leagues hub, showing this
  // franchise as a card (users can run multiple franchises now).
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: /Your franchises/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Boston Celtics" })).toBeVisible();

  await page
    .getByRole("link", { name: new RegExp("Boston Celtics") })
    .first()
    .click();
  await expect(page.getByText("Cap position").first()).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toBe(leagueUrl);
});
