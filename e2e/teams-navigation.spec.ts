import { test, expect } from "@playwright/test";

test("browsing from the league to a team roster to a player profile drawer", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "The League" })).toBeVisible();
  // The card is a link wrapping a heading, so click the link explicitly -
  // a bare text match can land on the heading and never navigate, and the
  // index page's own heading would then satisfy the assertion below.
  await page.getByRole("link", { name: /Denver Nuggets/ }).click();
  await expect(page.getByRole("heading", { name: "Denver Nuggets", level: 1 })).toBeVisible();
  await expect(page.getByText("Nikola Jokic")).toBeVisible();

  // Clicking a player anywhere in the app opens the shared profile drawer
  // in place, rather than navigating to a new page - the same experience
  // regardless of where the player was clicked.
  await page.getByText("Nikola Jokic").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Nikola Jokic" })).toBeVisible();
  await expect(page).toHaveURL(/\/teams\/DEN$/); // still on the team page, not navigated away

  await dialog.getByRole("button", { name: "Ratings" }).click();
  await expect(dialog.getByText(/Live-computed performance score/)).toBeVisible();
});
