import { test, expect } from "@playwright/test";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("propose and execute a legal trade, and the rosters actually swap", async ({ page }) => {
  const email = `trade-e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.fill('input[name="name"]', "Trade E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Pick your team" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText("Boston Celtics").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 30_000 });

  await page.getByText("Propose a trade").click();
  await expect(page.getByRole("heading", { name: "Propose a trade with..." })).toBeVisible();
  // Target the Nets by name rather than "whichever team is first" - the
  // list has no meaningful order guarantee to depend on.
  await page.locator("a[href*='trades/new?with=']", { hasText: "Brooklyn Nets" }).click();
  await expect(page.getByText("Select players and draft picks on each side")).toBeVisible();

  // Click the player name labels directly, as a real user would - clicking
  // a container div near (but not on) the checkbox doesn't toggle it.
  await page.getByText("Payton Pritchard", { exact: true }).click();
  await page.getByText("Lonnie Walker IV", { exact: true }).click();
  await expect(page.getByText("Trade Financial Check: Valid")).toBeVisible();
  await expect(page.getByText("This trade works financially.")).toBeVisible();

  await page.getByText("Execute trade").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 15_000 });

  // Scoped to the roster table, not the whole page - the dashboard's
  // "Recent activity" card also mentions both names in the trade's
  // description text, which would otherwise make these ambiguous.
  const rosterTable = page.locator("table");
  await expect(rosterTable.getByText("Lonnie Walker IV")).toBeVisible();
  await expect(rosterTable.getByText("Payton Pritchard")).not.toBeVisible();

  await page.getByText("News").click();
  await expect(page.getByRole("heading", { name: "Transactions & News" })).toBeVisible();
  await expect(
    page.getByText(
      /Boston Celtics traded Payton Pritchard to the Brooklyn Nets for Lonnie Walker IV/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Trade", { exact: true })).toBeVisible();
});
