import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("sign a free agent to a minimum deal, and reject an offer bigger than any exception allows", async ({
  page,
}) => {
  const email = `fa-e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "FA E2E",
    team: "Boston Celtics",
  });

  // The nav link's text ("Free agents") can collide with the dashboard's
  // Under-the-Cap description ("...can freely sign available free
  // agents.") depending on the team's cap situation - target the link
  // role directly rather than a bare text match, same pattern used below
  // for "Offer contract".
  await page.getByRole("link", { name: "Free agents" }).click();
  await expect(page.getByRole("heading", { name: "Free agents", level: 1 })).toBeVisible();
  await expect(page.getByText("Your cap space")).toBeVisible();

  // The first cell's PlayerChip renders an avatar (initials fallback text
  // when there's no real photo) immediately before the name - a plain
  // .textContent() on the cell can concatenate the two (e.g. "DNDaishen
  // Nix"), so extract just the name's own <span> instead.
  const signedPlayerName = await page
    .locator("tbody tr")
    .first()
    .locator("td")
    .first()
    .locator("span")
    .last()
    .textContent();

  // Target the link role directly rather than a bare text match - hundreds
  // of free agents means `getByText("Offer contract")` resolves against a
  // huge match set (every ancestor element containing that text, not just
  // the link itself), which is slower to resolve than necessary.
  await page.getByRole("link", { name: "Offer", exact: true }).first().click();
  // A real page navigation to a freshly server-rendered page (cap sheet,
  // signing exception usage) - the default 5s assertion timeout is tight
  // for that against a remote database, same reasoning as the season-advance
  // timeout above.
  await expect(page.getByText("First-year salary")).toBeVisible({ timeout: 15_000 });

  // An offer far beyond any exception should be rejected.
  await page.locator('input[type="number"]').fill("80000000");
  await expect(page.getByRole("button", { name: "Sign player" })).toBeDisabled();

  // A true minimum-salary offer (at or below the 2023-24 empty-roster-charge
  // threshold, $1,157,000 - src/lib/cap/constants.ts) is always legal
  // regardless of cap situation. $2M was previously used here, but that
  // only ever cleared via ordinary cap space, not the minimum-contract
  // carve-out - a real, correctly-rostered team (post roster-assignment
  // fix) isn't guaranteed to have that much free cap room.
  await page.locator('input[type="number"]').fill("1100000");
  await expect(page.getByText(/Legal via/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign player" })).toBeEnabled();

  // Signing is irreversible, so it sits behind a two-step confirmation.
  await page.getByRole("button", { name: "Sign player" }).click();
  await page.getByRole("button", { name: "Confirm signing" }).click();
  // Signing redirects to the freshly executed contract, not back to the
  // dashboard - the deal itself is the confirmation.
  await expect(page.getByText("Contract executed")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("heading", { name: "Transactions & News" })).toBeVisible();
  const escapedName = signedPlayerName!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page.getByText(new RegExp(`signed ${escapedName} to a`))).toBeVisible();
  await expect(page.getByText("Signing", { exact: true })).toBeVisible();
});
