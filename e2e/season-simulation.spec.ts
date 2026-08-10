import { test, expect } from "@playwright/test";
import { signUpAndTakeJob } from "./helpers";

// Bootstrapping a league is slow (~500 rows) - see league-creation.spec.ts.
test.setTimeout(60_000);

test("simulate games and see standings update", async ({ page }) => {
  const email = `sim-e2e-${Date.now()}@example.com`;

  await signUpAndTakeJob(page, {
    email,
    name: "Sim E2E",
    team: "Boston Celtics",
  });
  // The dashboard renders the record with an en dash, not a hyphen.
  await expect(page.getByText(/0–0/)).toBeVisible();

  await page.getByRole("link", { name: "Standings", exact: true }).first().click();
  await expect(page.getByText("Eastern Conference")).toBeVisible();
  await expect(page.getByText("Western Conference")).toBeVisible();
  // Scoped to the standings table cell specifically - the persistent
  // in-league nav's own team-name link also renders "Boston Celtics" on
  // every page now, so a bare text match is ambiguous here.
  await expect(page.getByRole("cell", { name: "Boston Celtics" })).toBeVisible();

  // The sim controls with a running remaining-games count live on the
  // Schedule page; the dashboard's own pair is a shortcut without one.
  await page.getByRole("link", { name: "Schedule", exact: true }).first().click();
  const remainingBefore = await page.getByText(/games remaining on your schedule/).textContent();
  const gamesBefore = Number(remainingBefore?.match(/(\d+) games/)?.[1]);

  await page.getByRole("button", { name: "Sim next 10 games" }).click();
  // A batch stops early when it reaches the All-Star break or something that
  // needs a decision, so assert against what the page says it played rather
  // than assuming a full ten.
  const played = page.getByText(/Played \d+ of your team's game/);
  await expect(played).toBeVisible({ timeout: 30_000 });
  const playedCount = Number((await played.textContent())?.match(/Played (\d+)/)?.[1]);
  expect(playedCount).toBeGreaterThan(0);
  expect(playedCount).toBeLessThanOrEqual(10);

  const remainingAfter = await page.getByText(/games remaining on your schedule/).textContent();
  const gamesAfter = Number(remainingAfter?.match(/(\d+) games/)?.[1]);
  // The counter must move, and by no more than the batch size. Exact
  // equality is too strict: a batch that stops early for the All-Star
  // break or a front-office decision reports what it played, while the
  // counter reflects the schedule as a whole.
  expect(gamesAfter).toBeLessThan(gamesBefore);
  expect(gamesBefore - gamesAfter).toBeLessThanOrEqual(10);

  await page.getByText("My Leagues").first().click();
  await expect(page.getByRole("heading", { name: /Your franchises/ })).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp("Boston Celtics") })
    .first()
    .click();
  await expect(page.getByText("Cap position").first()).toBeVisible();
  // The user's own team's record should no longer necessarily be 0-0 - just
  // confirm the record label rendered without crashing the page.
  await expect(page.getByText(/\d{4}-\d{2} season/)).toBeVisible();
});
