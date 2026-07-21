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

  // The nav link's text ("Free agents") can collide with the dashboard's
  // Under-the-Cap description ("...can freely sign available free
  // agents.") depending on the team's cap situation - target the link
  // role directly rather than a bare text match, same pattern used below
  // for "Offer contract".
  await page.getByRole("link", { name: "Free agents" }).click();
  await expect(page.getByText(/unsigned players/)).toBeVisible();

  const signedPlayerName = await page
    .locator("tbody tr")
    .first()
    .locator("td")
    .first()
    .textContent();

  // Target the link role directly rather than a bare text match - hundreds
  // of free agents means `getByText("Offer contract")` resolves against a
  // huge match set (every ancestor element containing that text, not just
  // the link itself), which is slower to resolve than necessary.
  await page.getByRole("link", { name: "Offer contract" }).first().click();
  // A real page navigation to a freshly server-rendered page (cap sheet,
  // signing exception usage) - the default 5s assertion timeout is tight
  // for that against a remote database, same reasoning as the season-advance
  // timeout above.
  await expect(page.getByText("First-year salary")).toBeVisible({ timeout: 15_000 });

  // An offer far beyond any exception should be rejected.
  await page.locator('input[type="number"]').fill("80000000");
  await expect(page.getByText("Sign player")).toBeDisabled();

  // A true minimum-salary offer (at or below the 2023-24 empty-roster-charge
  // threshold, $1,157,000 - src/lib/cap/constants.ts) is always legal
  // regardless of cap situation. $2M was previously used here, but that
  // only ever cleared via ordinary cap space, not the minimum-contract
  // carve-out - a real, correctly-rostered team (post roster-assignment
  // fix) isn't guaranteed to have that much free cap room.
  await page.locator('input[type="number"]').fill("1100000");
  await expect(page.getByText(/Legal via/)).toBeVisible();
  await expect(page.getByText("Sign player")).toBeEnabled();

  await page.getByText("Sign player").click();
  await expect(page.getByText("Committed salary")).toBeVisible({ timeout: 15_000 });

  await page.getByText("News").click();
  await expect(page.getByRole("heading", { name: "Transactions & News" })).toBeVisible();
  const escapedName = signedPlayerName!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page.getByText(new RegExp(`signed ${escapedName} to a`))).toBeVisible();
  await expect(page.getByText("Signing", { exact: true })).toBeVisible();
});
