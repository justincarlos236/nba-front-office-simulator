import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * The two steps that decide whether a caller may touch a league.
 *
 * **Every export of a `"use server"` module is a callable POST endpoint**, with
 * no automatic authentication and no middleware gate in front of it, so each
 * one has to prove ownership itself. `docs/SERVER_ACTION_AUTH_AUDIT.md` A-P2-2:
 * that check was written out longhand in seven separate action files. All seven
 * agreed when measured, so this is not a repair - it removes the condition
 * under which the eighth copy drifts, and A-P1-1 in that same audit is what
 * happens when a file is written without one.
 *
 * Split into two primitives rather than one helper because the seven copies
 * differ in exactly one respect: the Prisma `include` each needs, and therefore
 * the type each returns. `draft.ts` wants `DRAFT_LEAGUE_INCLUDE`, `offseason.ts`
 * wants fan cultures, `financing.ts` wants no relations at all. Collapsing them
 * into a single loader would either flatten those types or need generics that
 * obscure the one line that matters. Each file keeps its own query; the
 * security decision lives here.
 */

/**
 * The signed-in caller's id, or a redirect to sign-in.
 *
 * Redirect rather than throw: an unauthenticated visitor has somewhere useful
 * to be sent, whereas a signed-in caller reaching for someone else's league
 * does not - see `assertLeagueOwned`.
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return session.user.id;
}

/**
 * Narrows a league loaded by id to one this user actually owns.
 *
 * **404-shaped, not 403-shaped.** "League not found" is deliberately the same
 * message for a league that does not exist and one belonging to somebody else,
 * so a caller cannot enumerate ids to discover which saves are real. Every
 * copy of this check already behaved that way; stating it once makes it a rule
 * rather than a coincidence.
 *
 * Generic over the row so each caller keeps the relations it asked for, and
 * written as an assertion rather than a function returning the narrowed value:
 * callers already hold the league in a `const` from their own query, and
 * `asserts` narrows that binding in place instead of making every call site
 * restructure around a return value it does not need.
 */
export function assertLeagueOwned<T extends { ownerId: string }>(
  league: T | null,
  userId: string,
): asserts league is T {
  if (!league || league.ownerId !== userId) throw new Error("League not found");
}
