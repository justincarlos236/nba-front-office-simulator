import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

const isWindows = process.platform === "win32";

/** Opens the whole job market for a user, so a spec can take any team. */
export function grantMaxReputation(email: string) {
  execFileSync("npx", ["tsx", "scripts/e2e-grant-reputation.ts", email], {
    stdio: "inherit",
    shell: isWindows,
  });
}

/**
 * Sign up, then take a specific job from the GM job market.
 *
 * Every browser spec starts this way, and each one names a team because its
 * later assertions depend on that team's real roster. Reputation is granted
 * out of band first so the choice is actually available - see
 * `scripts/e2e-grant-reputation.ts` for why that is setup rather than a
 * product change.
 */
export async function signUpAndTakeJob(
  page: Page,
  { email, name, team }: { email: string; name: string; team: string },
) {
  await page.goto("/sign-up");
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "correct-horse-battery-staple");
  await page.click('button[type="submit"]');

  await expect(page.getByRole("heading", { name: "The GM Job Market" })).toBeVisible({
    timeout: 20_000,
  });

  grantMaxReputation(email);
  await page.reload();

  await takeJob(page, team);
}

/** Take a named job from the market. Available teams render as buttons. */
export async function takeJob(page: Page, team: string) {
  await expect(page.getByRole("heading", { name: "The GM Job Market" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(team) }).click();
  // Bootstrapping a league writes ~500 rows, so this is a real wait. The h1 is
  // the dashboard's own team name - the nav renders the same text as a link,
  // hence the explicit level.
  await expect(page.getByRole("heading", { name: team, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}
