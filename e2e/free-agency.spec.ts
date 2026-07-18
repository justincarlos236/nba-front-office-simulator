import { test, expect } from "@playwright/test";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("sign a free agent to a minimum deal, and reject an offer bigger than any exception allows", async ({
  page,
}) => {
  const email = `fa-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "FA E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });

  await page.getByText("Free agents").click();
  await expect(page.getByText(/unsigned players/)).toBeVisible();

  await page.getByText("Offer contract").first().click();
  await expect(page.getByText("First-year salary")).toBeVisible();

  // An offer far beyond any exception should be rejected.
  await page.locator('input[type="number"]').fill("80000000");
  await expect(page.getByText("Sign player")).toBeDisabled();

  // A minimum-salary offer is always legal, regardless of cap situation.
  await page.locator('input[type="number"]').fill("2000000");
  await expect(page.getByText(/Legal via/)).toBeVisible();
  await expect(page.getByText("Sign player")).toBeEnabled();

  await page.getByText("Sign player").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 15_000 });
});
