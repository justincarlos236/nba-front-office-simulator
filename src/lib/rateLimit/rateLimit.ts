/**
 * The storage half of rate limiting. Policy and window arithmetic live in
 * `./policy.ts` and are pure; this adds Postgres and the request's identity.
 *
 * Counters live in the database rather than in memory because Vercel runs each
 * request in whichever serverless instance is warm - an in-process counter
 * would be per-instance, so the effective limit would be the policy multiplied
 * by however many instances happened to be running. Postgres is the only state
 * every instance already shares.
 */
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decideRateLimit, type RateLimitPolicy, type RateLimitDecision } from "./policy";

/**
 * Fraction of calls that also sweep expired rows. Cleaning on every call would
 * double the write cost of every limited action to delete rows that harm
 * nothing by lingering a few minutes; never cleaning would make this table the
 * unbounded growth it exists to prevent.
 */
const SWEEP_PROBABILITY = 0.05;

/**
 * The caller's IP, for limits applied before there is a user to key on.
 *
 * `x-forwarded-for` is a client-supplied header and trivially spoofed in
 * general. On Vercel it is rewritten at the edge, so the leftmost entry is the
 * real client - but that is a property of the deployment, not of the protocol,
 * and it is why IP-keyed limits here are set loose enough that evading them
 * buys an attacker little.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("x-real-ip") ?? "unknown";
}

/**
 * Records an attempt and reports whether it is allowed.
 *
 * Recording happens whether or not the attempt is allowed, so a caller who
 * keeps hammering a closed window keeps it closed rather than walking straight
 * back in as the oldest hit expires.
 *
 * Fails OPEN. A limiter that takes the site down when the database hiccups has
 * caused more harm than the abuse it prevents - these limits guard against
 * cost and nuisance, not against anything catastrophic.
 */
export async function consumeRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
): Promise<RateLimitDecision> {
  const key = `${policy.name}:${identifier}`;
  const now = Date.now();

  try {
    const recent = await prisma.rateLimitHit.findMany({
      where: { key, createdAt: { gt: new Date(now - policy.windowMs) } },
      select: { createdAt: true },
    });

    const decision = decideRateLimit(
      recent.map((hit) => hit.createdAt.getTime()),
      policy,
      now,
    );

    await prisma.rateLimitHit.create({ data: { key } });

    if (Math.random() < SWEEP_PROBABILITY) {
      await prisma.rateLimitHit.deleteMany({
        where: { createdAt: { lt: new Date(now - policy.windowMs) } },
      });
    }

    return decision;
  } catch (error) {
    console.error(`[rateLimit] ${key} check failed, allowing through`, error);
    return { allowed: true, remaining: policy.limit, retryAfterMs: 0 };
  }
}

/** Convenience for the unauthenticated limits, which key on IP. */
export async function consumeRateLimitByIp(policy: RateLimitPolicy): Promise<RateLimitDecision> {
  return consumeRateLimit(policy, await clientIp());
}
