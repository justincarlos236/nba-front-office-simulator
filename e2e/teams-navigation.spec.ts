import { test, expect } from "@playwright/test";

test("browsing from the league to a team roster to a player detail page", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "The League" })).toBeVisible();
  await expect(page.getByText("Denver Nuggets")).toBeVisible();

  await page.getByText("Denver Nuggets").click();
  await expect(page.getByRole("heading", { name: "Denver Nuggets" })).toBeVisible();
  await expect(page.getByText("Nikola Jokic")).toBeVisible();

  await page.getByText("Nikola Jokic").click();
  await expect(page.getByRole("heading", { name: "Nikola Jokic" })).toBeVisible();
  await expect(page.getByText("Valuation model output")).toBeVisible();
});
