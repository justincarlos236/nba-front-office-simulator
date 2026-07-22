import { test, expect } from "@playwright/test";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("simulate games and see standings update", async ({ page }) => {
  const email = `sim-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Sim E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/·\s*0-0/)).toBeVisible();

  await page.getByText("Standings").click();
  await expect(page.getByText("Eastern Conference")).toBeVisible();
  await expect(page.getByText("Western Conference")).toBeVisible();
  await expect(page.getByText("Boston Celtics")).toBeVisible();

  const remainingBefore = await page.getByText(/games remaining on your schedule/).textContent();
  const gamesBefore = Number(remainingBefore?.match(/(\d+) games/)?.[1]);

  await page.getByText("Sim next 10 games").click();
  await expect(page.getByText(/Played 10 of your team's games/)).toBeVisible({ timeout: 30_000 });

  const remainingAfter = await page.getByText(/games remaining on your schedule/).textContent();
  const gamesAfter = Number(remainingAfter?.match(/(\d+) games/)?.[1]);
  expect(gamesBefore - gamesAfter).toBe(10);

  await page.getByText("My Leagues").first().click();
  await expect(page.getByRole("heading", { name: /Your franchises/ })).toBeVisible();
  await page.getByRole("heading", { name: "Boston Celtics" }).click();
  await expect(page.getByText("Committed salary")).toBeVisible();
  // The user's own team's record should no longer necessarily be 0-0 - just
  // confirm the record label rendered without crashing the page.
  await expect(page.getByText(/season ·/)).toBeVisible();
});
