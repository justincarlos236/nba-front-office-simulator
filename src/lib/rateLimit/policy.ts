/**
 * Rate-limit policy: what is limited, how hard, and how a breach is described.
 *
 * Pure - no database, no request context - so the window arithmetic and the
 * user-facing messages are testable without a running Postgres. The storage
 * side lives in `./rateLimit.ts`.
 *
 * Every limit here is deliberately loose. These exist to stop scripted abuse
 * (unlimited signups are what make the 5-league cap meaningless), not to
 * police normal play. A limit a real person can hit by accident is a bug, so
 * where the two goals conflict, these err toward letting abuse through.
 *
 * Simulation and season advance are deliberately NOT limited. They are the
 * core loop - simming repeatedly is the entire game - and the compute cost
 * they represent is better addressed by connection pooling and a paid Neon
 * tier than by interrupting someone mid-season.
 */

export interface RateLimitPolicy {
  /** Prefix for the stored key, and what appears in logs. */
  readonly name: string;
  /** How many actions are allowed inside the window. */
  readonly limit: number;
  /** Length of the sliding window. */
  readonly windowMs: number;
  /** Shown to the user on refusal. Should say what to do, not just "no". */
  readonly message: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Account creation, keyed by IP. The abuse vector: the per-account league cap
 * bounds storage per user but nothing bounds users, so unlimited signups mean
 * unlimited storage.
 *
 * Five an hour is high for a person and low for a script. It is set this way
 * on purpose because IP is a blunt identifier - friends behind one household
 * router, or a university NAT, share it - and locking out a group of real
 * players is worse than admitting a slow attacker.
 */
export const SIGN_UP_POLICY: RateLimitPolicy = {
  name: "signup",
  limit: 5,
  windowMs: HOUR,
  message: "Too many accounts created from this network. Try again in an hour.",
};

/**
 * Sign-in attempts, keyed by IP. The one limit here that is about security
 * rather than cost: without it, credential stuffing against this endpoint is
 * free and unbounded.
 *
 * Ten in fifteen minutes tolerates a person genuinely misremembering their
 * password several times over, which is the common case this must not break.
 */
export const SIGN_IN_POLICY: RateLimitPolicy = {
  name: "signin",
  limit: 10,
  windowMs: 15 * MINUTE,
  message: "Too many sign-in attempts. Wait a few minutes and try again.",
};

/**
 * League creation, keyed by user id rather than IP - the user is already
 * authenticated here, so the precise identifier is available and IP would only
 * add false positives.
 *
 * `MAX_LEAGUES_PER_USER` already bounds how many leagues one account holds;
 * this bounds the *rate*, which is what a create-delete-create loop would
 * otherwise exploit to churn storage without ever exceeding the cap.
 */
export const LEAGUE_CREATION_POLICY: RateLimitPolicy = {
  name: "league-create",
  limit: 10,
  windowMs: HOUR,
  message: "You're creating franchises very quickly. Try again in a little while.",
};

export interface RateLimitDecision {
  allowed: boolean;
  /** Actions still available in the current window. Zero when refused. */
  remaining: number;
  /** How long until the window has room again. Zero when allowed. */
  retryAfterMs: number;
}

/**
 * Decides from the timestamps of prior hits inside the window.
 *
 * A sliding window rather than a fixed one: fixed windows let a caller spend
 * the whole allowance at the end of one bucket and the whole allowance again
 * at the start of the next, which is twice the intended rate at the boundary.
 *
 * `retryAfterMs` is measured from the OLDEST hit in the window, since that is
 * the one whose expiry frees a slot.
 */
export function decideRateLimit(
  hitTimestamps: readonly number[],
  policy: RateLimitPolicy,
  now: number,
): RateLimitDecision {
  const windowStart = now - policy.windowMs;
  const inWindow = hitTimestamps.filter((t) => t > windowStart).sort((a, b) => a - b);

  if (inWindow.length < policy.limit) {
    return {
      allowed: true,
      remaining: policy.limit - inWindow.length - 1,
      retryAfterMs: 0,
    };
  }

  const oldest = inWindow[0];
  return {
    allowed: false,
    remaining: 0,
    retryAfterMs: Math.max(0, oldest + policy.windowMs - now),
  };
}
