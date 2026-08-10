import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("propose and execute a legal trade, and the rosters actually swap", async ({ page }) => {
  const email = `trade-e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "Trade E2E",
    team: "Boston Celtics",
  });

  // The dashboard offers this in both the section header and the body; either
  // goes to the same place, so take the first rather than depending on layout.
  await page.getByRole("link", { name: "Propose a trade" }).first().click();
  await expect(page.getByRole("heading", { name: "Who are you calling?" })).toBeVisible();
  // Target the Nets by name rather than "whichever team is first" - the
  // list has no meaningful order guarantee to depend on. The partner list is
  // a table whose link cell reads "Open", so scope to that team's own row.
  await page
    .getByRole("row", { name: /Brooklyn Nets/ })
    .getByRole("link", { name: "Open" })
    .click();
  await expect(page.getByText("Select players and draft picks on each side")).toBeVisible();

  // Player names/avatars now open the profile drawer instead (Phase 13c) -
  // toggle selection via the checkbox itself, which stops that propagation.
  await page.getByLabel("Select Payton Pritchard for this trade").check();
  await page.getByLabel("Select Day'Ron Sharpe for this trade").check();
  await expect(page.getByText("Trade Financial Check: Valid")).toBeVisible();
  await expect(page.getByText("This trade works financially.")).toBeVisible();

  // Executing is irreversible, so it sits behind a two-step confirmation.
  await page.getByRole("button", { name: "Execute trade" }).click();
  await page.getByRole("button", { name: "Execute the trade" }).click();
  await expect(page.getByText("Cap position").first()).toBeVisible({ timeout: 15_000 });

  // The Roster page is the canonical "who is on this team" surface, so the
  // swap is checked there rather than on the dashboard. It is a rotation
  // board rather than a table, and nothing else on the page names players,
  // so a plain text match is unambiguous here.
  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page.getByRole("heading", { name: "Roster", level: 1 })).toBeVisible();
  await expect(page.getByText("Day'Ron Sharpe")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Payton Pritchard")).not.toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("heading", { name: "Transactions & News" })).toBeVisible();
  await expect(
    page.getByText(
      /Boston Celtics traded Payton Pritchard to the Brooklyn Nets for Day'Ron Sharpe/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Trade", { exact: true })).toBeVisible();
});
