import { toUserFacingError, type UserFacingError } from "./userFacing";

/**
 * Carries an action's refusal across the server/client boundary intact.
 *
 * **Next.js redacts the message of any error thrown out of a server action in
 * a production build**, replacing it with a generic string and a digest. Every
 * action in this codebase reported by throwing, so on the deployed site a cap
 * ruling, a full roster, a closed trade deadline and a player holding out for
 * more all reached the user as the same sentence: "That didn't go through.
 * Nothing was changed." It read as a broken feature rather than a rule being
 * applied - which is exactly how it was reported.
 *
 * A *returned* value crosses the boundary untouched. `reportFailures` catches
 * the throw on the server, where the message is still real, translates it with
 * the table in `userFacing.ts`, and returns it.
 *
 * Wrapping rather than rewriting is deliberate. There are ~98 `throw new
 * Error` sites across seventeen action files, each with a message written to
 * be matched by that table. Converting them by hand would have meant restating
 * ninety-eight messages, with the chance of changing one in passing; wrapping
 * the body preserves every message exactly and moves only where it is caught.
 */
export type ActionFailure = { ok: false; error: UserFacingError };

export function isActionFailure(value: unknown): value is ActionFailure {
  return typeof value === "object" && value !== null && (value as ActionFailure).ok === false;
}

/**
 * Errors the framework throws as control flow, which must keep travelling.
 *
 * `redirect()` and `notFound()` signal by throwing, and both tag the error with
 * a `digest` beginning `NEXT_`. Swallowing one turns a successful action into a
 * silent no-op - the user clicks Confirm, nothing happens, and no error is
 * shown either. This check is the reason the wrapper is safe to apply broadly.
 */
function isFrameworkSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * Runs an action body, returning any refusal instead of throwing it.
 *
 * The unmatched case is still logged. Previously an unexpected fault surfaced
 * in the platform logs because Next logged the throw itself; now that it is
 * caught, losing it would trade a visible crash for a quiet "that didn't go
 * through" with nothing to diagnose from.
 */
export async function reportFailures<T>(run: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await run();
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    console.error("[action]", error);
    return { ok: false, error: toUserFacingError(error) };
  }
}
